/**
 * Référentiel des variables de formulaires dynamiques (Paramètres → Variables).
 *
 * Tables `data_form_variables` et `data_form_variable_assignments`.
 * Accès PostgreSQL via `store.getReferentialsPersistence()`.
 * Consommé par les modales métier et l'aide modèles (IPC async).
 *
 * @module electron/store/domains/data/formVariables
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");

/** Clé technique : minuscule, commence par une lettre, `_` et chiffres autorisés. */
const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;
const ASSIGNMENT_KINDS = new Set(["FORM", "PROFILE", "TEMPLATE", "SITE", "FAMILLE"]);
const FORM_TARGETS = new Set([
  "RONDE_PLANIFIEE",
  "RONDE_EXCEPTIONNELLE",
  "INTERVENTION",
  "MAIN_COURANTE",
  "GARDIENNAGE"
]);
const FIELD_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);
const ENTRY_STAGES = new Set(["REQUEST", "CLOSURE"]);

function normalizeEntryStage(raw) {
  const stage = String(raw || "").trim().toUpperCase();
  return ENTRY_STAGES.has(stage) ? stage : "CLOSURE";
}

/**
 * @param {import('../../../userStore')} store
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requirePersistence(store) {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const refDb =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!refDb) {
    store.fail(
      "data:formVariables",
      "Base PostgreSQL inaccessible. Les variables de formulaires ne peuvent pas être consultées ni modifiées tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

/**
 * @param {import('../../../userStore')} store
 * @param {number} index
 * @param {string} messageFr
 * @param {string} code
 * @returns {void}
 */
function failSave(store, index, messageFr, code) {
  store.fail("data:formVariables:save", `Ligne ${index + 1} : ${messageFr}`, code);
}

/**
 * @param {string|object} raw - JSON tableau d'options (liste déroulante).
 * @returns {string[]}
 */
function parseOptionsJson(raw) {
  try {
    const parsed = typeof raw === "object" && raw != null ? raw : JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Liste les variables actives et leurs attributions.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listFormVariables(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requirePersistence(store);
  const vars = await db.all(
    `SELECT id, sort_order, field_key, label, field_type, placeholder, required, options_json, entry_stage, created_at, updated_at
     FROM data_form_variables
     WHERE is_active = 1
     ORDER BY sort_order ASC, label ASC`,
    []
  );
  const assignmentRows = await db.all(
    `SELECT variable_id, assignment_kind, assignment_value
     FROM data_form_variable_assignments
     ORDER BY created_at ASC`,
    []
  );
  const byVar = new Map();
  for (const row of assignmentRows) {
    const kind = String(row.assignment_kind || "").toUpperCase();
    if (!ASSIGNMENT_KINDS.has(kind)) continue;
    const variableId = String(row.variable_id || "");
    if (!variableId) continue;
    const list = byVar.get(variableId) || [];
    list.push({ kind, value: String(row.assignment_value || "") });
    byVar.set(variableId, list);
  }
  return vars.map((row) => ({
    id: row.id,
    sortOrder: Number(row.sort_order || 0),
    fieldKey: String(row.field_key || ""),
    label: String(row.label || ""),
    fieldType: FIELD_TYPES.has(String(row.field_type || "")) ? String(row.field_type || "") : "text",
    placeholder: String(row.placeholder || ""),
    required: Boolean(Number(row.required)),
    options: parseOptionsJson(row.options_json),
    assignments: byVar.get(String(row.id || "")) || [],
    entryStage: normalizeEntryStage(row.entry_stage),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

/**
 * @param {object} input - Variable saisie côté UI.
 * @returns {{ fieldKey: string, label: string, fieldType: string, placeholder: string, required: boolean, options: string[], assignments: Array<{ kind: string, value: string }>, entryStage: string }}
 */
function normalizeVariable(input) {
  const fieldKey = String(input?.fieldKey || "").trim().toLowerCase();
  const label = String(input?.label || "").trim();
  const fieldType = String(input?.fieldType || "text").trim().toLowerCase();
  const placeholder = String(input?.placeholder || "").trim();
  const required = Boolean(input?.required);
  const options = Array.isArray(input?.options)
    ? input.options.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  let assignments = Array.isArray(input?.assignments)
    ? input.assignments.map((a) => ({
        kind: String(a?.kind || "").trim().toUpperCase(),
        value: String(a?.value || "").trim()
      }))
    : [];
  const hasContractuelle = assignments.some((a) => a.kind === "FORM" && a.value === "RONDE_PLANIFIEE");
  if (!hasContractuelle) {
    assignments = assignments.filter((a) => a.kind !== "PROFILE");
  }
  const entryStage = normalizeEntryStage(input?.entryStage);
  return { fieldKey, label, fieldType, placeholder, required, options, assignments, entryStage };
}

/**
 * @param {import('../../../userStore')} store
 * @param {ReturnType<typeof normalizeVariable>} item
 * @param {number} index
 * @returns {void}
 */
function validateVariable(store, item, index) {
  if (!item.fieldKey) {
    failSave(store, index, "Nom de variable obligatoire.", "DATA_FORM_VARIABLE_KEY_REQUIRED");
  }
  if (!KEY_RE.test(item.fieldKey)) {
    failSave(
      store,
      index,
      "Nom de variable invalide (minuscule, chiffre, _, commence par une lettre).",
      "DATA_FORM_VARIABLE_KEY_INVALID"
    );
  }
  if (!item.label) {
    failSave(store, index, "Libellé obligatoire.", "DATA_FORM_VARIABLE_LABEL_REQUIRED");
  }
  if (!FIELD_TYPES.has(item.fieldType)) {
    failSave(store, index, "Type de variable invalide.", "DATA_FORM_VARIABLE_TYPE_INVALID");
  }
  if (item.fieldType === "select" && item.options.length < 1) {
    failSave(
      store,
      index,
      "Une liste déroulante doit contenir au moins une option.",
      "DATA_FORM_VARIABLE_OPTIONS_REQUIRED"
    );
  }
  for (const a of item.assignments) {
    if (!ASSIGNMENT_KINDS.has(a.kind)) {
      failSave(store, index, "Type d'attribution invalide.", "DATA_FORM_VARIABLE_ASSIGNMENT_KIND_INVALID");
    }
    if (!a.value) {
      failSave(store, index, "Valeur d'attribution vide.", "DATA_FORM_VARIABLE_ASSIGNMENT_VALUE_REQUIRED");
    }
    if (a.kind === "FORM" && !FORM_TARGETS.has(a.value)) {
      failSave(store, index, "Formulaire cible invalide.", "DATA_FORM_VARIABLE_FORM_TARGET_INVALID");
    }
  }
}

/**
 * Remplace tout le référentiel (transaction DELETE + INSERT) puis audit agrégé.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, variables: object[] }} payload
 * @returns {Promise<object[]>} Liste à jour.
 */
async function saveFormVariables(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const db = requirePersistence(store);
  const raw = Array.isArray(payload.variables) ? payload.variables : [];
  const normalized = raw.map((v) => normalizeVariable(v));
  const keys = new Set();
  normalized.forEach((item, index) => {
    validateVariable(store, item, index);
    if (keys.has(item.fieldKey)) {
      failSave(
        store,
        index,
        `Nom de variable déjà utilisé (${item.fieldKey}).`,
        "DATA_FORM_VARIABLE_KEY_DUPLICATE"
      );
    }
    keys.add(item.fieldKey);
  });

  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM data_form_variable_assignments", []);
    await tx.run("DELETE FROM data_form_variables", []);
    for (let index = 0; index < normalized.length; index += 1) {
      const item = normalized[index];
      const varId = generateEntityId();
      await tx.run(
        `INSERT INTO data_form_variables (
          id, sort_order, field_key, label, field_type, placeholder, required, options_json, is_active, entry_stage, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          varId,
          index,
          item.fieldKey,
          item.label,
          item.fieldType,
          item.placeholder,
          item.required ? 1 : 0,
          JSON.stringify(item.fieldType === "select" ? item.options : []),
          item.entryStage,
          now,
          now
        ]
      );
      for (const a of item.assignments) {
        await tx.run(
          `INSERT INTO data_form_variable_assignments (
            id, variable_id, assignment_kind, assignment_value, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [generateEntityId(), varId, a.kind, a.value, now, now]
        );
      }
    }
  });

  store.logAudit({
    actorUsername: actorName(payload.requesterUsername),
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
