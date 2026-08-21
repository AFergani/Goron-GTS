/**
 * Mapping PostgreSQL et snapshots d'audit du domaine Rondes.
 *
 * Appelé par `entries.js` (CRUD, lots, statuts). Colonnes explicites pour éviter `SELECT *`.
 *
 * @module electron/store/domains/ronde/mapping
 */

/**
 * Colonnes de `ronde_entries` (sans préfixe table).
 * @type {string}
 */
const RONDE_ENTRY_SELECT = `id, created_at, updated_at, source, origin_intervention_id, site_id, site_display,
  request_date, motif_type_id, motif_category, motif_other, horaires_demande_obs, origin_kind, origin_detail,
  intervenant_id, intervenant_name, arrival_time, departure_time, duration_minutes, work_order_number, report,
  status, cancellation_reason, closed_at, planned_profile_id, planned_round_kind, planned_slot_key,
  closure_custom_values_json, request_planning_snapshot_json, request_batch_id`;

/**
 * Même colonnes avec préfixe `r.` pour les jointures motif.
 * @type {string}
 */
const RONDE_ENTRY_SELECT_R = RONDE_ENTRY_SELECT.split(",")
  .map((part) => `r.${part.trim()}`)
  .join(", ");

/**
 * Colonnes de `data_ronde_planned_profiles` (sans jointures d'affichage).
 * @type {string}
 */
const RONDE_PLANNED_PROFILE_SELECT = `id, label, site_id, intervenant_id, notes, is_active, closure_form_enabled,
  create_rounds_enabled, closure_fields_json, planning_valid_from, planning_valid_to,
  cancellation_request_reason, cancellation_requested_at, cancellation_requested_by,
  validated_at, validated_by, created_at, updated_at`;

/**
 * Parse un JSON objet (pg / texte).
 *
 * @param {unknown} raw
 * @param {object|null} [fallback={}]
 * @returns {object|null}
 */
function parseJsonObject(raw, fallback = {}) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (raw == null || raw === "") return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Instantané de planification v1 (demande exceptionnelle).
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
function parsePlanningSnapshot(raw) {
  const parsed = parseJsonObject(raw, null);
  return parsed?.version === 1 ? parsed : null;
}

/**
 * Identifiant de fiche ronde (trim).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} source
 * @returns {string}
 */
function requireEntryId(store, payload, source) {
  const id = String(payload?.id || "").trim();
  if (!id) store.fail(source, "Identifiant manquant.", "RONDE_ID_REQUIRED");
  return id;
}

/**
 * Convertit une ligne PostgreSQL en contrat public Ronde.
 *
 * @param {object} row
 * @returns {object}
 */
function mapRondeRow(row) {
  const label = String(row.motif_type_label || row.motif_category || "").trim();
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source || "URGENCE",
    originInterventionId: row.origin_intervention_id || null,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    requestDate: row.request_date,
    motifTypeId: row.motif_type_id || null,
    motifTypeLabel: label,
    motifRequiresFreeText: Boolean(row.motif_type_requires_free_text),
    motifDetail: row.motif_other || "",
    horairesDemandeObs: row.horaires_demande_obs || "",
    originKind: row.origin_kind || "TELESURVEILLANCE",
    originDetail: row.origin_detail || "",
    intervenantId: row.intervenant_id || null,
    intervenantName: row.intervenant_name || "",
    arrivalTime: row.arrival_time || "",
    departureTime: row.departure_time || "",
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    workOrderNumber: row.work_order_number || "",
    report: row.report || "",
    status: row.status,
    cancellationReason: row.cancellation_reason || "",
    closedAt: row.closed_at || null,
    plannedProfileId: row.planned_profile_id || null,
    plannedRoundKind: row.planned_round_kind || null,
    plannedSlotKey: row.planned_slot_key || null,
    closureCustomValues: parseJsonObject(row.closure_custom_values_json, {}),
    requestPlanningSnapshot: parsePlanningSnapshot(row.request_planning_snapshot_json),
    requestBatchId: row.request_batch_id || null,
    requestPlanningSnapshotJson: row.request_planning_snapshot_json
      ? (typeof row.request_planning_snapshot_json === "string"
        ? row.request_planning_snapshot_json
        : JSON.stringify(row.request_planning_snapshot_json))
      : null
  };
}

/**
 * Champs métier pour l'audit (libellés, pas d'UUID de fiche).
 *
 * @param {object} row - Ligne SQL
 * @returns {object}
 */
function toRondeAuditSnapshot(row) {
  return {
    source: row.source || "URGENCE",
    siteDisplay: row.site_display || row.siteDisplay || "",
    requestDate: row.request_date || row.requestDate || "",
    motifLabel: row.motif_category || row.motifCategorySnapshot || row.motifLabel || "",
    intervenantName: row.intervenant_name || row.intervenantName || "",
    arrivalTime: row.arrival_time || row.arrivalTime || "",
    departureTime: row.departure_time || row.departureTime || "",
    status: row.status || ""
  };
}

module.exports = {
  RONDE_ENTRY_SELECT,
  RONDE_ENTRY_SELECT_R,
  RONDE_PLANNED_PROFILE_SELECT,
  mapRondeRow,
  parseJsonObject,
  parsePlanningSnapshot,
  requireEntryId,
  toRondeAuditSnapshot
};
