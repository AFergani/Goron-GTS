const ALLOWED_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);

function parseOptionsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

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
