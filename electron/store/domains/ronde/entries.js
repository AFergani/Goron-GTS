/**
 * CRUD, statuts et opérations de lot des rondes en PostgreSQL.
 *
 * Aucun chemin SQLite ni historique local n'est conservé dans ce module.
 *
 * @module electron/store/domains/ronde/entries
 */

const holidaysDomain = require("../data/holidays");
const interventionDomain = require("../intervention");
const exceptionalSlots = require("./exceptionalSlotsEngine");
const { autoCloseExpiredExceptionalRondes } = require("./autoClose");
const { mapRondeRow, parseJsonObject, toRondeAuditSnapshot, RONDE_ENTRY_SELECT, RONDE_ENTRY_SELECT_R, requireEntryId } = require("./mapping");
const { requireRondePersistence } = require("./persistence");
const { assertOptimisticLock } = require("../data/optimisticLock");
const { generateEntityId } = require("../../core/ids");
const {
  isPassagePast,
  hasKnownTerrainData,
  isBatchFullyPast,
  isRondeManagerRole
} = require("./passageRules");

const ORIGIN_KINDS = new Set(["TELESURVEILLANCE", "CLIENT", "AUTRE"]);
const SOURCES = new Set(["URGENCE", "LIEE_INTERVENTION", "PLANIFIE"]);
const PLANNED_ROUND_KINDS = new Set(["OPENING", "CLOSING", "RANDOM_DAY", "RANDOM_NIGHT"]);
const PLANNED_SLOT_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\d+$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const INSERT_SQL = `INSERT INTO ronde_entries (
  id, created_at, updated_at, source, origin_intervention_id, site_id, site_display,
  request_date, motif_type_id, motif_category, motif_other, horaires_demande_obs,
  origin_kind, origin_detail, intervenant_id, intervenant_name, arrival_time,
  departure_time, duration_minutes, work_order_number, report,
  closure_custom_values_json, planned_profile_id, planned_round_kind, planned_slot_key,
  request_planning_snapshot_json, request_batch_id, status, cancellation_reason, closed_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** @param {unknown} value @returns {string} */
function toIsoDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** @param {unknown} value @returns {string} */
function toIsoTime(value) {
  const raw = String(value || "").trim();
  return TIME_RE.test(raw) ? raw : "";
}

/** @param {string} dateIso @param {string} timeIso @returns {number|null} */
function parseDateTimeMs(dateIso, timeIso) {
  const ms = Date.parse(`${dateIso}T${timeIso}:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** @param {object} input @returns {number|null} */
function computeDurationMinutes({ requestDate, arrivalTime, departureTime }) {
  if (!requestDate || !arrivalTime || !departureTime) return null;
  const arrivalMs = parseDateTimeMs(requestDate, arrivalTime);
  let departureMs = parseDateTimeMs(requestDate, departureTime);
  if (arrivalMs == null || departureMs == null) return null;
  if (departureMs < arrivalMs) departureMs += 86400000;
  return Math.round((departureMs - arrivalMs) / 60000);
}

/** @param {unknown} input @returns {object} */
function normalizeClosureCustomValues(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey || "").trim().toLowerCase()
      .replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 40);
    if (key) output[key] = String(rawValue ?? "").trim().slice(0, 1000);
  }
  return output;
}

/**
 * Valide et normalise les champs métier d'une ronde.
 *
 * @param {import('../../../userStore')} store
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function normalizeRondeBody(store, db, payload) {
  const requestDate = toIsoDate(payload.requestDate);
  const siteDisplay = String(payload.siteDisplay || "").trim();
  const intervenantName = String(payload.intervenantName || "").trim();
  if (!requestDate) store.fail("ronde:validate", "La date de la demande est obligatoire.", "RONDE_REQUEST_DATE_REQUIRED");
  if (!siteDisplay) store.fail("ronde:validate", "Le site est obligatoire.", "RONDE_SITE_REQUIRED");
  if (!intervenantName) store.fail("ronde:validate", "Le prestataire est obligatoire.", "RONDE_PRESTATAIRE_REQUIRED");

  const motifTypeId = String(payload.motifTypeId || "").trim();
  if (!motifTypeId) store.fail("ronde:validate", "Le motif est obligatoire.", "RONDE_MOTIF_REQUIRED");
  const motif = await db.get(
    "SELECT id, label, requires_free_text FROM data_ronde_motif_types WHERE id = ?",
    [motifTypeId]
  );
  if (!motif) store.fail("ronde:validate", "Motif inconnu ou non disponible.", "RONDE_MOTIF_INVALID");

  const originKind = String(payload.originKind || "").trim().toUpperCase();
  const originDetail = String(payload.originDetail || "").trim();
  if (!ORIGIN_KINDS.has(originKind)) {
    store.fail("ronde:validate", "Origine de la demande invalide.", "RONDE_ORIGIN_INVALID");
  }
  if (originKind === "CLIENT" && !originDetail) {
    store.fail("ronde:validate", "Nom du client obligatoire lorsque l'origine est « Client ».", "RONDE_ORIGIN_CLIENT_REQUIRED");
  }
  const arrivalTime = toIsoTime(payload.arrivalTime);
  const departureTime = toIsoTime(payload.departureTime);
  return {
    siteId: payload.siteId || null,
    siteDisplay,
    requestDate,
    motifTypeId,
    motifCategorySnapshot: String(motif.label || "").trim().slice(0, 200) || "—",
    motifOther: String(payload.motifDetail ?? payload.motifOther ?? "").trim(),
    horairesDemandeObs: String(payload.horairesDemandeObs || "").trim(),
    originKind,
    originDetail,
    intervenantId: payload.intervenantId || null,
    intervenantName,
    arrivalTime,
    departureTime,
    durationMinutes: computeDurationMinutes({ requestDate, arrivalTime, departureTime }),
    workOrderNumber: String(payload.workOrderNumber || "").trim(),
    report: String(payload.report || "").trim(),
    closureCustomValues: normalizeClosureCustomValues(payload.closureCustomValues)
  };
}

/**
 * Charge une ronde et son motif depuis PostgreSQL.
 *
 * @param {object} db
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getRondeById(db, id) {
  return db.get(
    `SELECT ${RONDE_ENTRY_SELECT_R}, m.label AS motif_type_label,
            m.requires_free_text AS motif_type_requires_free_text
     FROM ronde_entries r
     LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
     WHERE r.id = ?`,
    [id]
  );
}

/** @param {unknown} raw @param {string} source @param {import('../../../userStore')} store @returns {string|null} */
function normalizePlanningSnapshot(raw, source, store) {
  if (raw == null || source === "PLANIFIE") return null;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  if (text.length > 400000) {
    store.fail("ronde:validate", "Paramètres de demande trop volumineux.", "RONDE_PLANNING_SNAPSHOT_TOO_LARGE");
  }
  const parsed = parseJsonObject(text, null);
  return parsed?.version === 1 ? JSON.stringify(parsed) : null;
}

/**
 * Valide les métadonnées d'une ronde planifiée.
 *
 * @param {object} store
 * @param {object} db
 * @param {string} source
 * @param {unknown} profileId
 * @param {unknown} roundKind
 * @returns {Promise<{plannedProfileId:string|null,plannedRoundKind:string|null}>}
 */
async function ensurePlannedMeta(store, db, source, profileId, roundKind) {
  if (source !== "PLANIFIE") return { plannedProfileId: null, plannedRoundKind: null };
  const plannedProfileId = String(profileId || "").trim();
  const plannedRoundKind = String(roundKind || "").trim().toUpperCase();
  if (!plannedProfileId || !plannedRoundKind) {
    store.fail("ronde:validate", "Contexte planifié incomplet (profil ou type de passage).", "RONDE_PLANNED_META_REQUIRED");
  }
  if (!PLANNED_ROUND_KINDS.has(plannedRoundKind)) {
    store.fail("ronde:validate", "Type de passage planifié invalide.", "RONDE_PLANNED_KIND_INVALID");
  }
  if (!await db.get("SELECT id FROM data_ronde_planned_profiles WHERE id = ?", [plannedProfileId])) {
    store.fail("ronde:validate", "Profil de planification introuvable.", "RONDE_PLANNED_PROFILE_NOT_FOUND");
  }
  return { plannedProfileId, plannedRoundKind };
}

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
            d.reason AS batch_delete_reason
     FROM ronde_entries r
     LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
     LEFT JOIN ronde_batch_delete_requests d
       ON d.request_batch_id = r.request_batch_id AND d.status = 'PENDING'
     ORDER BY r.request_date DESC, r.id DESC`,
    []
  );
  const mapped = rows.map(mapRondeRow);
  if (!isRondeManagerRole(requesterRole)) {
    return mapped.filter((entry) => !entry.batchDeleteRequestedAt);
  }
  return mapped;
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
  const statusInput = String(payload.initialStatus || "EN_COURS").trim().toUpperCase();
  const status = ["EN_COURS", "CLOTURE", "ANNULE"].includes(statusInput) ? statusInput : "EN_COURS";
  const cancellationReason = String(payload.cancellationReason || "").trim();
  if (status === "ANNULE" && !cancellationReason) {
    store.fail("ronde:validate", "Le motif d'annulation est obligatoire.", "RONDE_CANCEL_REASON_REQUIRED");
  }
  const requestBatchId = source !== "PLANIFIE"
    ? String(payload.requestBatchId || "").trim().slice(0, 48) || null
    : null;
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
    normalizePlanningSnapshot(payload.requestPlanningSnapshotJson, source, store),
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
    await tx.run(INSERT_SQL, insertParams);
    return { kind: "created", batchBefore, now };
  });
  if (outcome.kind === "idempotent") {
    store.logAudit({
      actorUsername: payload.requesterUsername || "unknown",
      action: "RONDE_CREATE_IDEMPOTENT",
      details: { id: entryId, existing: toRondeAuditSnapshot(outcome.existing) }
    });
    return mapRondeRow(await getRondeById(db, entryId) || outcome.existing);
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
  return mapRondeRow(await getRondeById(db, entryId));
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
         arrival_time = ?, departure_time = ?, duration_minutes = ?, work_order_number = ?,
         report = ?, closure_custom_values_json = ?
       WHERE id = ? AND updated_at = ?`,
      [now, normalized.siteId, normalized.siteDisplay, normalized.requestDate,
        normalized.motifTypeId, normalized.motifCategorySnapshot, normalized.motifOther || null,
        normalized.horairesDemandeObs || null, normalized.originKind, normalized.originDetail || null,
        normalized.intervenantId, normalized.intervenantName, normalized.arrivalTime || null,
        normalized.departureTime || null, normalized.durationMinutes, normalized.workOrderNumber || null,
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
  return mapRondeRow(await getRondeById(db, entryId));
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
  return mapRondeRow(await getRondeById(db, entryId));
}

/** @param {object} store @param {object[]} rows @returns {void} */
function assertCoherentExceptionalBatch(store, rows) {
  if (!rows.length) store.fail("ronde:batch", "Aucune ronde sélectionnée.", "RONDE_BATCH_EMPTY");
  if (rows.some((row) => row.source === "PLANIFIE")) {
    store.fail("ronde:batch", "Ce regroupement ne s'applique pas aux rondes planifiées.", "RONDE_BATCH_PLANNED_FORBIDDEN");
  }
  const batchIds = rows.map((row) => String(row.request_batch_id || "").trim()).filter(Boolean);
  if (batchIds.length === rows.length && new Set(batchIds).size === 1) return;
  if (batchIds.length) store.fail("ronde:batch", "Les rondes ne font pas partie du même lot.", "RONDE_BATCH_MISMATCH");
  const snapshots = rows.map((row) => String(row.request_planning_snapshot_json || "").trim());
  const sites = rows.map((row) => String(row.site_id || ""));
  if (rows.length === 1 || (snapshots.every(Boolean) && new Set(snapshots).size === 1 && new Set(sites).size === 1)) return;
  store.fail("ronde:batch", "Impossible de regrouper automatiquement ces fiches.", "RONDE_BATCH_INCOHERENT");
}

/**
 * Charge des fiches ronde par id (colonnes explicites).
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {string[]} ids
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<object[]>}
 */
async function loadBatchRows(db, ids, { forUpdate = false } = {}) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const lock = forUpdate ? " FOR UPDATE" : "";
  return db.all(
    `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE id IN (${placeholders})${lock}`,
    ids
  );
}

/** @param {string} dateIso @param {string} timeHm @returns {string} */
function formatDemandContext(dateIso, timeHm) {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const label = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return timeHm ? `Demande émise le ${label} à ${timeHm}` : `Demande émise le ${label}`;
}

/**
 * Met à jour les champs communs d'un lot et resynchronise ses créneaux si demandé.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ok:boolean,updatedCount:number}>}
 */
async function updateRondeBatchSharedFields(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  let rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const snapshotProvided = Object.prototype.hasOwnProperty.call(payload, "requestPlanningSnapshotJson");
  let snapshotJson = null;
  let planningResync = null;
  if (snapshotProvided) {
    snapshotJson = normalizePlanningSnapshot(payload.requestPlanningSnapshotJson, "URGENCE", store);
    if (!snapshotJson) store.fail("ronde:batch", "Instantané de demande invalide.", "RONDE_BATCH_SNAPSHOT_INVALID");
    const snapshot = JSON.parse(snapshotJson);
    if (snapshot.createRoundsEnabled !== false && snapshot.origin !== "CONTRAT") {
      const desired = exceptionalSlots.buildDesiredExceptionalSlotList(
        snapshot,
        new Set(holidaysDomain.getHolidayDateIsosForPlanning(store))
      );
      if (!desired.length) store.fail("ronde:batch", "Aucun créneau ne peut être calculé.", "RONDE_BATCH_RESYNC_EMPTY");
      const multiset = new Map();
      exceptionalSlots.multisetAddMany(multiset, desired);
      for (const row of rows.filter((item) => item.status === "CLOTURE")) {
        exceptionalSlots.multisetConsumeOne(
          multiset,
          exceptionalSlots.extractSlotKeyFromRondeObservation(row.request_date, row.horaires_demande_obs)
        );
      }
      const toDelete = [];
      for (const row of rows.filter((item) => item.status !== "CLOTURE")) {
        const key = exceptionalSlots.extractSlotKeyFromRondeObservation(row.request_date, row.horaires_demande_obs);
        if (!exceptionalSlots.multisetConsumeOne(multiset, key)) toDelete.push(row.id);
      }
      const template = rows[0];
      const normalized = await normalizeRondeBody(store, db, {
        ...payload, requestDate: template.request_date, horairesDemandeObs: template.horaires_demande_obs,
        arrivalTime: "", departureTime: "", workOrderNumber: "", report: "", closureCustomValues: {}
      });
      const createdIds = [];
      await db.transaction(async (tx) => {
        await loadBatchRows(tx, ids, { forUpdate: true });
        if (toDelete.length) {
          const placeholders = toDelete.map(() => "?").join(", ");
          await tx.run(`DELETE FROM ronde_entries WHERE id IN (${placeholders})`, toDelete);
        }
        for (const [slotKey, quantity] of [...multiset.entries()].sort()) {
          for (let index = 0; index < quantity; index += 1) {
            const [requestDate, requestedTime = ""] = slotKey.split("|");
            const id = generateEntityId();
            const now = new Date().toISOString();
            const observation = [
              formatDemandContext(snapshot.requestDate || requestDate, TIME_RE.test(snapshot.requestTime) ? snapshot.requestTime : "00:00"),
              requestedTime ? `Heure demandée: ${requestedTime}` : "",
              String(snapshot.consigne || "").trim()
            ].filter(Boolean).join(" — ");
            await tx.run(INSERT_SQL, [
              id, now, now, template.source || "URGENCE", template.origin_intervention_id || null,
              normalized.siteId, normalized.siteDisplay, requestDate, normalized.motifTypeId,
              normalized.motifCategorySnapshot, normalized.motifOther || null, observation,
              normalized.originKind, normalized.originDetail || null, normalized.intervenantId,
              normalized.intervenantName, null, null, null, null, null, "{}", null, null, null,
              snapshotJson, template.request_batch_id || null, "EN_COURS", null, null
            ]);
            createdIds.push(id);
          }
        }
      });
      rows = await loadBatchRows(db, [...ids.filter((id) => !toDelete.includes(id)), ...createdIds]);
      planningResync = { deletedStalePasses: toDelete.length, createdPasses: createdIds.length };
    }
  }
  const summaries = [];
  const now = new Date().toISOString();
  const updatedIds = rows.map((row) => row.id);
  await db.transaction(async (tx) => {
    const lockedRows = await loadBatchRows(tx, updatedIds, { forUpdate: true });
    for (const row of lockedRows) {
      const normalized = await normalizeRondeBody(store, tx, {
        ...payload, requestDate: row.request_date, horairesDemandeObs: row.horaires_demande_obs,
        arrivalTime: row.arrival_time || "", departureTime: row.departure_time || "",
        workOrderNumber: row.work_order_number || "", report: row.report || "",
        closureCustomValues: parseJsonObject(row.closure_custom_values_json, {})
      });
      await tx.run(
        `UPDATE ronde_entries SET updated_at = ?, site_id = ?, site_display = ?, motif_type_id = ?,
         motif_category = ?, motif_other = ?, origin_kind = ?, origin_detail = ?,
         intervenant_id = ?, intervenant_name = ?, request_planning_snapshot_json = ? WHERE id = ?`,
        [now, normalized.siteId, normalized.siteDisplay, normalized.motifTypeId,
          normalized.motifCategorySnapshot, normalized.motifOther || null, normalized.originKind,
          normalized.originDetail || null, normalized.intervenantId, normalized.intervenantName,
          snapshotProvided ? snapshotJson : row.request_planning_snapshot_json, row.id]
      );
      summaries.push({ id: row.id, before: toRondeAuditSnapshot(row), after: {
        ...toRondeAuditSnapshot(row), siteDisplay: normalized.siteDisplay,
        motifLabel: normalized.motifCategorySnapshot, intervenantName: normalized.intervenantName
      } });
    }
  });
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_BATCH_UPDATE",
    details: { count: summaries.length, entryIds: summaries.map((row) => row.id),
      planningSnapshotSynced: snapshotProvided, planningResync, rows: summaries.slice(0, 25) }
  });
  return { ok: true, updatedCount: summaries.length };
}

/**
 * Annule les rondes ouvertes d'un lot.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function bulkCancelRondeBatch(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (!isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batch",
      "L'annulation en lot est réservée au responsable. Marquez les rondes une par une en « non effectuée ».",
      "RONDE_BATCH_CANCEL_OPERATOR_FORBIDDEN"
    );
  }
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("ronde:batch", "Le motif d'annulation est obligatoire.", "RONDE_BATCH_CANCEL_REASON_REQUIRED");
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const openRows = rows.filter((row) => row.status === "EN_COURS");
  if (openRows.length) {
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await loadBatchRows(
        tx,
        openRows.map((r) => r.id),
        { forUpdate: true }
      );
      for (const row of openRows) {
        await tx.run(
          `UPDATE ronde_entries SET status = 'ANNULE', cancellation_reason = ?, cancellation_kind = 'ANNULATION',
           closed_at = ?, updated_at = ? WHERE id = ? AND status = 'EN_COURS'`,
          [reason, now, now, row.id]
        );
      }
    });
  }
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_BATCH_CANCEL",
    details: {
      reason,
      cancelledCount: openRows.length,
      skippedCount: rows.length - openRows.length,
      entryIds: openRows.map((r) => r.id)
    }
  });
  return { ok: true, cancelledCount: openRows.length, skippedCount: rows.length - openRows.length };
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} db
 * @param {object[]} rows
 * @param {string} reason
 * @param {string} actor
 */
async function applySmartBatchDelete(store, db, rows, reason, actor) {
  const now = new Date().toISOString();
  const fullyPast = isBatchFullyPast(rows);
  let deletedCount = 0;
  let nonEffectueeCount = 0;
  let suppressedCount = 0;
  const closedRows = rows.filter((row) => row.status === "CLOTURE");

  if (fullyPast) {
    const deletable = rows.filter((row) => row.status !== "CLOTURE");
    await db.transaction(async (tx) => {
      for (const row of closedRows) {
        const snapshot = parseJsonObject(row.request_planning_snapshot_json, null);
        if (snapshot?.version === 1 && snapshot.createRoundsEnabled !== false) {
          snapshot.createRoundsEnabled = false;
          await tx.run(
            "UPDATE ronde_entries SET request_planning_snapshot_json = ?, updated_at = ? WHERE id = ?",
            [JSON.stringify(snapshot), now, row.id]
          );
        }
      }
      if (deletable.length) {
        const placeholders = deletable.map(() => "?").join(", ");
        await tx.run(
          `DELETE FROM ronde_entries WHERE id IN (${placeholders})`,
          deletable.map((row) => row.id)
        );
        deletedCount = deletable.length;
      }
    });
    return { deletedCount, nonEffectueeCount: 0, suppressedCount: 0, skippedCount: closedRows.length };
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.status === "CLOTURE" || hasKnownTerrainData(row)) {
        const snapshot = parseJsonObject(row.request_planning_snapshot_json, null);
        let snapJson = null;
        if (snapshot?.version === 1 && snapshot.createRoundsEnabled !== false) {
          snapshot.createRoundsEnabled = false;
          snapJson = JSON.stringify(snapshot);
        }
        await tx.run(
          `UPDATE ronde_entries SET
             batch_suppressed_at = ?, batch_suppressed_by = ?, batch_suppressed_reason = ?,
             request_planning_snapshot_json = COALESCE(?, request_planning_snapshot_json),
             updated_at = ?
           WHERE id = ?`,
          [now, actor, reason, snapJson, now, row.id]
        );
        suppressedCount += 1;
      } else if (row.status === "EN_COURS") {
        await tx.run(
          `UPDATE ronde_entries SET status = 'ANNULE', cancellation_reason = ?, cancellation_kind = 'NON_EFFECTUEE',
           closed_at = ?, batch_suppressed_at = ?, batch_suppressed_by = ?, batch_suppressed_reason = ?, updated_at = ?
           WHERE id = ?`,
          [reason, now, now, actor, reason, now, row.id]
        );
        nonEffectueeCount += 1;
      } else {
        await tx.run(
          `UPDATE ronde_entries SET batch_suppressed_at = ?, batch_suppressed_by = ?, batch_suppressed_reason = ?, updated_at = ?
           WHERE id = ?`,
          [now, actor, reason, now, row.id]
        );
        suppressedCount += 1;
      }
    }
  });
  return { deletedCount, nonEffectueeCount, suppressedCount, skippedCount: closedRows.length };
}

async function bulkDeleteRondeBatch(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (!isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batch",
      "La suppression de lot est réservée au responsable. Déposez une demande de suppression.",
      "RONDE_BATCH_DELETE_OPERATOR_FORBIDDEN"
    );
  }
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("ronde:batch", "Le motif de suppression est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const actor = String(payload.requesterUsername || "unknown").trim();
  const result = await applySmartBatchDelete(store, db, rows, reason, actor);
  const batchId = String(rows[0]?.request_batch_id || "").trim();
  if (batchId) {
    await db.run(`DELETE FROM ronde_batch_delete_requests WHERE request_batch_id = ?`, [batchId]);
  }
  store.logAudit({
    actorUsername: actor,
    action: "RONDE_BATCH_DELETE",
    details: { reason, ...result, batchId: batchId || null }
  });
  return { ok: true, deletedCount: result.deletedCount, skippedCount: result.skippedCount, ...result };
}

async function requestRondeBatchDelete(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batchDeleteRequest",
      "Un responsable peut supprimer le lot directement sans créer de demande.",
      "RONDE_BATCH_DELETE_REQUEST_NOT_NEEDED"
    );
  }
  const reason = String(payload.reason || "").trim();
  if (!reason) {
    store.fail("ronde:batchDeleteRequest", "Le motif de demande est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  }
  const db = requireRondePersistence(store, "ronde:batchDeleteRequest");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batchDeleteRequest", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const batchId = String(rows[0]?.request_batch_id || "").trim();
  if (!batchId) {
    store.fail("ronde:batchDeleteRequest", "Ce regroupement n'a pas d'identifiant de lot.", "RONDE_BATCH_ID_REQUIRED");
  }
  const existing = await db.get(
    "SELECT request_batch_id, status FROM ronde_batch_delete_requests WHERE request_batch_id = ?",
    [batchId]
  );
  if (existing?.status === "PENDING") {
    store.fail(
      "ronde:batchDeleteRequest",
      "Une demande de suppression est déjà en attente pour ce lot.",
      "RONDE_BATCH_DELETE_ALREADY_PENDING"
    );
  }
  const now = new Date().toISOString();
  const actor = String(payload.requesterUsername || "unknown").trim();
  const siteDisplay = String(rows[0]?.site_display || "").trim();
  if (existing) {
    await db.run(
      `UPDATE ronde_batch_delete_requests
       SET reason = ?, requested_at = ?, requested_by = ?, status = 'PENDING',
           reviewed_at = NULL, reviewed_by = NULL, review_reason = NULL, site_display = ?
       WHERE request_batch_id = ?`,
      [reason, now, actor, siteDisplay, batchId]
    );
  } else {
    await db.run(
      `INSERT INTO ronde_batch_delete_requests
         (request_batch_id, reason, requested_at, requested_by, status, site_display)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`,
      [batchId, reason, now, actor, siteDisplay]
    );
  }
  store.logAudit({
    actorUsername: actor,
    action: "RONDE_BATCH_DELETE_REQUEST",
    details: { batchId, reason, entryCount: rows.length }
  });
  return { ok: true, requestBatchId: batchId, requestedAt: now, requestedBy: actor, reason };
}

async function reviewRondeBatchDeleteRequest(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (!isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batchDeleteReview",
      "Seul un responsable peut traiter une demande de suppression.",
      "RONDE_BATCH_DELETE_REVIEW_FORBIDDEN"
    );
  }
  const batchId = String(payload.requestBatchId || "").trim();
  const decision = String(payload.decision || "").trim().toLowerCase();
  const reviewReason = String(payload.reviewReason || payload.reason || "").trim();
  if (!batchId) store.fail("ronde:batchDeleteReview", "Lot manquant.", "RONDE_BATCH_ID_REQUIRED");
  if (decision !== "approve" && decision !== "reject") {
    store.fail("ronde:batchDeleteReview", "Décision invalide.", "RONDE_BATCH_DELETE_DECISION_INVALID");
  }
  if (!reviewReason) {
    store.fail("ronde:batchDeleteReview", "Le motif de décision est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  }
  const db = requireRondePersistence(store, "ronde:batchDeleteReview");
  const pending = await db.get(
    "SELECT * FROM ronde_batch_delete_requests WHERE request_batch_id = ? AND status = 'PENDING'",
    [batchId]
  );
  if (!pending) {
    store.fail("ronde:batchDeleteReview", "Aucune demande en attente pour ce lot.", "RONDE_BATCH_DELETE_NOT_FOUND");
  }
  const actor = String(payload.requesterUsername || "unknown").trim();
  const now = new Date().toISOString();
  if (decision === "reject") {
    await db.run(
      `UPDATE ronde_batch_delete_requests
       SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ?, review_reason = ?
       WHERE request_batch_id = ?`,
      [now, actor, reviewReason, batchId]
    );
    store.logAudit({
      actorUsername: actor,
      action: "RONDE_BATCH_DELETE_REQUEST_REJECT",
      details: { batchId, reviewReason, request: { reason: pending.reason, requestedBy: pending.requested_by } }
    });
    return { ok: true, decision: "reject", requestBatchId: batchId };
  }
  const rows = await db.all(`SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE request_batch_id = ?`, [batchId]);
  if (!rows.length) {
    await db.run(`DELETE FROM ronde_batch_delete_requests WHERE request_batch_id = ?`, [batchId]);
    store.fail("ronde:batchDeleteReview", "Aucune fiche restante pour ce lot.", "RONDE_BATCH_EMPTY");
  }
  const applyReason = String(pending.reason || reviewReason).trim();
  const result = await applySmartBatchDelete(store, db, rows, applyReason, actor);
  await db.run(
    `UPDATE ronde_batch_delete_requests
     SET status = 'APPROVED', reviewed_at = ?, reviewed_by = ?, review_reason = ?
     WHERE request_batch_id = ?`,
    [now, actor, reviewReason, batchId]
  );
  store.logAudit({
    actorUsername: actor,
    action: "RONDE_BATCH_DELETE_REQUEST_APPROVE",
    details: { batchId, reviewReason, requestReason: pending.reason, ...result }
  });
  return { ok: true, decision: "approve", requestBatchId: batchId, ...result };
}

async function listRondeBatchDeleteRequests(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  if (!isRondeManagerRole(requesterRole)) {
    store.fail(
      "ronde:batchDeleteList",
      "Seul un responsable peut consulter les demandes de suppression.",
      "RONDE_BATCH_DELETE_LIST_FORBIDDEN"
    );
  }
  const db = requireRondePersistence(store, "ronde:batchDeleteList");
  const requests = await db.all(
    `SELECT request_batch_id, reason, requested_at, requested_by, status,
            reviewed_at, reviewed_by, review_reason, site_display
     FROM ronde_batch_delete_requests
     ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'REJECTED' THEN 1 ELSE 2 END,
              requested_at DESC`,
    []
  );
  const usersDb = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  const displayByUsername = new Map();
  if (usersDb && usersDb.isOpen()) {
    const usernames = [
      ...new Set(
        requests
          .flatMap((req) => [req.requested_by, req.reviewed_by])
          .map((u) => String(u || "").trim())
          .filter(Boolean)
      )
    ];
    for (const username of usernames) {
      const row = await usersDb.get("SELECT full_name FROM users WHERE username = ?", [username]);
      const fullName = String(row?.full_name || "").trim();
      if (fullName) displayByUsername.set(username, fullName);
    }
  }
  const out = [];
  for (const req of requests) {
    const entries = await db.all(
      `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE request_batch_id = ? ORDER BY request_date ASC`,
      [req.request_batch_id]
    );
    const requestedBy = String(req.requested_by || "").trim();
    const reviewedBy = String(req.reviewed_by || "").trim();
    out.push({
      requestBatchId: req.request_batch_id,
      reason: req.reason || "",
      requestedAt: req.requested_at,
      requestedBy,
      requestedByDisplay: displayByUsername.get(requestedBy) || requestedBy,
      status: req.status || "PENDING",
      reviewedAt: req.reviewed_at || null,
      reviewedBy,
      reviewedByDisplay: reviewedBy ? displayByUsername.get(reviewedBy) || reviewedBy : "",
      reviewReason: req.review_reason || "",
      entryCount: entries.length,
      siteDisplay: String(req.site_display || "").trim() || entries[0]?.site_display || "",
      dateFrom: entries[0]?.request_date || "",
      dateTo: entries.length ? entries[entries.length - 1].request_date : "",
      entryIds: entries.map((e) => e.id)
    });
  }
  return out;
}

module.exports = {
  bulkCancelRondeBatch,
  bulkDeleteRondeBatch,
  createRonde,
  getRondeTodayInProgressCounts,
  listRondes,
  listRondeBatchDeleteRequests,
  requestRondeBatchDelete,
  reviewRondeBatchDeleteRequest,
  setRondeStatus,
  updateRonde,
  updateRondeBatchSharedFields
};
