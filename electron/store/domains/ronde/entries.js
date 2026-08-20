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
const { mapRondeRow, parseJsonObject, toRondeAuditSnapshot } = require("./mapping");
const { requireRondePersistence } = require("./persistence");
const { generateEntityId } = require("../../core/ids");

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
    `SELECT r.*, m.label AS motif_type_label,
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
    `SELECT r.*, m.label AS motif_type_label,
            m.requires_free_text AS motif_type_requires_free_text
     FROM ronde_entries r
     LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
     ORDER BY r.request_date DESC, r.id DESC`,
    []
  );
  return rows.map(mapRondeRow);
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
  const contractualRow = await db.get(
    `SELECT COUNT(*) AS count FROM ronde_entries WHERE ${baseWhere} AND ${CONTRACTUAL_RONDE_SQL}`,
    [day]
  );
  const exceptionalRow = await db.get(
    `SELECT COUNT(*) AS count FROM ronde_entries WHERE ${baseWhere} AND NOT ${CONTRACTUAL_RONDE_SQL}`,
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
  const db = requireRondePersistence(store, "ronde:create");
  const source = String(payload.source || "URGENCE").trim().toUpperCase();
  if (!SOURCES.has(source)) store.fail("ronde:validate", "Source de ronde invalide.", "RONDE_SOURCE_INVALID");
  const planned = await ensurePlannedMeta(store, db, source, payload.plannedProfileId, payload.plannedRoundKind);
  const normalized = await normalizeRondeBody(store, db, payload);
  const originInterventionId = String(payload.originInterventionId || "").trim() || null;
  if (originInterventionId && !await interventionDomain.hasInterventionEntry(store, originInterventionId)) {
    store.fail("ronde:create", "Intervention liée introuvable.", "RONDE_ORIGIN_INTERVENTION_NOT_FOUND");
  }
  const existing = await getRondeById(db, payload.id);
  if (existing) {
    store.logAudit({
      actorUsername: payload.requesterUsername || "unknown",
      action: "RONDE_CREATE_IDEMPOTENT",
      details: { id: payload.id, existing: toRondeAuditSnapshot(existing) }
    });
    return mapRondeRow(existing);
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
  const batchBefore = requestBatchId
    ? Number((await db.get("SELECT COUNT(*) AS count FROM ronde_entries WHERE request_batch_id = ?", [requestBatchId]))?.count || 0)
    : 0;
  const now = new Date().toISOString();
  await db.run(INSERT_SQL, [
    payload.id, now, now, source, originInterventionId, normalized.siteId,
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
    status === "EN_COURS" ? null : now
  ]);
  if (requestBatchId) {
    if (batchBefore === 0) {
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
      details: { id: payload.id, created: {
        source, siteDisplay: normalized.siteDisplay, requestDate: normalized.requestDate,
        motifLabel: normalized.motifCategorySnapshot, intervenantName: normalized.intervenantName,
        linkedIntervention: Boolean(originInterventionId), status
      } }
    });
  }
  return mapRondeRow(await getRondeById(db, payload.id));
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
  const db = requireRondePersistence(store, "ronde:update");
  const row = await db.get("SELECT * FROM ronde_entries WHERE id = ?", [payload.id]);
  if (!row) store.fail("ronde:update", "Ronde introuvable.", "RONDE_NOT_FOUND");
  if (String(row.updated_at) !== String(payload.expectedUpdatedAt || "")) {
    store.fail("ronde:update", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  }
  const normalized = await normalizeRondeBody(store, db, payload);
  const now = new Date().toISOString();
  const result = await db.run(
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
      payload.id, payload.expectedUpdatedAt]
  );
  if (!result.changes) store.fail("ronde:update", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_UPDATE",
    details: { id: payload.id, before: toRondeAuditSnapshot(row), after: {
      ...toRondeAuditSnapshot(row), siteDisplay: normalized.siteDisplay,
      requestDate: normalized.requestDate, motifLabel: normalized.motifCategorySnapshot,
      intervenantName: normalized.intervenantName, arrivalTime: normalized.arrivalTime,
      departureTime: normalized.departureTime
    } }
  });
  return mapRondeRow(await getRondeById(db, payload.id));
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
  const db = requireRondePersistence(store, "ronde:status");
  const row = await db.get("SELECT * FROM ronde_entries WHERE id = ?", [payload.id]);
  if (!row) store.fail("ronde:status", "Ronde introuvable.", "RONDE_NOT_FOUND");
  if (String(row.updated_at) !== String(payload.expectedUpdatedAt || "")) {
    store.fail("ronde:status", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  }
  const status = payload.status === "ANNULE" ? "ANNULE" : payload.status === "CLOTURE" ? "CLOTURE" : "EN_COURS";
  const reason = String(payload.cancellationReason || "").trim();
  if (status === "ANNULE" && !reason) {
    store.fail("ronde:status", "Le motif d'annulation est obligatoire.", "RONDE_CANCEL_REASON_REQUIRED");
  }
  const now = new Date().toISOString();
  const result = await db.run(
    `UPDATE ronde_entries SET status = ?, cancellation_reason = ?, closed_at = ?, updated_at = ?
     WHERE id = ? AND updated_at = ?`,
    [status, status === "ANNULE" ? reason : null, status === "EN_COURS" ? null : now,
      now, payload.id, payload.expectedUpdatedAt]
  );
  if (!result.changes) store.fail("ronde:status", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: status === "ANNULE" ? "RONDE_CANCEL" : status === "CLOTURE" ? "RONDE_CLOSE" : "RONDE_REOPEN",
    details: { id: payload.id,
      before: { status: row.status, cancellationReason: row.cancellation_reason || "", closedAt: row.closed_at || "" },
      after: { status, cancellationReason: status === "ANNULE" ? reason : "", closedAt: status === "EN_COURS" ? "" : now } }
  });
  return mapRondeRow(await getRondeById(db, payload.id));
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

/** @param {object} db @param {string[]} ids @returns {Promise<object[]>} */
async function loadBatchRows(db, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return db.all(`SELECT * FROM ronde_entries WHERE id IN (${placeholders})`, ids);
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
  for (const row of rows) {
    const normalized = await normalizeRondeBody(store, db, {
      ...payload, requestDate: row.request_date, horairesDemandeObs: row.horaires_demande_obs,
      arrivalTime: row.arrival_time || "", departureTime: row.departure_time || "",
      workOrderNumber: row.work_order_number || "", report: row.report || "",
      closureCustomValues: parseJsonObject(row.closure_custom_values_json, {})
    });
    await db.run(
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
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_BATCH_UPDATE",
    details: { count: rows.length, entryIds: rows.map((row) => row.id),
      planningSnapshotSynced: snapshotProvided, planningResync, rows: summaries.slice(0, 25) }
  });
  return { ok: true, updatedCount: rows.length };
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
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("ronde:batch", "Le motif d'annulation est obligatoire.", "RONDE_BATCH_CANCEL_REASON_REQUIRED");
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const openIds = rows.filter((row) => row.status === "EN_COURS").map((row) => row.id);
  if (openIds.length) {
    const placeholders = openIds.map(() => "?").join(", ");
    const now = new Date().toISOString();
    await db.run(
      `UPDATE ronde_entries SET status = 'ANNULE', cancellation_reason = ?, closed_at = ?, updated_at = ?
       WHERE id IN (${placeholders})`,
      [reason, now, now, ...openIds]
    );
  }
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown", action: "RONDE_BATCH_CANCEL",
    details: { reason, cancelledCount: openIds.length, skippedCount: rows.length - openIds.length, entryIds: openIds } });
  return { ok: true, cancelledCount: openIds.length, skippedCount: rows.length - openIds.length };
}

/** @param {object} store @param {object} row @returns {Promise<string>} */
async function findCreatorUsername(store, row) {
  const auditDb = typeof store.getAuditPersistence === "function" ? store.getAuditPersistence() : null;
  if (!auditDb) return "";
  const batchId = String(row.request_batch_id || "").trim();
  const action = batchId ? "RONDE_BATCH_CREATE" : "RONDE_CREATE";
  try {
    const logs = await auditDb.all(
      "SELECT actor_username, details_json FROM audit_logs WHERE action = ? ORDER BY occurred_at DESC LIMIT 300",
      [action]
    );
    for (const log of logs) {
      const details = parseJsonObject(log.details_json, {});
      if (batchId ? details.batchId === batchId : details.id === row.id) return String(log.actor_username || "").trim();
    }
  } catch {
    return "";
  }
  return "";
}

/**
 * Supprime les rondes non clôturées d'un lot.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function bulkDeleteRondeBatch(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("ronde:batch", "Le motif de suppression est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const closedRows = rows.filter((row) => row.status === "CLOTURE");
  const deletable = rows.filter((row) => row.status !== "CLOTURE");
  const isManager = payload.requesterRole === "RESPONSABLE" || payload.requesterRole === "DEV";
  if (!isManager) {
    for (const row of deletable) {
      const creator = await findCreatorUsername(store, row);
      if (!creator || creator.toLowerCase() !== String(payload.requesterUsername || "").trim().toLowerCase()) {
        store.fail("ronde:batch", "Suppression refusée : vous ne pouvez supprimer que vos propres créations.",
          "RONDE_BATCH_DELETE_FORBIDDEN_NOT_OWNER");
      }
    }
  }
  let disabledProgrammingCount = 0;
  const now = new Date().toISOString();
  for (const row of closedRows) {
    const snapshot = parseJsonObject(row.request_planning_snapshot_json, null);
    if (snapshot?.version === 1 && snapshot.createRoundsEnabled !== false) {
      snapshot.createRoundsEnabled = false;
      await db.run(
        "UPDATE ronde_entries SET request_planning_snapshot_json = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(snapshot), now, row.id]
      );
      disabledProgrammingCount += 1;
    }
  }
  if (deletable.length) {
    const placeholders = deletable.map(() => "?").join(", ");
    await db.run(`DELETE FROM ronde_entries WHERE id IN (${placeholders})`, deletable.map((row) => row.id));
  }
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown", action: "RONDE_BATCH_DELETE",
    details: { reason, deletedCount: deletable.length, preservedClosedCount: closedRows.length,
      disabledProgrammingCount, deleted: deletable.map((row) => ({
        siteDisplay: row.site_display || "", requestDate: row.request_date || "", status: row.status || ""
      })) } });
  return { ok: true, deletedCount: deletable.length, skippedCount: closedRows.length };
}

module.exports = {
  bulkCancelRondeBatch,
  bulkDeleteRondeBatch,
  createRonde,
  getRondeTodayInProgressCounts,
  listRondes,
  setRondeStatus,
  updateRonde,
  updateRondeBatchSharedFields
};
