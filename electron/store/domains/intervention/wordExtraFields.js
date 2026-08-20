/**
 * Champs supplémentaires d'export Word Intervention, stockés dans PostgreSQL.
 *
 * @module electron/store/domains/intervention/wordExtraFields
 */

const { requireInterventionPersistence } = require("./persistence");

const ALLOWED_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);
const DEFAULT_FIELD_TYPE = "text";

/**
 * Parse les options JSON d’un champ de formulaire.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseOptionsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/**
 * Normalise le type de champ sur un ensemble supporté.
 *
 * @param {unknown} rawType
 * @returns {string}
 */
function normalizeFieldType(rawType) {
  const value = String(rawType ?? "").trim();
  return ALLOWED_TYPES.has(value) ? value : DEFAULT_FIELD_TYPE;
}

/**
 * Liste les définitions de champs d'export Word.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listInterventionWordExtraFields(store, payload) {
  if (!store || typeof store !== "object") {
    throw new Error("Store Intervention non initialisé.");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalide pour la liste des champs Word d'intervention.");
  }

  const requesterRole = String(payload.requesterRole ?? "").trim();
  if (typeof store.ensureDataReaderRole === "function") {
    store.ensureDataReaderRole(requesterRole);
  }

  const db = requireInterventionPersistence(store, "intervention:wordExtraFields:list");
  const rows = await db.all(
    `SELECT id, sort_order, field_key, label, field_type, placeholder, options_json, created_at, updated_at
     FROM data_intervention_word_extra_fields
     ORDER BY sort_order ASC, label ASC`,
    []
  );

  return rows.map((row) => ({
    id: row.id,
    sortOrder: Number(row.sort_order || 0),
    fieldKey: row.field_key,
    label: row.label,
    fieldType: normalizeFieldType(row.field_type),
    placeholder: String(row.placeholder ?? ""),
    options: parseOptionsJson(row.options_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

module.exports = { listInterventionWordExtraFields };
