/**
 * CRUD et statuts des rondes en PostgreSQL.
 *
 * Lots exceptionnels : `entriesBatch.js`. Helpers : `entriesShared.js`.
 *
 * @module electron/store/domains/ronde/entries
 */

const interventionDomain = require("../intervention");
const { autoCloseExpiredExceptionalRondes } = require("./autoClose");
const { mapRondeRow, toRondeAuditSnapshot, RONDE_ENTRY_SELECT, RONDE_ENTRY_SELECT_R, requireEntryId } = require("./mapping");
const { requireRondePersistence } = require("./persistence");
const { assertOptimisticLock } = require("../data/optimisticLock");
const { generateEntityId } = require("../../core/ids");
const { allocateNextDailyCode } = require("../../core/dailyEntryCode");
const {
  isPassagePast,
  isRondeManagerRole,
  assertPlannedClosureAllowed
} = require("./passageRules");
const {
  INSERT_SQL,
  SOURCES,
  PLANNED_SLOT_KEY_RE,
  normalizeRondeBody,
  getRondeById,
  resolveRondeDailyCodeDayIso,
  normalizePlanningSnapshot,
  ensurePlannedMeta,
  attachLinkedGardiennageIds
} = require("./entriesShared");

/**
 * Liste les rondes après clôture automatique.
 *
 * @param {import('../../../userStore')} store
 * @param {{requesterRole:string}} payload
 * @returns {Promise<object[]>}
 */
async function listRondes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireRondePersistence(store, "ronde:list");
  await autoCloseExpiredExceptionalRondes(store);
  const rows = await db.all(
    `SELECT ${RONDE_ENTRY_SELECT_R}, m.label AS motif_type_label,
            m.requires_free_text AS motif_type_requires_free_text,
            d.requested_at AS batch_delete_requested_at,
            d.requested_by AS batch_delete_requested_by,
            d.reason AS batch_delete_reason,
            d.entry_ids_json AS batch_delete_entry_ids_json
     FROM ronde_entries r
     LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
     LEFT JOIN ronde_batch_delete_requests d
       ON d.request_batch_id = r.request_batch_id AND d.status = 'PENDING'
     ORDER BY r.request_date DESC, r.id DESC`,
    []
  );
  const mapped = rows.map((row) => mapRondeRow(row, store));
  const withLinks = await attachLinkedGardiennageIds(db, mapped);
  if (!isRondeManagerRole(requesterRole)) {
    return withLinks.filter((entry) => !entry.batchDeleteRequestedAt);
  }
  return withLinks;
}

/** Clause SQL : ronde contractuelle / planifiée (alignée onglet « Ronde contractuelle »). */
const CONTRACTUAL_RONDE_SQL = `(
  source = 'PLANIFIE'
  OR NULLIF(BTRIM(planned_profile_id), '') IS NOT NULL
  OR NULLIF(BTRIM(planned_round_kind), '') IS NOT NULL
  OR origin_kind = 'TELESURVEILLANCE'
)`;

/**
 * Compte les rondes en cours pour la journée (badges sidebar et onglets).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, todayIso: string }} payload
 * @returns {Promise<{ total: number, contractual: number, exceptional: number }>}
 */
async function getRondeTodayInProgressCounts(store, { requesterRole, todayIso }) {
  store.ensureDataReaderRole(requesterRole);
  const day = String(todayIso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    store.fail("ronde:todayInProgressCount", "Date du jour invalide.", "RONDE_BADGE_DATE_INVALID");
  }
  const db = requireRondePersistence(store, "ronde:todayInProgressCount");
  await autoCloseExpiredExceptionalRondes(store);
  const baseWhere = `status = 'EN_COURS' AND request_date = ?`;
  const pendingDeleteExclude = !isRondeManagerRole(requesterRole)
    ? ` AND NOT EXISTS (
          SELECT 1 FROM ronde_batch_delete_requests d
          WHERE d.request_batch_id = ronde_entries.request_batch_id AND d.status = 'PENDING'
            AND (
              NULLIF(BTRIM(COALESCE(d.entry_ids_json, '')), '') IS NULL
              OR d.entry_ids_json::jsonb @> jsonb_build_array(ronde_entries.id)
            )
        )`
    : "";
  const contractualRow = await db.get(
    `SELECT COUNT(*) AS count FROM ronde_entries WHERE ${baseWhere} AND ${CONTRACTUAL_RONDE_SQL}${pendingDeleteExclude}`,
    [day]
  );
  const exceptionalRow = await db.get(
    `SELECT COUNT(*) AS count FROM ronde_entries WHERE ${baseWhere} AND NOT ${CONTRACTUAL_RONDE_SQL}${pendingDeleteExclude}`,
    [day]
  );
  const contractual = Number(contractualRow?.count || 0);
  const exceptional = Number(exceptionalRow?.count || 0);
  return { total: contractual + exceptional, contractual, exceptional };
}

/**
 * Crée une ronde de manière idempotente.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function createRonde(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const entryId = requireEntryId(store, payload, "ronde:create");
  const db = requireRondePersistence(store, "ronde:create");
  const source = String(payload.source || "URGENCE").trim().toUpperCase();
  if (!SOURCES.has(source)) store.fail("ronde:validate", "Source de ronde invalide.", "RONDE_SOURCE_INVALID");
  const planned = await ensurePlannedMeta(store, db, source, payload.plannedProfileId, payload.plannedRoundKind);
  const normalized = await normalizeRondeBody(store, db, payload);
  const originInterventionId = String(payload.originInterventionId || "").trim() || null;
  if (originInterventionId && !await interventionDomain.hasInterventionEntry(store, originInterventionId)) {
    store.fail("ronde:create", "Intervention liée introuvable.", "RONDE_ORIGIN_INTERVENTION_NOT_FOUND");
  }
  const requestBatchIdForLink = source !== "PLANIFIE"
    ? String(payload.requestBatchId || "").trim().slice(0, 48) || ""
    : "";
  if (originInterventionId) {
    const alreadyLinked = await db.get(
      `SELECT id FROM ronde_entries
       WHERE origin_intervention_id = ?
         AND status <> 'ANNULE'
         AND NOT (? <> '' AND request_batch_id = ?)
       LIMIT 1`,
      [originInterventionId, requestBatchIdForLink, requestBatchIdForLink]
    );
    if (alreadyLinked) {
      store.fail(
        "ronde:create",
        "Une ronde liée existe déjà pour cette intervention. Merci de la modifier.",
        "RONDE_INTERVENTION_ALREADY_LINKED"
      );
    }
  }
  const statusInput = String(payload.initialStatus || "EN_COURS").trim().toUpperCase();
  const status = ["EN_COURS", "CLOTURE", "ANNULE"].includes(statusInput) ? statusInput : "EN_COURS";
  const cancellationReason = String(payload.cancellationReason || "").trim();
  if (status === "ANNULE" && !cancellationReason) {
    store.fail("ronde:validate", "Le motif d'annulation est obligatoire.", "RONDE_CANCEL_REASON_REQUIRED");
  }
  const requestBatchId = source !== "PLANIFIE"
    ? String(payload.requestBatchId || "").trim().slice(0, 48) || null
    : null;
  const snapshotJson = normalizePlanningSnapshot(payload.requestPlanningSnapshotJson, source, store);
  if (status === "CLOTURE" && source === "PLANIFIE") {
    assertPlannedClosureAllowed(store, "ronde:create", {
      source,
      request_date: normalized.requestDate,
      horaires_demande_obs: normalized.horairesDemandeObs,
      request_planning_snapshot_json: snapshotJson,
      report: normalized.report,
      arrival_time: normalized.arrivalTime,
      departure_time: normalized.departureTime
    });
  }
  const insertParams = [
    entryId, null, null, source, originInterventionId, normalized.siteId,
    normalized.siteDisplay, normalized.requestDate, normalized.motifTypeId,
    normalized.motifCategorySnapshot, normalized.motifOther || null,
    normalized.horairesDemandeObs || null, normalized.originKind,
    normalized.originDetail || null, normalized.intervenantId,
    normalized.intervenantName, normalized.arrivalTime || null,
    normalized.departureTime || null, normalized.durationMinutes,
    normalized.workOrderNumber || null, normalized.report || null,
    JSON.stringify(normalized.closureCustomValues), planned.plannedProfileId,
    planned.plannedRoundKind,
    source === "PLANIFIE" && PLANNED_SLOT_KEY_RE.test(String(payload.plannedSlotKey || "").trim())
      ? String(payload.plannedSlotKey).trim().slice(0, 120) : null,
    snapshotJson,
    requestBatchId, status, status === "ANNULE" ? cancellationReason : null,
    null
  ];
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.get(
      `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (existing) return { kind: "idempotent", existing };
    const batchBefore = requestBatchId
      ? Number((await tx.get(
        "SELECT COUNT(*) AS count FROM ronde_entries WHERE request_batch_id = ?",
        [requestBatchId]
      ))?.count || 0)
      : 0;
    const now = new Date().toISOString();
    insertParams[1] = now;
    insertParams[2] = now;
    insertParams[insertParams.length - 1] = status === "EN_COURS" ? null : now;
    insertParams.push(normalized.arrivalDate || null, normalized.departureDate || null);
    insertParams.push(
      await allocateNextDailyCode(tx, "ronde", resolveRondeDailyCodeDayIso(source, normalized.requestDate, snapshotJson))
    );
    await tx.run(INSERT_SQL, insertParams);
    return { kind: "created", batchBefore, now };
  });
  if (outcome.kind === "idempotent") {
    store.logAudit({
      actorUsername: payload.requesterUsername || "unknown",
      action: "RONDE_CREATE_IDEMPOTENT",
      details: { id: entryId, existing: toRondeAuditSnapshot(outcome.existing) }
    });
    return mapRondeRow(await getRondeById(db, entryId) || outcome.existing, store);
  }
  if (requestBatchId) {
    if (outcome.batchBefore === 0) {
      const count = Number((await db.get(
        "SELECT COUNT(*) AS count FROM ronde_entries WHERE request_batch_id = ?",
        [requestBatchId]
      ))?.count || 0);
      store.logAudit({
        actorUsername: payload.requesterUsername || "unknown",
        action: "RONDE_BATCH_CREATE",
        details: { batchId: requestBatchId, total: count, success: count, failed: 0,
          preview: { source, siteDisplay: normalized.siteDisplay, requestDate: normalized.requestDate,
            motifLabel: normalized.motifCategorySnapshot, intervenantName: normalized.intervenantName } }
      });
    }
  } else {
    store.logAudit({
      actorUsername: payload.requesterUsername || "unknown",
      action: "RONDE_CREATE",
      details: { id: entryId, created: {
        source, siteDisplay: normalized.siteDisplay, requestDate: normalized.requestDate,
        motifLabel: normalized.motifCategorySnapshot, intervenantName: normalized.intervenantName,
        linkedIntervention: Boolean(originInterventionId), status
      } }
    });
  }
  return mapRondeRow(await getRondeById(db, entryId), store);
}

/**
 * Met à jour une ronde avec contrôle optimiste.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function updateRonde(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const entryId = requireEntryId(store, payload, "ronde:update");
  const db = requireRondePersistence(store, "ronde:update");
  const normalized = await normalizeRondeBody(store, db, payload);
  const before = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) store.fail("ronde:update", "Ronde introuvable.", "RONDE_NOT_FOUND");
    assertOptimisticLock(
      store,
      "ronde:update",
      row,
      payload.expectedUpdatedAt,
      "RONDE_CONFLICT",
      "Ronde modifiée ailleurs. Actualisez la liste."
    );
    const now = new Date().toISOString();
    const result = await tx.run(
      `UPDATE ronde_entries SET updated_at = ?, site_id = ?, site_display = ?, request_date = ?,
         motif_type_id = ?, motif_category = ?, motif_other = ?, horaires_demande_obs = ?,
         origin_kind = ?, origin_detail = ?, intervenant_id = ?, intervenant_name = ?,
         arrival_time = ?, departure_time = ?, arrival_date = ?, departure_date = ?,
         duration_minutes = ?, work_order_number = ?,
         report = ?, closure_custom_values_json = ?
       WHERE id = ? AND updated_at = ?`,
      [now, normalized.siteId, normalized.siteDisplay, normalized.requestDate,
        normalized.motifTypeId, normalized.motifCategorySnapshot, normalized.motifOther || null,
        normalized.horairesDemandeObs || null, normalized.originKind, normalized.originDetail || null,
        normalized.intervenantId, normalized.intervenantName, normalized.arrivalTime || null,
        normalized.departureTime || null, normalized.arrivalDate || null, normalized.departureDate || null,
        normalized.durationMinutes, normalized.workOrderNumber || null,
        normalized.report || null, JSON.stringify(normalized.closureCustomValues),
        entryId, payload.expectedUpdatedAt]
    );
    if (!result.changes) {
      store.fail("ronde:update", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
    }
    return row;
  });
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_UPDATE",
    details: { id: entryId, before: toRondeAuditSnapshot(before), after: {
      ...toRondeAuditSnapshot(before), siteDisplay: normalized.siteDisplay,
      requestDate: normalized.requestDate, motifLabel: normalized.motifCategorySnapshot,
      intervenantName: normalized.intervenantName, arrivalTime: normalized.arrivalTime,
      departureTime: normalized.departureTime
    } }
  });
  return mapRondeRow(await getRondeById(db, entryId), store);
}

/**
 * Change le statut d'une ronde.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function setRondeStatus(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const entryId = requireEntryId(store, payload, "ronde:status");
  const db = requireRondePersistence(store, "ronde:status");
  const status = payload.status === "ANNULE" ? "ANNULE" : payload.status === "CLOTURE" ? "CLOTURE" : "EN_COURS";
  const reason = String(payload.cancellationReason || "").trim();
  if (status === "ANNULE" && !reason) {
    store.fail("ronde:status", "Le motif d'annulation est obligatoire.", "RONDE_CANCEL_REASON_REQUIRED");
  }
  const isManager = isRondeManagerRole(payload.requesterRole);
  const { row, now, cancellationKind } = await db.transaction(async (tx) => {
    const locked = await tx.get(
      `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!locked) store.fail("ronde:status", "Ronde introuvable.", "RONDE_NOT_FOUND");
    if (status === "ANNULE" && locked.status === "CLOTURE") {
      store.fail(
        "ronde:status",
        "Cette ronde est clôturée. Rouvrez-la avant de l'annuler.",
        "RONDE_CANCEL_CLOSED"
      );
    }
    if (status === "ANNULE" && locked.status === "ANNULE") {
      store.fail("ronde:status", "Cette ronde est déjà annulée.", "RONDE_ALREADY_CANCELLED");
    }
    if (status === "CLOTURE") {
      assertPlannedClosureAllowed(store, "ronde:status", locked);
    }
    assertOptimisticLock(
      store,
      "ronde:status",
      locked,
      payload.expectedUpdatedAt,
      "RONDE_CONFLICT",
      "Ronde modifiée ailleurs. Actualisez la liste."
    );
    let kind = null;
    if (status === "ANNULE") {
      const past = isPassagePast(locked);
      const requestedKind = String(payload.cancellationKind || "").trim().toUpperCase();
      if (!isManager) {
        if (locked.source === "PLANIFIE") {
          store.fail(
            "ronde:status",
            "L'opérateur ne peut marquer « non effectuée » que les rondes exceptionnelles.",
            "RONDE_CANCEL_OPERATOR_PLANNED_FORBIDDEN"
          );
        }
        if (!past) {
          store.fail(
            "ronde:status",
            "Une ronde ne peut être marquée non effectuée qu'après l'heure de passage.",
            "RONDE_CANCEL_NOT_YET_PAST"
          );
        }
        kind = "NON_EFFECTUEE";
      } else if (requestedKind === "NON_EFFECTUEE") {
        // Non effectuée = passage déjà passé (prestataire n'a pas fait). Avant passage → annulation.
        kind = past ? "NON_EFFECTUEE" : "ANNULATION";
      } else if (requestedKind === "ANNULATION") {
        kind = "ANNULATION";
      } else {
        kind = "ANNULATION";
      }
    }
    const stamp = new Date().toISOString();
    const result = await tx.run(
      `UPDATE ronde_entries SET status = ?, cancellation_reason = ?, cancellation_kind = ?, closed_at = ?, updated_at = ?
       WHERE id = ? AND updated_at = ?`,
      [
        status,
        status === "ANNULE" ? reason : null,
        status === "ANNULE" ? kind : null,
        status === "EN_COURS" ? null : stamp,
        stamp,
        entryId,
        payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) {
      store.fail("ronde:status", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
    }
    return { row: locked, now: stamp, cancellationKind: kind };
  });
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action:
      status === "ANNULE"
        ? cancellationKind === "NON_EFFECTUEE"
          ? "RONDE_NON_EFFECTUEE"
          : "RONDE_CANCEL"
        : status === "CLOTURE"
          ? "RONDE_CLOSE"
          : "RONDE_REOPEN",
    details: {
      id: entryId,
      before: {
        status: row.status,
        cancellationReason: row.cancellation_reason || "",
        cancellationKind: row.cancellation_kind || null,
        closedAt: row.closed_at || ""
      },
      after: {
        status,
        cancellationReason: status === "ANNULE" ? reason : "",
        cancellationKind: status === "ANNULE" ? cancellationKind : null,
        closedAt: status === "EN_COURS" ? "" : now
      }
    }
  });
  return mapRondeRow(await getRondeById(db, entryId), store);
}

/** @param {object} store @param {object[]} rows @returns {void} */

module.exports = {
  createRonde,
  getRondeTodayInProgressCounts,
  listRondes,
  setRondeStatus,
  updateRonde
};
