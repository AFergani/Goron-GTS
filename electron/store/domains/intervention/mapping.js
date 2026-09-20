/**
 * Mappage SQL / contrat public et snapshots d'audit du domaine Intervention.
 *
 * Appelé par `entries.js` (CRUD, statut).
 *
 * `INTERVENTION_ENTRY_SELECT` : colonnes de `intervention_entries` uniquement.
 * `linked_ronde_id` / `linked_gardiennage_id` viennent de `getCrossDomainLinks`
 * (overlay sur la ligne), pas de la table.
 *
 * N° de bon vide ou « Pas de bon » (fiches anciennes) : chaîne vide via `helpers`.
 *
 * @module electron/store/domains/intervention/mapping
 */

const { parseExportExtraJson } = require("../../core/exportExtraJson");
const { resolveWorkOrderNumber } = require("./helpers");

/**
 * Colonnes métier de `intervention_entries` (évite `SELECT *`).
 * @type {string}
 */
const INTERVENTION_ENTRY_SELECT = `id, created_at, updated_at, site_id, site_display,
  request_reason, request_date, request_time, arrival_date, arrival_time,
  departure_time, departure_date, delay_minutes, work_order_number, report,
  intervenant_id, intervenant_name, status, export_extra_json, cancellation_reason,
  closed_at, archived_at, daily_code`;

/**
 * Identifiant de fiche (trim). Obligatoire aussi à la création (id client).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} source - Préfixe d'erreur (`intervention:create`, `intervention:update`, …)
 * @returns {string}
 */
function requireEntryId(store, payload, source) {
  const id = String(payload?.id || "").trim();
  if (!id) store.fail(source, "Identifiant manquant.", "INTERVENTION_ID_REQUIRED");
  return id;
}

/**
 * Champ texte : contrat camelCase ou ligne SQL snake_case.
 *
 * @param {object} row
 * @param {string} camel
 * @param {string} snake
 * @returns {string}
 */
function textField(row, camel, snake) {
  const value = row[camel] != null && row[camel] !== "" ? row[camel] : row[snake];
  return String(value || "").trim();
}

/**
 * Convertit une ligne SQL en contrat public Intervention.
 * Overlay optionnel : `linked_ronde_id`, `linked_gardiennage_id`.
 *
 * @param {object} row
 * @returns {object}
 */
function mapInterventionRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    requestReason: row.request_reason || "",
    requestDate: row.request_date,
    requestTime: row.request_time,
    arrivalDate: row.arrival_date || null,
    arrivalTime: row.arrival_time || "",
    departureTime: row.departure_time || "",
    departureDate: row.departure_date || null,
    delayMinutes: row.delay_minutes == null ? null : Number(row.delay_minutes),
    workOrderNumber: resolveWorkOrderNumber(row.work_order_number),
    report: row.report || "",
    intervenantId: row.intervenant_id || null,
    intervenantName: row.intervenant_name || "",
    status: row.status,
    cancellationReason: row.cancellation_reason || "",
    closedAt: row.closed_at || null,
    archivedAt: row.archived_at || null,
    dailyCode: row.daily_code || "",
    exportExtraValues: parseExportExtraJson(row.export_extra_json),
    linkedRondeId: row.linked_ronde_id || null,
    linkedGardiennageId: row.linked_gardiennage_id || null
  };
}

/**
 * Champs métier pour l'audit et `entity_changes` (libellés, pas d'UUID de fiche).
 * Accepte une ligne SQL ou un contrat déjà mappé (`update` : avant = SQL, après = mappé).
 *
 * @param {object} row
 * @returns {object}
 */
function toInterventionAuditSnapshot(row) {
  return {
    siteDisplay: textField(row, "siteDisplay", "site_display"),
    requestReason: textField(row, "requestReason", "request_reason"),
    requestDate: textField(row, "requestDate", "request_date"),
    requestTime: textField(row, "requestTime", "request_time"),
    arrivalDate: textField(row, "arrivalDate", "arrival_date"),
    arrivalTime: textField(row, "arrivalTime", "arrival_time"),
    departureDate: textField(row, "departureDate", "departure_date"),
    departureTime: textField(row, "departureTime", "departure_time"),
    workOrderNumber: resolveWorkOrderNumber(row.workOrderNumber || row.work_order_number),
    report: textField(row, "report", "report"),
    intervenantName: textField(row, "intervenantName", "intervenant_name"),
    status: textField(row, "status", "status"),
    dailyCode: textField(row, "dailyCode", "daily_code")
  };
}

module.exports = {
  INTERVENTION_ENTRY_SELECT,
  mapInterventionRow,
  parseExportExtraJson,
  requireEntryId,
  toInterventionAuditSnapshot
};
