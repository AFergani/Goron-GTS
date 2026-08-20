/**
 * Attribution des modèles Word (.docx) par flux métier et portée (site ou famille).
 *
 * Table `data_document_template_assignments`. Les fichiers restent sur disque
 * (`data/templates`) ; seule la table d'attribution est en **PostgreSQL only**.
 * Résolution à l'export : site prioritaire sur famille pour un `flowKind` donné.
 *
 * @module electron/store/domains/data/templateAssignments
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { sqlFoldExpr } = require("../../core/textFold");

/** Flux Word encore exportés : pas de gardiennage (export Word retiré). */
const FLOW_KINDS = new Set(["INTERVENTION", "RONDE_EXCEPTIONNELLE", "RONDE_PLANIFIEE"]);
const SCOPE_KINDS = new Set(["SITE", "FAMILLE"]);

const ASSIGNMENT_COLUMNS =
  "id, flow_kind, scope_kind, scope_value, scope_label, template_file_name, created_at, updated_at";

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
      "data:templateAssignments",
      "Base PostgreSQL inaccessible. Les attributions de modèles Word ne peuvent pas être consultées ni modifiées tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeFlowKind(value) {
  return String(value || "").trim().toUpperCase();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeScopeKind(value) {
  return String(value || "").trim().toUpperCase();
}

/**
 * Retient le nom de fichier seul (sans chemin) pour l'attribution.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeTemplateFileName(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\\/g, "/");
  return raw.split("/").pop() || "";
}

/**
 * @param {object} row - Ligne SQL.
 * @returns {object}
 */
function mapRow(row) {
  return {
    id: row.id,
    flowKind: row.flow_kind,
    scopeKind: row.scope_kind,
    scopeValue: row.scope_value,
    scopeLabel: row.scope_label,
    templateFileName: row.template_file_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * @param {{ flow_kind?: unknown, scope_kind?: unknown, scope_value?: unknown, scope_label?: unknown, template_file_name?: unknown }} row
 * @returns {{ flowKind: string, scopeKind: string, scopeValue: string, scopeLabel: string, templateFileName: string }}
 */
function toAssignmentSnapshot(row) {
  return {
    flowKind: String(row.flow_kind || ""),
    scopeKind: String(row.scope_kind || ""),
    scopeValue: String(row.scope_value || ""),
    scopeLabel: String(row.scope_label || ""),
    templateFileName: String(row.template_file_name || "")
  };
}

/**
 * Recherche l'attribution existante (famille : insensible à la casse, comme `resolve`).
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {string} flowKind
 * @param {string} scopeKind
 * @param {string} scopeValue
 * @returns {Promise<object|undefined>}
 */
async function findExistingAssignment(db, flowKind, scopeKind, scopeValue) {
  if (scopeKind === "FAMILLE") {
    return db.get(
      `SELECT ${ASSIGNMENT_COLUMNS}
       FROM data_document_template_assignments
       WHERE flow_kind = ? AND scope_kind = ? AND ${sqlFoldExpr("scope_value")} = ${sqlFoldExpr("?")}
       LIMIT 1`,
      [flowKind, scopeKind, scopeValue]
    );
  }
  return db.get(
    `SELECT ${ASSIGNMENT_COLUMNS}
     FROM data_document_template_assignments
     WHERE flow_kind = ? AND scope_kind = ? AND scope_value = ?
     LIMIT 1`,
    [flowKind, scopeKind, scopeValue]
  );
}

/**
 * Liste les attributions personnalisées (Paramètres → Modèles).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listTemplateAssignments(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const rows = await db.all(
    `SELECT ${ASSIGNMENT_COLUMNS}
     FROM data_document_template_assignments
     ORDER BY flow_kind ASC, scope_kind ASC, scope_label ASC`,
    []
  );
  return rows.map(mapRow);
}

/**
 * Crée ou met à jour une attribution (clé unique flux + portée + valeur).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>} Attribution persistée.
 */
async function upsertTemplateAssignment(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const db = requirePersistence(store);
  const actor = actorName(payload.requesterUsername);
  const flowKind = normalizeFlowKind(payload.flowKind);
  const scopeKind = normalizeScopeKind(payload.scopeKind);
  const scopeValue = String(payload.scopeValue || "").trim();
  const scopeLabel = String(payload.scopeLabel || "").trim();
  const templateFileName = normalizeTemplateFileName(payload.templateFileName);
  if (!FLOW_KINDS.has(flowKind)) {
    store.fail("templates:assign:upsert", "Type de flux invalide.", "DATA_TEMPLATE_ASSIGN_FLOW_INVALID");
  }
  if (!SCOPE_KINDS.has(scopeKind)) {
    store.fail("templates:assign:upsert", "Type de portée invalide.", "DATA_TEMPLATE_ASSIGN_SCOPE_INVALID");
  }
  if (!scopeValue) {
    store.fail("templates:assign:upsert", "Valeur de portée obligatoire.", "DATA_TEMPLATE_ASSIGN_SCOPE_VALUE_REQUIRED");
  }
  if (!scopeLabel) {
    store.fail("templates:assign:upsert", "Libellé de portée obligatoire.", "DATA_TEMPLATE_ASSIGN_SCOPE_LABEL_REQUIRED");
  }
  if (!templateFileName.toLowerCase().endsWith(".docx")) {
    store.fail("templates:assign:upsert", "Nom de modèle invalide.", "DATA_TEMPLATE_ASSIGN_TEMPLATE_REQUIRED");
  }
  const now = new Date().toISOString();
  const existing = await findExistingAssignment(db, flowKind, scopeKind, scopeValue);
  if (existing) {
    await db.run(
      `UPDATE data_document_template_assignments
       SET scope_value = ?, scope_label = ?, template_file_name = ?, updated_at = ?
       WHERE id = ?`,
      [scopeValue, scopeLabel, templateFileName, now, existing.id]
    );
    const after = {
      flowKind,
      scopeKind,
      scopeValue,
      scopeLabel,
      templateFileName
    };
    const historyBefore = await store.getEntityChangeHistory(
      "data_document_template_assignments",
      existing.id,
      3
    );
    store.logAudit({
      actorUsername: actor,
      action: "DATA_TEMPLATE_ASSIGNMENT_UPDATE",
      details: {
        id: existing.id,
        before: toAssignmentSnapshot(existing),
        after,
        historyBefore
      }
    });
    await store.recordEntityChange({
      entityType: "data_document_template_assignments",
      entityId: existing.id,
      changedBy: actor,
      snapshot: after
    });
    return mapRow({
      ...existing,
      scope_value: scopeValue,
      scope_label: scopeLabel,
      template_file_name: templateFileName,
      updated_at: now
    });
  }
  const id = generateEntityId();
  await db.run(
    `INSERT INTO data_document_template_assignments (
      id, flow_kind, scope_kind, scope_value, scope_label, template_file_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, flowKind, scopeKind, scopeValue, scopeLabel, templateFileName, now, now]
  );
  const snapshot = { flowKind, scopeKind, scopeValue, scopeLabel, templateFileName };
  await store.recordEntityChange({
    entityType: "data_document_template_assignments",
    entityId: id,
    changedBy: actor,
    snapshot
  });
  store.logAudit({
    actorUsername: actor,
    action: "DATA_TEMPLATE_ASSIGNMENT_CREATE",
    details: { id, ...snapshot }
  });
  return mapRow({
    id,
    flow_kind: flowKind,
    scope_kind: scopeKind,
    scope_value: scopeValue,
    scope_label: scopeLabel,
    template_file_name: templateFileName,
    created_at: now,
    updated_at: now
  });
}

/**
 * Supprime une attribution (motif obligatoire pour l'audit).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, id: string, reason: string }} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteTemplateAssignment(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const db = requirePersistence(store);
  const id = String(payload.id || "").trim();
  const reason = String(payload.reason || "").trim();
  if (!id) {
    store.fail("templates:assign:delete", "Identifiant d'attribution manquant.", "DATA_TEMPLATE_ASSIGN_ID_REQUIRED");
  }
  if (!reason) {
    store.fail("templates:assign:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get(
    `SELECT ${ASSIGNMENT_COLUMNS} FROM data_document_template_assignments WHERE id = ?`,
    [id]
  );
  if (!existing) {
    store.fail("templates:assign:delete", "Attribution introuvable.", "DATA_TEMPLATE_ASSIGN_NOT_FOUND");
  }
  await db.run("DELETE FROM data_document_template_assignments WHERE id = ?", [id]);
  store.logAudit({
    actorUsername: actorName(payload.requesterUsername),
    action: "DATA_TEMPLATE_ASSIGNMENT_DELETE",
    details: {
      id,
      deleted: toAssignmentSnapshot(existing),
      reason
    }
  });
  return { success: true };
}

/**
 * Retourne le nom de fichier `.docx` applicable pour un export (site puis famille).
 * La famille du site est lue en PostgreSQL (`data_sites`) si absente du payload.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, flowKind: string, siteId?: string, famille?: string }} payload
 * @returns {Promise<{ templateFileName: string|null }>}
 */
async function resolveTemplateFileForContext(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requirePersistence(store);
  const flowKind = normalizeFlowKind(payload.flowKind);
  if (!FLOW_KINDS.has(flowKind)) return { templateFileName: null };
  const siteId = String(payload.siteId || "").trim();
  let famille = String(payload.famille || "").trim();
  if (!famille && siteId) {
    const site = await db.get("SELECT famille FROM data_sites WHERE id = ?", [siteId]);
    famille = String(site?.famille || "").trim();
  }
  if (siteId) {
    const bySite = await db.get(
      `SELECT template_file_name FROM data_document_template_assignments
       WHERE flow_kind = ? AND scope_kind = 'SITE' AND scope_value = ?
       LIMIT 1`,
      [flowKind, siteId]
    );
    if (bySite?.template_file_name) return { templateFileName: String(bySite.template_file_name) };
  }
  if (famille) {
    const byFamille = await db.get(
      `SELECT template_file_name FROM data_document_template_assignments
       WHERE flow_kind = ? AND scope_kind = 'FAMILLE' AND ${sqlFoldExpr("scope_value")} = ${sqlFoldExpr("?")}
       LIMIT 1`,
      [flowKind, famille]
    );
    if (byFamille?.template_file_name) return { templateFileName: String(byFamille.template_file_name) };
  }
  return { templateFileName: null };
}

module.exports = {
  listTemplateAssignments,
  upsertTemplateAssignment,
  deleteTemplateAssignment,
  resolveTemplateFileForContext
};
