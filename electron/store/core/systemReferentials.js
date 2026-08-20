/**
 * Types / motifs système injectés en base (toujours présents, non modifiables).
 *
 * Garantit un libellé universel pour la saisie main courante et rondes
 * même si aucun référentiel métier n'a encore été créé.
 * Consommé par `data/referentials` et `data/rondeMotifTypes`.
 *
 * @module electron/store/core/systemReferentials
 */

/** Libellé type d'anomalie par défaut (main courante). */
const SYSTEM_ANOMALY_TYPE_LABEL = "Voir Observation";
/** Identifiant stable si insertion (bases sans ligne existante). */
const SYSTEM_ANOMALY_TYPE_ID = "sys-anomaly-voir-observation";
/** Couleur badge par défaut du type d'anomalie système. */
const SYSTEM_ANOMALY_TYPE_COLOR = "#1f5fcf";

/** Libellé motif de ronde par défaut. */
const SYSTEM_RONDE_MOTIF_LABEL = "Voir Consigne";
/** Identifiant stable si insertion (bases sans ligne existante). */
const SYSTEM_RONDE_MOTIF_ID = "sys-ronde-motif-voir-consigne";
/** Couleur badge par défaut du motif de ronde système. */
const SYSTEM_RONDE_MOTIF_COLOR = "#5c6bc0";

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeRefLabel(value) {
  return String(value || "").trim().toLowerCase();
}

const SYSTEM_ANOMALY_TYPE_LABEL_NORM = normalizeRefLabel(SYSTEM_ANOMALY_TYPE_LABEL);
const SYSTEM_RONDE_MOTIF_LABEL_NORM = normalizeRefLabel(SYSTEM_RONDE_MOTIF_LABEL);

/**
 * @param {{ id?: unknown, label?: unknown }|null|undefined} row
 * @param {string} systemId
 * @param {string} systemLabelNorm
 * @returns {boolean}
 */
function isSystemRefRow(row, systemId, systemLabelNorm) {
  if (!row) return false;
  return String(row.id || "") === systemId || normalizeRefLabel(row.label) === systemLabelNorm;
}

/**
 * Indique si une ligne type d'anomalie est protégée (id stable ou libellé canonique).
 *
 * @param {{ id?: unknown, label?: unknown }|null|undefined} row
 * @returns {boolean}
 */
function isSystemAnomalyType(row) {
  return isSystemRefRow(row, SYSTEM_ANOMALY_TYPE_ID, SYSTEM_ANOMALY_TYPE_LABEL_NORM);
}

/**
 * Indique si une ligne motif de ronde est protégée.
 *
 * @param {{ id?: unknown, label?: unknown }|null|undefined} row
 * @returns {boolean}
 */
function isSystemRondeMotifType(row) {
  return isSystemRefRow(row, SYSTEM_RONDE_MOTIF_ID, SYSTEM_RONDE_MOTIF_LABEL_NORM);
}

module.exports = {
  SYSTEM_ANOMALY_TYPE_LABEL,
  SYSTEM_ANOMALY_TYPE_ID,
  SYSTEM_ANOMALY_TYPE_COLOR,
  SYSTEM_RONDE_MOTIF_LABEL,
  SYSTEM_RONDE_MOTIF_ID,
  SYSTEM_RONDE_MOTIF_COLOR,
  isSystemAnomalyType,
  isSystemRondeMotifType
};
