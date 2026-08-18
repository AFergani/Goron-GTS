/**
 * Helpers d'affichage et mapping SQL → API Main courante.
 *
 * @module electron/store/domains/mainCourante/mapping
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeDisplayName(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameOperatorDisplay(a, b) {
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

/**
 * @param {string} iso
 * @returns {string}
 */
function formatObservationDateFr(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * @param {unknown} managerName
 * @param {unknown} observation
 * @returns {string}
 */
function formatManagerObservation(managerName, observation) {
  const cleanObs = String(observation || "").trim();
  if (!cleanObs) return "";
  const cleanManager = String(managerName || "").trim() || "Responsable";
  return `${formatObservationDateFr(new Date().toISOString())}: ${cleanManager} : ${cleanObs}`;
}

/**
 * @param {unknown} previous
 * @param {unknown} managerName
 * @param {unknown} addition
 * @returns {string}
 */
function mergeMainCouranteObservations(previous, managerName, addition) {
  const p = String(previous || "").trim();
  const a = formatManagerObservation(managerName, addition);
  if (!p) return a;
  if (!a) return p;
  return `${p}\n---\n${a}`;
}

/**
 * Mappe une ligne SQL vers l'objet API main courante.
 *
 * @param {object} row
 * @returns {object}
 */
function mapMainCouranteRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    operatorName: row.operator_name,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    anomalyTypeId: row.anomaly_type_id,
    anomalyTypeLabel: row.anomaly_type_label,
    information: row.information,
    status: row.status,
    managerObservation: row.manager_observation || undefined,
    managerName: row.manager_name || undefined,
    consultedByManagerAt: row.consulted_by_manager_at || undefined,
    consultedByManagerName: row.consulted_by_manager_name || undefined,
    consultedByOperatorAt: row.consulted_by_operator_at || undefined,
    priseEnCompteAt: row.prise_en_compte_at || undefined,
    closedAt: row.closed_at || undefined,
    archivedAt: row.archived_at || undefined
  };
}

module.exports = {
  sameOperatorDisplay,
  formatManagerObservation,
  mergeMainCouranteObservations,
  mapMainCouranteRow
};
