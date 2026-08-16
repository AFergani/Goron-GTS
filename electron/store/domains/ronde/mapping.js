/**
 * Mapping PostgreSQL et snapshots d'audit du domaine Rondes.
 *
 * @module electron/store/domains/ronde/mapping
 */

/** @param {unknown} raw @param {object|null} fallback @returns {object|null} */
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

/** @param {unknown} raw @returns {object|null} */
function parsePlanningSnapshot(raw) {
  const parsed = parseJsonObject(raw, null);
  return parsed?.version === 1 ? parsed : null;
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

/** @param {object} row @returns {object} */
function toRondeAuditSnapshot(row) {
  return {
    source: row.source || "URGENCE",
    siteDisplay: row.site_display || "",
    requestDate: row.request_date || "",
    motifLabel: row.motif_category || "",
    intervenantName: row.intervenant_name || "",
    arrivalTime: row.arrival_time || "",
    departureTime: row.departure_time || "",
    status: row.status || ""
  };
}

module.exports = {
  mapRondeRow,
  parseJsonObject,
  parsePlanningSnapshot,
  toRondeAuditSnapshot
};
