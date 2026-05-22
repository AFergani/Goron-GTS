/**
 * Référentiel des champs supplémentaires pour l'export Word des interventions.
 *
 * Table `data_intervention_word_extra_fields` (schéma dans `schemaBusinessData`).
 * Lecture seule côté API : les valeurs saisies sur chaque fiche sont filtrées dans
 * `intervention.js` (`normalizeExportExtraJson`) selon les `field_key` actifs.
 */

/** Types de champ alignés sur les variables de formulaires Paramètres. */
const ALLOWED_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);

/**
 * @param {string} raw - JSON tableau d'options (type `select`).
 * @returns {string[]}
 */
function parseOptionsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Liste les définitions de champs triées (`sort_order`, libellé).
 *
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Array<{ id: string, sortOrder: number, fieldKey: string, label: string, fieldType: string, placeholder: string, options: string[], createdAt: string, updatedAt: string }>}
 */
function listInterventionWordExtraFields(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const rows = store.db
    .prepare(
      `SELECT id, sort_order AS sortOrder, field_key AS fieldKey, label,
              field_type AS fieldType, placeholder, options_json AS optionsJson,
              created_at AS createdAt, updated_at AS updatedAt
       FROM data_intervention_word_extra_fields
       ORDER BY sort_order ASC, label ASC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    sortOrder: row.sortOrder,
    fieldKey: row.fieldKey,
    label: row.label,
    fieldType: row.fieldType && ALLOWED_TYPES.has(String(row.fieldType)) ? String(row.fieldType) : "text",
    placeholder: row.placeholder ?? "",
    options: parseOptionsJson(row.optionsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

module.exports = {
  listInterventionWordExtraFields
};
