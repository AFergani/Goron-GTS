/**
 * Mappage SQL/API du domaine Intervention.
 *
 * @module electron/store/domains/intervention/mapping
 */

/** @param {unknown} raw @returns {Record<string, unknown>} */
function parseExportExtraJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {object} row @returns {object} Objet Intervention exposé par l'API. */
function mapInterventionRow(row) {
  return {
    id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
    siteId: row.site_id || null, siteDisplay: row.site_display || "",
    requestReason: row.request_reason, requestDate: row.request_date, requestTime: row.request_time,
    arrivalDate: row.arrival_date || null, arrivalTime: row.arrival_time || "",
    departureTime: row.departure_time || "", departureDate: row.departure_date || null,
    delayMinutes: row.delay_minutes == null ? null : Number(row.delay_minutes),
    workOrderNumber: row.work_order_number || "", report: row.report || "",
    intervenantId: row.intervenant_id || null, intervenantName: row.intervenant_name || "",
    status: row.status, billingStatus: row.billing_status || "FACTURABLE",
    billingReason: row.billing_reason || "", cancellationReason: row.cancellation_reason || "",
    closedAt: row.closed_at || null, archivedAt: row.archived_at || null,
    exportExtraValues: parseExportExtraJson(row.export_extra_json),
    linkedRondeId: row.linked_ronde_id || null, linkedGardiennageId: row.linked_gardiennage_id || null
  };
}

module.exports = { parseExportExtraJson, mapInterventionRow };
