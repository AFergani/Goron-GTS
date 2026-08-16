/**
 * Champs supplémentaires d'export Word Intervention, stockés dans PostgreSQL.
 *
 * @module electron/store/domains/intervention/wordExtraFields
 */

const { requireInterventionPersistence } = require("./persistence");
const ALLOWED_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);

/** @param {unknown} raw @returns {string[]} */
function parseOptionsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed.map((value) => String(value ?? "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Liste les définitions de champs d'export Word.
 *
 * @param {import('../../../userStore')} store
 * @param {{requesterRole: string}} payload
 * @returns {Promise<object[]>}
 */
async function listInterventionWordExtraFields(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireInterventionPersistence(store, "intervention:wordExtraFields");
  const rows = await db.all(
    `SELECT id, sort_order, field_key, label, field_type, placeholder, options_json, created_at, updated_at
     FROM data_intervention_word_extra_fields ORDER BY sort_order ASC, label ASC`,
    []
  );
  return rows.map((row) => ({
    id: row.id, sortOrder: Number(row.sort_order || 0), fieldKey: row.field_key, label: row.label,
    fieldType: ALLOWED_TYPES.has(String(row.field_type)) ? String(row.field_type) : "text",
    placeholder: row.placeholder || "", options: parseOptionsJson(row.options_json),
    createdAt: row.created_at, updatedAt: row.updated_at
  }));
}

module.exports = { listInterventionWordExtraFields };
