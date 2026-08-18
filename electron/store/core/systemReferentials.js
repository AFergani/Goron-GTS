/**
 * Types / motifs système injectés en base (toujours présents, non modifiables).
 *
 * Garantit un libellé universel pour la saisie main courante et rondes
 * même si aucun référentiel métier n'a encore été créé.
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
 * Normalise un libellé référentiel pour comparaison (casse / espaces).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeRefLabel(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Indique si le libellé correspond au type d'anomalie système.
 *
 * @param {unknown} label
 * @returns {boolean}
 */
function isSystemAnomalyTypeLabel(label) {
  return normalizeRefLabel(label) === normalizeRefLabel(SYSTEM_ANOMALY_TYPE_LABEL);
}

/**
 * Indique si une ligne type d'anomalie est protégée (id stable ou libellé canonique).
 *
 * @param {{ id?: unknown, label?: unknown }|null|undefined} row
 * @returns {boolean}
 */
function isSystemAnomalyType(row) {
  if (!row) return false;
  return String(row.id || "") === SYSTEM_ANOMALY_TYPE_ID || isSystemAnomalyTypeLabel(row.label);
}

/**
 * Indique si le libellé correspond au motif de ronde système.
 *
 * @param {unknown} label
 * @returns {boolean}
 */
function isSystemRondeMotifLabel(label) {
  return normalizeRefLabel(label) === normalizeRefLabel(SYSTEM_RONDE_MOTIF_LABEL);
}

/**
 * Indique si une ligne motif de ronde est protégée.
 *
 * @param {{ id?: unknown, label?: unknown }|null|undefined} row
 * @returns {boolean}
 */
function isSystemRondeMotifType(row) {
  if (!row) return false;
  return String(row.id || "") === SYSTEM_RONDE_MOTIF_ID || isSystemRondeMotifLabel(row.label);
}

module.exports = {
  SYSTEM_ANOMALY_TYPE_LABEL,
  SYSTEM_ANOMALY_TYPE_ID,
  SYSTEM_ANOMALY_TYPE_COLOR,
  SYSTEM_RONDE_MOTIF_LABEL,
  SYSTEM_RONDE_MOTIF_ID,
  SYSTEM_RONDE_MOTIF_COLOR,
  normalizeRefLabel,
  isSystemAnomalyTypeLabel,
  isSystemAnomalyType,
  isSystemRondeMotifLabel,
  isSystemRondeMotifType
};
