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
  intervenant_id, intervenant_name, arrival_time, departure_time, arrival_date, departure_date,
  duration_minutes, work_order_number, report,
  status, cancellation_reason, cancellation_kind, closed_at, planned_profile_id, planned_round_kind, planned_slot_key,
  closure_custom_values_json, request_planning_snapshot_json, request_batch_id,
  batch_suppressed_at, batch_suppressed_by, batch_suppressed_reason, daily_code`;

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
 * Ids ciblés d'une demande de suppression (null = tout le lot, compat. anciennes demandes).
 * @param {unknown} raw
 * @returns {string[]|null}
 */
function parseBatchDeleteEntryIds(raw) {
  if (raw == null || raw === "") return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    const ids = [...new Set(parsed.map((x) => String(x || "").trim()).filter(Boolean))];
    return ids.length ? ids : null;
  } catch {
    return null;
  }
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
  const scopedDeleteIds = parseBatchDeleteEntryIds(row.batch_delete_entry_ids_json);
  const pendingApplies =
    Boolean(row.batch_delete_requested_at) &&
    (!scopedDeleteIds || scopedDeleteIds.includes(String(row.id || "").trim()));
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
    arrivalDate: row.arrival_date || null,
    departureDate: row.departure_date || null,
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    workOrderNumber: row.work_order_number || "",
    report: row.report || "",
    status: row.status,
    cancellationReason: row.cancellation_reason || "",
    cancellationKind: row.cancellation_kind === "ANNULATION" || row.cancellation_kind === "NON_EFFECTUEE"
      ? row.cancellation_kind
      : null,
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
      : null,
    batchSuppressedAt: row.batch_suppressed_at || null,
    batchSuppressedBy: row.batch_suppressed_by || null,
    batchSuppressedReason: row.batch_suppressed_reason || "",
    batchDeleteRequestedAt: pendingApplies ? row.batch_delete_requested_at || null : null,
    batchDeleteRequestedBy: pendingApplies ? row.batch_delete_requested_by || null : null,
    batchDeleteReason: pendingApplies ? row.batch_delete_reason || "" : "",
    dailyCode: row.daily_code || "",
    // Overlay liste : premier gardiennage lié (colonne absente de ronde_entries).
    linkedGardiennageId: row.linked_gardiennage_id || null
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
    arrivalDate: row.arrival_date || row.arrivalDate || null,
    departureDate: row.departure_date || row.departureDate || null,
    status: row.status || "",
    dailyCode: row.daily_code || row.dailyCode || ""
  };
}

module.exports = {
  RONDE_ENTRY_SELECT,
  RONDE_ENTRY_SELECT_R,
  RONDE_PLANNED_PROFILE_SELECT,
  mapRondeRow,
  parseBatchDeleteEntryIds,
  parseJsonObject,
  parsePlanningSnapshot,
  requireEntryId,
  toRondeAuditSnapshot
};
