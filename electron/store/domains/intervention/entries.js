/**
 * CRUD, statut et facturation des interventions dans PostgreSQL.
 *
 * @module electron/store/domains/intervention/entries
 */

const { requireInterventionPersistence } = require("./persistence");
const { ensureInterventionPayload, getMissingClosureFieldsFromRow } = require("./helpers");
const { mapInterventionRow, parseExportExtraJson } = require("./mapping");

/**
 * Filtre les valeurs d'export selon les champs configurés dans PostgreSQL.
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {object} payload
 * @returns {Promise<string>}
 */
async function normalizeExportExtraJson(db, payload) {
  const defs = await db.all("SELECT field_key FROM data_intervention_word_extra_fields ORDER BY sort_order", []);
  const raw = payload.exportExtraValues && typeof payload.exportExtraValues === "object" ? payload.exportExtraValues : {};
  const out = {};
  for (const { field_key: key } of defs) out[key] = String(raw[key] ?? "").trim().slice(0, 4000);
  return JSON.stringify(out);
}

/** @param {object} store @param {object} db @param {string[]} ids @returns {Promise<Map<string, object>>} */
async function getCrossDomainLinks(store, db, ids) {
  const links = new Map(ids.map((id) => [id, {}]));
  if (ids.length === 0) return links;
  const placeholders = ids.map(() => "?").join(", ");
  const rondeRows = await db.all(
    `SELECT id, origin_intervention_id FROM ronde_entries
     WHERE origin_intervention_id IN (${placeholders}) ORDER BY created_at ASC`,
    ids
  );
  for (const row of rondeRows) {
    const link = links.get(row.origin_intervention_id);
    if (link && !link.linked_ronde_id) link.linked_ronde_id = row.id;
  }
  const gardiennageRows = await db.all(
    `SELECT id, intervention_id FROM gardiennage_entries
     WHERE intervention_id IN (${placeholders}) ORDER BY created_at ASC`,
    ids
  );
  for (const row of gardiennageRows) {
    const link = links.get(row.intervention_id);
    if (link && !link.linked_gardiennage_id) link.linked_gardiennage_id = row.id;
  }
  return links;
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object[]>} */
async function listInterventions(store, { requesterRole, includeArchived = false }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:list");
  const rows = await db.all(
    `SELECT * FROM intervention_entries ${includeArchived ? "" : "WHERE archived_at IS NULL"}
     ORDER BY request_date DESC, request_time DESC, id DESC`,
    []
  );
  const links = await getCrossDomainLinks(store, db, rows.map((row) => row.id));
  return rows.map((row) => mapInterventionRow({ ...row, ...(links.get(row.id) || {}) }));
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<{count:number}>} */
async function getInterventionOpenCount(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:openCount");
  const row = await db.get("SELECT COUNT(*) AS count FROM intervention_entries WHERE archived_at IS NULL AND status = 'EN_COURS'", []);
  return { count: Number(row?.count || 0) };
}

/** @param {import('../../../userStore')} store @param {string} id @returns {Promise<boolean>} */
async function hasInterventionEntry(store, id) {
  if (!id) return false;
  const db = typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || db.engine !== "postgres" || !db.isOpen()) return false;
  return Boolean(await db.get("SELECT id FROM intervention_entries WHERE id = ? LIMIT 1", [id]));
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function createInterventionEntry(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireInterventionPersistence(store, "intervention:create");
  const normalized = ensureInterventionPayload(store, payload);
  const existing = await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]);
  if (existing) {
    store.logAudit({ actorUsername: payload.requesterUsername || "unknown", action: "INTERVENTION_CREATE_IDEMPOTENT", details: { id: payload.id } });
    return mapInterventionRow(existing);
  }
  const now = new Date().toISOString();
  const extraJson = await normalizeExportExtraJson(db, payload);
  await db.run(
    `INSERT INTO intervention_entries (
      id, created_at, updated_at, site_id, site_display, request_reason, request_date, request_time,
      arrival_date, arrival_time, departure_time, departure_date, delay_minutes, work_order_number,
      report, intervenant_id, intervenant_name, status, billing_status, billing_reason, export_extra_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, now, now, normalized.siteId, normalized.siteDisplay, normalized.requestReason,
      normalized.requestDate, normalized.requestTime, normalized.arrivalDate, normalized.arrivalTime || null,
      normalized.departureTime || null, normalized.departureDate, normalized.delayMinutes,
      normalized.workOrderNumber || null, normalized.report || null, normalized.intervenantId,
      normalized.intervenantName, "EN_COURS", "FACTURABLE", null, extraJson]
  );
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown", action: "INTERVENTION_CREATE", details: {
    id: payload.id, created: { siteDisplay: normalized.siteDisplay, requestReason: normalized.requestReason,
      requestDate: normalized.requestDate, requestTime: normalized.requestTime, intervenantName: normalized.intervenantName }
  } });
  return mapInterventionRow(await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]));
}

/** @param {object} row @returns {object} */
function auditSnapshot(row) {
  return {
    siteDisplay: row.site_display || "", requestReason: row.request_reason || "", requestDate: row.request_date || "",
    requestTime: row.request_time || "", arrivalDate: row.arrival_date || "", arrivalTime: row.arrival_time || "",
    departureDate: row.departure_date || "", departureTime: row.departure_time || "",
    workOrderNumber: row.work_order_number || "", intervenantName: row.intervenant_name || ""
  };
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function updateInterventionEntry(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireInterventionPersistence(store, "intervention:update");
  const row = await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]);
  if (!row) store.fail("intervention:update", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
  if (row.archived_at) store.fail("intervention:update", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
  if (String(row.updated_at) !== String(payload.expectedUpdatedAt || "")) store.fail("intervention:update", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  const normalized = ensureInterventionPayload(store, payload);
  const mergedExtras = { ...parseExportExtraJson(row.export_extra_json), ...(payload.exportExtraValues && typeof payload.exportExtraValues === "object" ? payload.exportExtraValues : {}) };
  const now = new Date().toISOString();
  const extraJson = await normalizeExportExtraJson(db, { exportExtraValues: mergedExtras });
  const result = await db.run(
    `UPDATE intervention_entries SET updated_at = ?, site_id = ?, site_display = ?, request_reason = ?,
      request_date = ?, request_time = ?, arrival_date = ?, arrival_time = ?, departure_time = ?,
      departure_date = ?, delay_minutes = ?, work_order_number = ?, report = ?, intervenant_id = ?,
      intervenant_name = ?, export_extra_json = ? WHERE id = ? AND updated_at = ?`,
    [now, normalized.siteId, normalized.siteDisplay, normalized.requestReason, normalized.requestDate,
      normalized.requestTime, normalized.arrivalDate, normalized.arrivalTime || null,
      normalized.departureTime || null, normalized.departureDate, normalized.delayMinutes,
      normalized.workOrderNumber || null, normalized.report || null, normalized.intervenantId,
      normalized.intervenantName, extraJson, payload.id, payload.expectedUpdatedAt]
  );
  if (!result.changes) store.fail("intervention:update", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown", action: "INTERVENTION_UPDATE", details: {
    id: payload.id, before: auditSnapshot(row), after: {
      siteDisplay: normalized.siteDisplay, requestReason: normalized.requestReason, requestDate: normalized.requestDate,
      requestTime: normalized.requestTime, arrivalDate: normalized.arrivalDate || "", arrivalTime: normalized.arrivalTime,
      departureDate: normalized.departureDate || "", departureTime: normalized.departureTime,
      workOrderNumber: normalized.workOrderNumber, intervenantName: normalized.intervenantName
    }
  } });
  return mapInterventionRow(await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]));
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function setInterventionStatus(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireInterventionPersistence(store, "intervention:status");
  const row = await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]);
  if (!row) store.fail("intervention:status", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
  if (row.archived_at) store.fail("intervention:status", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
  if (String(row.updated_at) !== String(payload.expectedUpdatedAt || "")) store.fail("intervention:status", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  const nextStatus = payload.status === "ANNULE" ? "ANNULE" : payload.status === "CLOTURE" ? "CLOTURE" : "EN_COURS";
  const reason = String(payload.cancellationReason || "").trim();
  if (nextStatus === "ANNULE" && !reason) store.fail("intervention:status", "Le motif d'annulation est obligatoire.", "INTERVENTION_CANCEL_REASON_REQUIRED");
  if (nextStatus === "CLOTURE") {
    const missing = getMissingClosureFieldsFromRow(row);
    if (missing.length) store.fail("intervention:status", `Clôture impossible: complétez ${missing.join(", ")}.`, "INTERVENTION_CLOSE_REQUIRED_FIELDS_MISSING");
  }
  const now = new Date().toISOString();
  const result = await db.run(
    "UPDATE intervention_entries SET status = ?, cancellation_reason = ?, closed_at = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
    [nextStatus, nextStatus === "ANNULE" ? reason : null, nextStatus === "EN_COURS" ? null : now, now, payload.id, payload.expectedUpdatedAt]
  );
  if (!result.changes) store.fail("intervention:status", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown",
    action: nextStatus === "ANNULE" ? "INTERVENTION_CANCEL" : nextStatus === "CLOTURE" ? "INTERVENTION_CLOSE" : "INTERVENTION_REOPEN",
    details: { id: payload.id, before: { status: row.status, cancellationReason: row.cancellation_reason || "", closedAt: row.closed_at || "" },
      after: { status: nextStatus, cancellationReason: nextStatus === "ANNULE" ? reason : "", closedAt: nextStatus === "EN_COURS" ? "" : now } } });
  return mapInterventionRow(await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]));
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function setInterventionBillingStatus(store, payload) {
  if (payload.requesterRole !== payload.role.RESPONSABLE && payload.requesterRole !== payload.role.DEV) {
    store.fail("intervention:billing", "Accès refusé : action réservée aux responsables.", "AUTH_FORBIDDEN");
  }
  const db = requireInterventionPersistence(store, "intervention:billing");
  const row = await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]);
  if (!row) store.fail("intervention:billing", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
  if (row.archived_at) store.fail("intervention:billing", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
  if (String(row.updated_at) !== String(payload.expectedUpdatedAt || "")) store.fail("intervention:billing", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  const next = payload.billingStatus === "NON_FACTURABLE" ? "NON_FACTURABLE" : "FACTURABLE";
  const reason = String(payload.reason || "").trim();
  if (next === "NON_FACTURABLE" && !reason) store.fail("intervention:billing", "Une justification est obligatoire pour passer en non facturable.", "INTERVENTION_BILLING_REASON_REQUIRED");
  const now = new Date().toISOString();
  const result = await db.run("UPDATE intervention_entries SET billing_status = ?, billing_reason = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
    [next, next === "NON_FACTURABLE" ? reason : null, now, payload.id, payload.expectedUpdatedAt]);
  if (!result.changes) store.fail("intervention:billing", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown", action: "INTERVENTION_BILLING_UPDATE", details: {
    id: payload.id, before: { billingStatus: row.billing_status || "FACTURABLE", billingReason: row.billing_reason || "" },
    after: { billingStatus: next, billingReason: next === "NON_FACTURABLE" ? reason : "" }
  } });
  return mapInterventionRow(await db.get("SELECT * FROM intervention_entries WHERE id = ?", [payload.id]));
}

module.exports = {
  listInterventions, getInterventionOpenCount, hasInterventionEntry, createInterventionEntry,
  updateInterventionEntry, setInterventionStatus, setInterventionBillingStatus, normalizeExportExtraJson
};
