/**
 * Mapping PostgreSQL et snapshots d'audit du Gardiennage.
 *
 * @module electron/store/domains/gardiennage/mapping
 */

/**
 * Convertit une ligne SQL en contrat public Gardiennage.
 *
 * @param {object} row
 * @returns {object}
 */
function mapGardiennageRow(row) {
  const rawSnapshot = row?.planning_snapshot_json;
  let planningSnapshot = null;
  if (rawSnapshot && typeof rawSnapshot === "object") {
    planningSnapshot = rawSnapshot;
  } else if (String(rawSnapshot || "").trim()) {
    try {
      planningSnapshot = JSON.parse(String(rawSnapshot));
    } catch {
      planningSnapshot = null;
    }
  }
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
    planningSnapshot
  };
}

/**
 * Produit les champs métier utiles à l'audit.
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
    linkedRondeId: row.linkedRondeId || null
  };
}

/**
 * Parse les détails d'une ligne d'audit PostgreSQL.
 *
 * @param {unknown} raw
 * @returns {object}
 */
function parseAuditDetails(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

module.exports = {
  mapGardiennageRow,
  parseAuditDetails,
  toGardiennageAuditSnapshot
};
