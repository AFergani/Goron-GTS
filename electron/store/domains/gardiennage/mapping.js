/**
 * Mapping PostgreSQL, identifiant de fiche et snapshots d'audit du Gardiennage.
 *
 * Appelé par `entries.js` et `entriesLifecycle.js`.
 *
 * @module electron/store/domains/gardiennage/mapping
 */

const { parsePlanningSnapshotJson } = require("./helpers");
const { parseExportExtraJson } = require("../../core/exportExtraJson");

/**
 * Colonnes métier de `gardiennage_entries` (évite `SELECT *`).
 * @type {string}
 */
const GARDIENNAGE_ENTRY_SELECT = `id, site_id, site_display, start_time, end_time, crosses_midnight,
  recurrence_start_date, recurrence_end_date, recurrence_days, is_ponctuel,
  intervenant_id, intervenant_name, intervention_id, notes, closure_report,
  actual_start_time, actual_end_time, work_order_number, cancellation_reason,
  linked_ronde_id, planning_batch_id, planning_snapshot_json, planning_slot_start,
  planning_slot_end, status, created_at, updated_at, daily_code, export_extra_json`;

/**
 * Identifiant de fiche gardiennage (trim) ; refuse une valeur vide.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} source
 * @returns {string}
 */
function requireEntryId(store, payload, source) {
  const id = String(payload?.id || "").trim();
  if (!id) store.fail(source, "Identifiant manquant.", "GARDIENNAGE_ID_REQUIRED");
  return id;
}

/**
 * Convertit une ligne SQL en contrat public Gardiennage.
 * Snapshot de planification : uniquement V1 (sinon `null`).
 *
 * @param {object} row
 * @returns {object}
 */
function mapGardiennageRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    crossesMidnight: Boolean(row.crosses_midnight),
    recurrenceStartDate: row.recurrence_start_date || "",
    recurrenceEndDate: row.recurrence_end_date || "",
    isPonctuel: Boolean(row.is_ponctuel),
    intervenantId: row.intervenant_id || null,
    intervenantName: row.intervenant_name || "",
    notes: row.notes || "",
    status: row.status || "PLANIFIE",
    linkedInterventionId: row.intervention_id || null,
    linkedRondeId: row.linked_ronde_id || null,
    closureReport: row.closure_report || "",
    actualStartTime: row.actual_start_time || "",
    actualEndTime: row.actual_end_time || "",
    workOrderNumber: row.work_order_number || "",
    cancellationReason: row.cancellation_reason || "",
    planningBatchId: row.planning_batch_id || null,
    planningSlotStart: row.planning_slot_start || "",
    planningSlotEnd: row.planning_slot_end || "",
    planningSnapshot: parsePlanningSnapshotJson(row?.planning_snapshot_json),
    dailyCode: row.daily_code || "",
    exportExtraValues: parseExportExtraJson(row.export_extra_json)
  };
}

/**
 * Champs métier utiles à l'audit (libellés, pas d'identifiants de fiche).
 * Les liens intervention/ronde restent en audit support.
 *
 * @param {object} row - Contrat public mappé.
 * @returns {object}
 */
function toGardiennageAuditSnapshot(row) {
  return {
    siteDisplay: String(row.siteDisplay || "").trim(),
    startTime: String(row.startTime || "").trim(),
    endTime: String(row.endTime || "").trim(),
    recurrenceStartDate: String(row.recurrenceStartDate || "").trim(),
    recurrenceEndDate: String(row.recurrenceEndDate || "").trim(),
    isPonctuel: Boolean(row.isPonctuel),
    intervenantName: String(row.intervenantName || "").trim(),
    status: String(row.status || "").trim(),
    linkedInterventionId: row.linkedInterventionId || null,
    linkedRondeId: row.linkedRondeId || null,
    dailyCode: String(row.dailyCode || row.daily_code || "").trim()
  };
}

/**
 * Parse les détails d'une ligne d'audit PostgreSQL (`jsonb` ou texte).
 *
 * @param {unknown} raw
 * @returns {object}
 */
function parseAuditDetails(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (raw == null || raw === "") return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

module.exports = {
  GARDIENNAGE_ENTRY_SELECT,
  mapGardiennageRow,
  parseAuditDetails,
  requireEntryId,
  toGardiennageAuditSnapshot
};
