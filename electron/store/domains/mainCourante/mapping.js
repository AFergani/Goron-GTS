/**
 * Mappage SQL / contrat public et helpers d'affichage du domaine Main courante.
 *
 * Appelé par `entries.js` (CRUD, actions responsable, badges de consultation).
 *
 * @module electron/store/domains/mainCourante/mapping
 */

const { parseExportExtraJson } = require("../../core/exportExtraJson");

/**
 * Colonnes métier de `main_courante_entries` (évite `SELECT *`).
 *
 * @type {string}
 */
const MAIN_COURANTE_ENTRY_SELECT = `id, created_at, updated_at, operator_name, site_id, site_display,
  anomaly_type_id, anomaly_type_label, information, status, manager_observation, manager_name,
  consulted_by_manager_at, consulted_by_manager_name, consulted_by_operator_at,
  prise_en_compte_at, closed_at, daily_code, export_extra_json`;

/**
 * Identifiant d'entrée (trim). Obligatoire aussi à la création (id client).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} source - Préfixe d'erreur (`mainCourante:create`, …)
 * @returns {string}
 */
function requireEntryId(store, payload, source) {
  const id = String(payload?.id || "").trim();
  if (!id) store.fail(source, "Identifiant manquant.", "MAIN_COURANTE_ID_REQUIRED");
  return id;
}

/**
 * Normalise un nom affiché pour comparaison (trim + minuscules).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeDisplayName(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Compare deux noms opérateur/responsable en affichage (casse ignorée).
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameOperatorDisplay(a, b) {
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

/**
 * Formate un ISO en date/heure française pour les observations encadrement.
 *
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
 * Construit une ligne d'observation responsable horodatée.
 *
 * @param {unknown} managerName
 * @param {unknown} observation
 * @returns {string} Chaîne vide si observation vide.
 */
function formatManagerObservation(managerName, observation) {
  const cleanObs = String(observation || "").trim();
  if (!cleanObs) return "";
  const cleanManager = String(managerName || "").trim() || "Responsable";
  return `${formatObservationDateFr(new Date().toISOString())}: ${cleanManager} : ${cleanObs}`;
}

/**
 * Concatène une observation précédente et une nouvelle (séparateur `---`).
 *
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
 * Convertit une ligne SQL en contrat public Main courante.
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
    dailyCode: row.daily_code || "",
    exportExtraValues: parseExportExtraJson(row.export_extra_json)
  };
}

module.exports = {
  MAIN_COURANTE_ENTRY_SELECT,
  requireEntryId,
  sameOperatorDisplay,
  formatManagerObservation,
  mergeMainCouranteObservations,
  mapMainCouranteRow
};
