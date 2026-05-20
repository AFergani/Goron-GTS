const { generateEntityId } = require("../core/ids");

const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;
const ASSIGNMENT_KINDS = new Set(["FORM", "PROFILE", "TEMPLATE", "SITE", "FAMILLE"]);
const FORM_TARGETS = new Set(["RONDE_PLANIFIEE", "RONDE_EXCEPTIONNELLE", "INTERVENTION", "MAIN_COURANTE", "GARDIENNAGE"]);
const FIELD_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);

function parseOptionsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function listFormVariables(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const vars = store.db
    .prepare(
      `SELECT id, sort_order, field_key, label, field_type, placeholder, required, options_json, created_at, updated_at
       FROM data_form_variables
       WHERE is_active = 1
       ORDER BY sort_order ASC, label ASC`
    )
    .all();
  const assignmentRows = store.db
    .prepare(
      `SELECT variable_id, assignment_kind, assignment_value
       FROM data_form_variable_assignments
       ORDER BY created_at ASC`
    )
    .all();
  const byVar = new Map();
  assignmentRows.forEach((row) => {
    const k = String(row.variable_id || "");
    if (!k) return;
    const list = byVar.get(k) || [];
    list.push({
      kind: String(row.assignment_kind || "").toUpperCase(),
      value: String(row.assignment_value || "")
    });
    byVar.set(k, list);
  });
  return vars.map((row) => {
    const assignments = byVar.get(String(row.id || "")) || [];
    return {
      id: row.id,
      sortOrder: Number(row.sort_order || 0),
      fieldKey: String(row.field_key || ""),
      label: String(row.label || ""),
      fieldType: FIELD_TYPES.has(String(row.field_type || "")) ? String(row.field_type || "") : "text",
      placeholder: String(row.placeholder || ""),
      required: Boolean(row.required),
      options: parseOptionsJson(row.options_json),
      assignments: assignments
        .filter((a) => ASSIGNMENT_KINDS.has(a.kind))
        .map((a) => ({
          kind: a.kind,
          value: a.value
        })),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

function normalizeVariable(input, index) {
  const fieldKey = String(input?.fieldKey || "").trim().toLowerCase();
  const label = String(input?.label || "").trim();
  const fieldType = String(input?.fieldType || "text").trim().toLowerCase();
  const placeholder = String(input?.placeholder || "").trim();
  const required = Boolean(input?.required);
  const options = Array.isArray(input?.options)
    ? input.options.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const assignments = Array.isArray(input?.assignments)
    ? input.assignments.map((a) => ({
        kind: String(a?.kind || "").trim().toUpperCase(),
        value: String(a?.value || "").trim()
      }))
    : [];
  return { fieldKey, label, fieldType, placeholder, required, options, assignments, sortOrder: index };
}

function validateVariable(store, item, index) {
  const p = `Ligne ${index + 1} : `;
  if (!item.fieldKey) {
    store.fail("data:formVariables:save", `${p}Nom de variable obligatoire.`, "DATA_FORM_VARIABLE_KEY_REQUIRED");
  }
  if (!KEY_RE.test(item.fieldKey)) {
    store.fail(
      "data:formVariables:save",
      `${p}Nom de variable invalide (minuscule, chiffre, _, commence par une lettre).`,
      "DATA_FORM_VARIABLE_KEY_INVALID"
    );
  }
  if (!item.label) {
    store.fail("data:formVariables:save", `${p}Libellé obligatoire.`, "DATA_FORM_VARIABLE_LABEL_REQUIRED");
  }
  if (!FIELD_TYPES.has(item.fieldType)) {
    store.fail("data:formVariables:save", `${p}Type de variable invalide.`, "DATA_FORM_VARIABLE_TYPE_INVALID");
  }
  if (item.fieldType === "select" && item.options.length < 1) {
    store.fail(
      "data:formVariables:save",
      `${p}Une liste déroulante doit contenir au moins une option.`,
      "DATA_FORM_VARIABLE_OPTIONS_REQUIRED"
    );
  }
  item.assignments.forEach((a) => {
    if (!ASSIGNMENT_KINDS.has(a.kind)) {
      store.fail("data:formVariables:save", `${p}Type d'attribution invalide.`, "DATA_FORM_VARIABLE_ASSIGNMENT_KIND_INVALID");
    }
    if (!a.value) {
      store.fail("data:formVariables:save", `${p}Valeur d'attribution vide.`, "DATA_FORM_VARIABLE_ASSIGNMENT_VALUE_REQUIRED");
    }
    if (a.kind === "FORM" && !FORM_TARGETS.has(a.value)) {
      store.fail("data:formVariables:save", `${p}Formulaire cible invalide.`, "DATA_FORM_VARIABLE_FORM_TARGET_INVALID");
    }
    if (a.kind === "SITE" && !a.value) {
      store.fail("data:formVariables:save", `${p}Portée site invalide.`, "DATA_FORM_VARIABLE_SITE_TARGET_INVALID");
    }
    if (a.kind === "FAMILLE" && !a.value) {
      store.fail("data:formVariables:save", `${p}Portée famille invalide.`, "DATA_FORM_VARIABLE_FAMILLE_TARGET_INVALID");
    }
  });
}

function saveFormVariables(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const raw = Array.isArray(payload.variables) ? payload.variables : [];
  const normalized = raw.map((v, index) => normalizeVariable(v, index)).map((item) => {
    const hasContractuelle = item.assignments.some((a) => a.kind === "FORM" && a.value === "RONDE_PLANIFIEE");
    if (hasContractuelle) return item;
    return {
      ...item,
      assignments: item.assignments.filter((a) => a.kind !== "PROFILE")
    };
  });
  const keys = new Set();
  normalized.forEach((item, index) => {
    validateVariable(store, item, index);
    if (keys.has(item.fieldKey)) {
      store.fail(
        "data:formVariables:save",
        `Ligne ${index + 1} : nom de variable déjà utilisé (${item.fieldKey}).`,
        "DATA_FORM_VARIABLE_KEY_DUPLICATE"
      );
    }
    keys.add(item.fieldKey);
  });

  const now = new Date().toISOString();
  store.db.exec("BEGIN IMMEDIATE");
  try {
    store.db.prepare("DELETE FROM data_form_variable_assignments").run();
    store.db.prepare("DELETE FROM data_form_variables").run();
    const insertVar = store.db.prepare(
      `INSERT INTO data_form_variables (
        id, sort_order, field_key, label, field_type, placeholder, required, options_json, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    );
    const insertAssignment = store.db.prepare(
      `INSERT INTO data_form_variable_assignments (
        id, variable_id, assignment_kind, assignment_value, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    normalized.forEach((item, index) => {
      const varId = generateEntityId();
      insertVar.run(
        varId,
        index,
        item.fieldKey,
        item.label,
        item.fieldType,
        item.placeholder,
        item.required ? 1 : 0,
        JSON.stringify(item.fieldType === "select" ? item.options : []),
        now,
        now
      );
      item.assignments.forEach((a) => {
        insertAssignment.run(generateEntityId(), varId, a.kind, a.value, now, now);
      });
    });
    store.db.exec("COMMIT");
  } catch (err) {
    try {
      store.db.exec("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  }

  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "DATA_FORM_VARIABLES_SAVE",
    details: {
      count: normalized.length,
      keys: normalized.map((v) => v.fieldKey)
    }
  });

  return listFormVariables(store, payload);
}

module.exports = {
  listFormVariables,
  saveFormVariables
};
