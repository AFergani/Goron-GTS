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
const FIELD_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle", "checkbox"]);
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
 * Charge les variables et leurs attributions.
 * `activeOnly` sert à la liste affichée. L'enregistrement relit aussi les lignes inactives, avec verrou si besoin.
 *
 * @param {{ all: Function }} executor
 * @param {{ forUpdate?: boolean, activeOnly?: boolean }} [options]
 * @returns {Promise<{ vars: object[], assignmentsById: Map<string, Array<{ kind: string, value: string }>> }>}
 */
async function queryFormVariableRows(executor, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const where = options.activeOnly ? " WHERE is_active = 1" : "";
  const vars = await executor.all(
    `SELECT id, sort_order, field_key, label, field_type, placeholder, required, options_json, entry_stage, created_at, updated_at
     FROM data_form_variables${where}
     ORDER BY sort_order ASC, label ASC${lock}`,
    []
  );
  const assignmentRows = await executor.all(
    `SELECT variable_id, assignment_kind, assignment_value
     FROM data_form_variable_assignments
     ORDER BY created_at ASC`,
    []
  );
  const assignmentsById = new Map();
  for (const row of assignmentRows) {
    const kind = String(row.assignment_kind || "").trim().toUpperCase();
    if (!ASSIGNMENT_KINDS.has(kind)) continue;
    const variableId = String(row.variable_id || "");
    if (!variableId) continue;
    const list = assignmentsById.get(variableId) || [];
    list.push({ kind, value: String(row.assignment_value || "").trim() });
    assignmentsById.set(variableId, list);
  }
  return { vars, assignmentsById };
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
  const { vars, assignmentsById } = await queryFormVariableRows(db, { activeOnly: true });
  return vars.map((row) => ({
    id: row.id,
    sortOrder: Number(row.sort_order || 0),
    fieldKey: String(row.field_key || ""),
    label: String(row.label || ""),
    fieldType: FIELD_TYPES.has(String(row.field_type || "")) ? String(row.field_type || "") : "text",
    placeholder: String(row.placeholder || ""),
    required: Boolean(Number(row.required)),
    options: parseOptionsJson(row.options_json),
    assignments: assignmentsById.get(String(row.id || "")) || [],
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

const FORM_TARGET_LABELS = {
  RONDE_PLANIFIEE: "Ronde contractuelle",
  RONDE_EXCEPTIONNELLE: "Ronde exceptionnelle",
  INTERVENTION: "Intervention",
  MAIN_COURANTE: "Main courante",
  GARDIENNAGE: "Gardiennage"
};
const FIELD_TYPE_LABELS = {
  text: "Texte court",
  textarea: "Texte long",
  number: "Nombre",
  time: "Heure",
  select: "Liste déroulante",
  toggle: "Interrupteur",
  checkbox: "Case à cocher"
};
const ENTRY_STAGE_LABELS = {
  REQUEST: "À la demande",
  CLOSURE: "À la clôture"
};
const ASSIGNMENT_KIND_LABELS = {
  FORM: "Formulaire",
  PROFILE: "Profil",
  TEMPLATE: "Modèle",
  SITE: "Site",
  FAMILLE: "Famille"
};
const ENTITY_TYPE = "data_form_variables";

/**
 * Libellés lisibles pour le journal (création, modification, suppression).
 *
 * @param {ReturnType<typeof normalizeVariable>} item
 * @returns {object}
 */
function toAuditSnapshot(item) {
  const assignments = item.assignments.length
    ? [...item.assignments]
        .sort((a, b) => `${a.kind}:${a.value}`.localeCompare(`${b.kind}:${b.value}`, "fr"))
        .map((assignment) => {
          if (assignment.kind === "FORM") return FORM_TARGET_LABELS[assignment.value] || assignment.value;
          const kindLabel = ASSIGNMENT_KIND_LABELS[assignment.kind] || assignment.kind;
          return `${kindLabel}: ${assignment.value}`;
        })
        .join(", ")
    : "—";
  return {
    fieldKey: item.fieldKey,
    label: item.label,
    fieldType: FIELD_TYPE_LABELS[item.fieldType] || item.fieldType,
    placeholder: item.placeholder || "—",
    entryStage: ENTRY_STAGE_LABELS[item.entryStage] || item.entryStage,
    options: item.fieldType === "select" && item.options.length ? item.options.join(", ") : "—",
    assignments
  };
}

/**
 * @param {{ all: Function }} executor
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<Array<ReturnType<typeof normalizeVariable> & { id: string, createdAt: string }>>}
 */
async function loadStoredVariables(executor, options = {}) {
  const { vars, assignmentsById } = await queryFormVariableRows(executor, options);
  return vars.map((row) => ({
    id: String(row.id || ""),
    createdAt: row.created_at,
    ...normalizeVariable({
      fieldKey: row.field_key,
      label: row.label,
      fieldType: row.field_type,
      placeholder: row.placeholder,
      required: Boolean(Number(row.required)),
      options: parseOptionsJson(row.options_json),
      assignments: assignmentsById.get(String(row.id || "")) || [],
      entryStage: row.entry_stage
    })
  }));
}

/**
 * @param {unknown} raw
 * @returns {Map<string, string>}
 */
function deletionReasonsByKey(raw) {
  const reasons = new Map();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const fieldKey = String(item?.fieldKey || "").trim().toLowerCase();
    const reason = String(item?.reason || "").trim();
    if (!fieldKey) continue;
    reasons.set(fieldKey, reason);
  }
  return reasons;
}

/**
 * @param {{ run: Function }} tx
 * @param {string} variableId
 * @param {ReturnType<typeof normalizeVariable>} item
 * @param {string} now
 * @returns {Promise<void>}
 */
async function insertAssignments(tx, variableId, item, now) {
  for (const assignment of item.assignments) {
    await tx.run(
      `INSERT INTO data_form_variable_assignments (
        id, variable_id, assignment_kind, assignment_value, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [generateEntityId(), variableId, assignment.kind, assignment.value, now, now]
    );
  }
}

/**
 * Enregistre le référentiel en conservant l'identifiant des variables déjà présentes.
 * Chaque création, modification ou suppression est journalisée. Une suppression exige un motif.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, variables: object[], deletions?: Array<{ fieldKey?: string, reason?: string }> }} payload
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

  const reasons = deletionReasonsByKey(payload.deletions);
  const beforeSave = await loadStoredVariables(db);
  const removed = beforeSave.filter((row) => !keys.has(row.fieldKey));
  if (removed.length) {
    store.ensureDataDeleteRole(payload.requesterRole);
    for (const row of removed) {
      if (!reasons.get(row.fieldKey)) {
        store.fail(
          "data:formVariables:save",
          `Motif de suppression obligatoire (${row.label || row.fieldKey}).`,
          "DATA_DELETE_REASON_REQUIRED"
        );
      }
    }
  }

  const now = new Date().toISOString();
  const actor = actorName(payload.requesterUsername);
  /** @type {Array<{ action: string, id: string, details: object, snapshot?: object }>} */
  const audits = [];

  await db.transaction(async (tx) => {
    const locked = await loadStoredVariables(tx, { forUpdate: true });
    const lockedByKey = new Map(locked.map((row) => [row.fieldKey, row]));
    for (const row of locked) {
      if (keys.has(row.fieldKey)) continue;
      const reason = reasons.get(row.fieldKey) || "";
      if (!reason) {
        store.fail(
          "data:formVariables:save",
          `Motif de suppression obligatoire (${row.label || row.fieldKey}).`,
          "DATA_DELETE_REASON_REQUIRED"
        );
      }
    }

    for (let index = 0; index < normalized.length; index += 1) {
      const item = normalized[index];
      const previous = lockedByKey.get(item.fieldKey);
      const optionsJson = JSON.stringify(item.fieldType === "select" ? item.options : []);
      if (previous) {
        await tx.run(
          `UPDATE data_form_variables
           SET sort_order = ?, label = ?, field_type = ?, placeholder = ?, required = ?, options_json = ?, entry_stage = ?, updated_at = ?
           WHERE id = ?`,
          [
            index,
            item.label,
            item.fieldType,
            item.placeholder,
            item.required ? 1 : 0,
            optionsJson,
            item.entryStage,
            now,
            previous.id
          ]
        );
        await tx.run("DELETE FROM data_form_variable_assignments WHERE variable_id = ?", [previous.id]);
        await insertAssignments(tx, previous.id, item, now);
        const before = toAuditSnapshot(previous);
        const after = toAuditSnapshot(item);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          audits.push({
            action: "DATA_FORM_VARIABLE_UPDATE",
            id: previous.id,
            snapshot: after,
            details: { id: previous.id, before, after }
          });
        }
      } else {
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
            optionsJson,
            item.entryStage,
            now,
            now
          ]
        );
        await insertAssignments(tx, varId, item, now);
        const created = toAuditSnapshot(item);
        audits.push({
          action: "DATA_FORM_VARIABLE_CREATE",
          id: varId,
          snapshot: created,
          details: { id: varId, created }
        });
      }
    }

    for (const row of locked) {
      if (keys.has(row.fieldKey)) continue;
      await tx.run("DELETE FROM data_form_variable_assignments WHERE variable_id = ?", [row.id]);
      await tx.run("DELETE FROM data_form_variables WHERE id = ?", [row.id]);
      audits.push({
        action: "DATA_FORM_VARIABLE_DELETE",
        id: row.id,
        details: {
          id: row.id,
          deleted: toAuditSnapshot(row),
          reason: reasons.get(row.fieldKey)
        }
      });
    }
  });

  for (const entry of audits) {
    if (entry.action === "DATA_FORM_VARIABLE_UPDATE") {
      const historyBefore = await store.getEntityChangeHistory(ENTITY_TYPE, entry.id, 3);
      store.logAudit({
        actorUsername: actor,
        action: entry.action,
        details: { ...entry.details, historyBefore }
      });
      await store.recordEntityChange({
        entityType: ENTITY_TYPE,
        entityId: entry.id,
        changedBy: actor,
        snapshot: entry.snapshot
      });
    } else if (entry.action === "DATA_FORM_VARIABLE_CREATE") {
      store.logAudit({
        actorUsername: actor,
        action: entry.action,
        details: entry.details
      });
      await store.recordEntityChange({
        entityType: ENTITY_TYPE,
        entityId: entry.id,
        changedBy: actor,
        snapshot: entry.snapshot
      });
    } else {
      store.logAudit({
        actorUsername: actor,
        action: entry.action,
        details: entry.details
      });
    }
  }

  return listFormVariables(store, payload);
}

module.exports = {
  listFormVariables,
  saveFormVariables
};
