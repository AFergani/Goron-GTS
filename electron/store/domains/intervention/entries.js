/**
 * CRUD et statut des interventions dans PostgreSQL.
 *
 * Liens vers Ronde et Gardiennage : lecture dans la même base (première fiche liée).
 *
 * @module electron/store/domains/intervention/entries
 */

const { actorName } = require("../../core/actorName");
const { assertOptimisticLock } = require("../data/optimisticLock");
const { allocateNextDailyCode } = require("../../core/dailyEntryCode");
const { ensureInterventionPayload, getMissingClosureFieldsFromRow } = require("./helpers");
const {
  INTERVENTION_ENTRY_SELECT,
  mapInterventionRow,
  parseExportExtraJson,
  requireEntryId,
  toInterventionAuditSnapshot
} = require("./mapping");
const { requireInterventionPersistence } = require("./persistence");

/**
 * Normalise `exportExtraValues` avant persistance JSON.
 *
 * Allowlist = variables FORM=INTERVENTION (`data_form_variables`)
 * ∪ champs legacy éventuels (`data_intervention_word_extra_fields`)
 * ∪ clés système date logique.
 * Les clés déjà présentes dans le payload (orphelins / merge update) sont conservées
 * si elles respectent le format de clé technique.
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {object} payload
 * @returns {Promise<string>}
 */
async function normalizeExportExtraJson(db, payload) {
  const RESERVED_KEYS = new Set(["date_logique_passage", "date_logique", "transition_date"]);
  const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/i;
  const raw =
    payload.exportExtraValues && typeof payload.exportExtraValues === "object"
      ? payload.exportExtraValues
      : {};

  const allow = new Set(RESERVED_KEYS);
  try {
    const formRows = await db.all(
      `SELECT DISTINCT v.field_key AS field_key
       FROM data_form_variables v
       INNER JOIN data_form_variable_assignments a ON a.variable_id = v.id
       WHERE v.is_active = 1
         AND UPPER(a.assignment_kind) = 'FORM'
         AND UPPER(a.assignment_value) = 'INTERVENTION'`,
      []
    );
    for (const row of formRows) {
      const key = String(row.field_key || "").trim();
      if (key) allow.add(key);
    }
  } catch {
    // Table variables absente : on s'appuie sur legacy + clés payload valides.
  }
  try {
    const legacyRows = await db.all(
      "SELECT field_key FROM data_intervention_word_extra_fields ORDER BY sort_order",
      []
    );
    for (const row of legacyRows) {
      const key = String(row.field_key || "").trim();
      if (key) allow.add(key);
    }
  } catch {
    // Table legacy absente ou vide : normal après bascule Paramètres → Variables.
  }

  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key || "").trim();
    if (!k || k.length > 64) continue;
    if (!allow.has(k) && !KEY_RE.test(k)) continue;
    out[k] = String(value ?? "").trim().slice(0, 4000);
  }
  return JSON.stringify(out);
}

/**
 * Première ronde / premier gardiennage encore actifs liés à chaque intervention.
 * Une fiche annulée ne bloque pas une nouvelle demande.
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>}
 */
async function getCrossDomainLinks(db, ids) {
  const links = new Map(ids.map((id) => [id, {}]));
  if (ids.length === 0) return links;
  const placeholders = ids.map(() => "?").join(", ");
  const rondeRows = await db.all(
    `SELECT id, origin_intervention_id FROM ronde_entries
     WHERE origin_intervention_id IN (${placeholders}) AND status <> 'ANNULE'
     ORDER BY created_at ASC`,
    ids
  );
  for (const row of rondeRows) {
    const link = links.get(row.origin_intervention_id);
    if (link && !link.linked_ronde_id) link.linked_ronde_id = row.id;
  }
  const gardiennageRows = await db.all(
    `SELECT id, intervention_id FROM gardiennage_entries
     WHERE intervention_id IN (${placeholders}) AND status <> 'ANNULE'
     ORDER BY created_at ASC`,
    ids
  );
  for (const row of gardiennageRows) {
    const link = links.get(row.intervention_id);
    if (link && !link.linked_gardiennage_id) link.linked_gardiennage_id = row.id;
  }
  return links;
}

/**
 * Liste les interventions (hors archivées par défaut).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, includeArchived?: boolean }} payload
 * @returns {Promise<object[]>}
 */
async function listInterventions(store, { requesterRole, includeArchived = false }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:list");
  const rows = await db.all(
    `SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries
     ${includeArchived ? "" : "WHERE archived_at IS NULL"}
     ORDER BY request_date DESC, request_time DESC, id DESC`,
    []
  );
  const links = await getCrossDomainLinks(db, rows.map((row) => row.id));
  return rows.map((row) => mapInterventionRow({ ...row, ...(links.get(row.id) || {}) }));
}

/**
 * Compte les interventions en cours (badge sidebar).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<{ count: number }>}
 */
async function getInterventionOpenCount(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:openCount");
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM intervention_entries
     WHERE archived_at IS NULL AND status = 'EN_COURS'`,
    []
  );
  return { count: Number(row?.count || 0) };
}

/**
 * Existence d'une fiche (liens Gardiennage / Ronde). PG down : `PG_UNAVAILABLE`.
 *
 * @param {import('../../../userStore')} store
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function hasInterventionEntry(store, id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return false;
  const db = requireInterventionPersistence(store, "intervention:hasEntry");
  return Boolean(await db.get("SELECT id FROM intervention_entries WHERE id = ? LIMIT 1", [cleanId]));
}

/**
 * Crée une intervention (idempotente si l'id existe déjà).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function createIntervention(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "intervention:create");
  const db = requireInterventionPersistence(store, "intervention:create");
  const normalized = ensureInterventionPayload(store, payload);
  const extraJson = await normalizeExportExtraJson(db, payload);
  const now = new Date().toISOString();
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.get(
      `SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (existing) return { existing };
    const dailyCode = await allocateNextDailyCode(tx, "intervention", normalized.requestDate);
    await tx.run(
      `INSERT INTO intervention_entries (
        id, created_at, updated_at, site_id, site_display, request_reason, request_date, request_time,
        arrival_date, arrival_time, departure_time, departure_date, delay_minutes, work_order_number,
        report, intervenant_id, intervenant_name, status, export_extra_json, daily_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId, now, now, normalized.siteId, normalized.siteDisplay, normalized.requestReason,
        normalized.requestDate, normalized.requestTime, normalized.arrivalDate, normalized.arrivalTime || null,
        normalized.departureTime || null, normalized.departureDate, normalized.delayMinutes,
        normalized.workOrderNumber || null, normalized.report || null, normalized.intervenantId,
        normalized.intervenantName, "EN_COURS", extraJson, dailyCode
      ]
    );
    return { existing: null };
  });
  if (outcome.existing) {
    store.logAudit({
      actorUsername: actor,
      action: "INTERVENTION_CREATE_IDEMPOTENT",
      details: { id: entryId }
    });
    return mapInterventionRow(outcome.existing);
  }
  const created = await db.get(
    `SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries WHERE id = ?`,
    [entryId]
  );
  const mapped = mapInterventionRow(created);
  await store.recordEntityChange({
    entityType: "intervention_entries",
    entityId: entryId,
    changedBy: actor,
    snapshot: toInterventionAuditSnapshot(mapped)
  });
  store.logAudit({
    actorUsername: actor,
    action: "INTERVENTION_CREATE",
    details: { id: entryId, created: toInterventionAuditSnapshot(mapped) }
  });
  return mapped;
}

/**
 * Met à jour une intervention (hors archivée), avec contrôle optimiste.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function updateIntervention(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "intervention:update");
  const db = requireInterventionPersistence(store, "intervention:update");
  const normalized = ensureInterventionPayload(store, payload);
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) store.fail("intervention:update", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
    if (row.archived_at) {
      store.fail("intervention:update", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
    }
    assertOptimisticLock(
      store,
      "intervention:update",
      row,
      payload.expectedUpdatedAt,
      "INTERVENTION_CONFLICT",
      "Intervention modifiée ailleurs. Actualisez la liste."
    );
    const mergedExtras = {
      ...parseExportExtraJson(row.export_extra_json),
      ...(payload.exportExtraValues && typeof payload.exportExtraValues === "object" ? payload.exportExtraValues : {})
    };
    const extraJson = await normalizeExportExtraJson(tx, { exportExtraValues: mergedExtras });
    const now = new Date().toISOString();
    const result = await tx.run(
      `UPDATE intervention_entries SET updated_at = ?, site_id = ?, site_display = ?, request_reason = ?,
        request_date = ?, request_time = ?, arrival_date = ?, arrival_time = ?, departure_time = ?,
        departure_date = ?, delay_minutes = ?, work_order_number = ?, report = ?, intervenant_id = ?,
        intervenant_name = ?, export_extra_json = ? WHERE id = ? AND updated_at = ?`,
      [
        now, normalized.siteId, normalized.siteDisplay, normalized.requestReason, normalized.requestDate,
        normalized.requestTime, normalized.arrivalDate, normalized.arrivalTime || null,
        normalized.departureTime || null, normalized.departureDate, normalized.delayMinutes,
        normalized.workOrderNumber || null, normalized.report || null, normalized.intervenantId,
        normalized.intervenantName, extraJson, entryId, payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) {
      store.fail("intervention:update", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
    }
    return row;
  });
  const updated = mapInterventionRow(
    await db.get(`SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries WHERE id = ?`, [entryId])
  );
  const historyBefore = await store.getEntityChangeHistory("intervention_entries", entryId, 3);
  await store.recordEntityChange({
    entityType: "intervention_entries",
    entityId: entryId,
    changedBy: actor,
    snapshot: toInterventionAuditSnapshot(updated)
  });
  store.logAudit({
    actorUsername: actor,
    action: "INTERVENTION_UPDATE",
    details: {
      id: entryId,
      before: toInterventionAuditSnapshot(existing),
      after: toInterventionAuditSnapshot(updated),
      historyBefore
    }
  });
  return updated;
}

/**
 * Change le statut (en cours / clôturée / annulée).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function setInterventionStatus(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "intervention:status");
  const db = requireInterventionPersistence(store, "intervention:status");
  const nextStatus = payload.status === "ANNULE" ? "ANNULE" : payload.status === "CLOTURE" ? "CLOTURE" : "EN_COURS";
  const reason = String(payload.cancellationReason || "").trim();
  if (nextStatus === "ANNULE" && !reason) {
    store.fail("intervention:status", "Le motif d'annulation est obligatoire.", "INTERVENTION_CANCEL_REASON_REQUIRED");
  }
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) store.fail("intervention:status", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
    if (row.archived_at) {
      store.fail("intervention:status", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
    }
    assertOptimisticLock(
      store,
      "intervention:status",
      row,
      payload.expectedUpdatedAt,
      "INTERVENTION_CONFLICT",
      "Intervention modifiée ailleurs. Actualisez la liste."
    );
    if (nextStatus === "CLOTURE") {
      const missing = getMissingClosureFieldsFromRow(row);
      if (missing.length) {
        store.fail(
          "intervention:status",
          `Clôture impossible : complétez ${missing.join(", ")}.`,
          "INTERVENTION_CLOSE_REQUIRED_FIELDS_MISSING"
        );
      }
    }
    const now = new Date().toISOString();
    const result = await tx.run(
      `UPDATE intervention_entries
       SET status = ?, cancellation_reason = ?, closed_at = ?, updated_at = ?
       WHERE id = ? AND updated_at = ?`,
      [
        nextStatus,
        nextStatus === "ANNULE" ? reason : null,
        nextStatus === "EN_COURS" ? null : now,
        now,
        entryId,
        payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) {
      store.fail("intervention:status", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
    }
    return { row, now };
  });
  const updated = mapInterventionRow(
    await db.get(`SELECT ${INTERVENTION_ENTRY_SELECT} FROM intervention_entries WHERE id = ?`, [entryId])
  );
  const historyBefore = await store.getEntityChangeHistory("intervention_entries", entryId, 3);
  await store.recordEntityChange({
    entityType: "intervention_entries",
    entityId: entryId,
    changedBy: actor,
    snapshot: toInterventionAuditSnapshot(updated)
  });
  store.logAudit({
    actorUsername: actor,
    action: nextStatus === "ANNULE" ? "INTERVENTION_CANCEL" : nextStatus === "CLOTURE" ? "INTERVENTION_CLOSE" : "INTERVENTION_REOPEN",
    details: {
      id: entryId,
      before: {
        status: existing.row.status,
        cancellationReason: existing.row.cancellation_reason || "",
        closedAt: existing.row.closed_at || ""
      },
      after: {
        status: nextStatus,
        cancellationReason: nextStatus === "ANNULE" ? reason : "",
        closedAt: nextStatus === "EN_COURS" ? "" : existing.now
      },
      historyBefore
    }
  });
  return updated;
}

module.exports = {
  createIntervention,
  getInterventionOpenCount,
  hasInterventionEntry,
  listInterventions,
  setInterventionStatus,
  updateIntervention
};
