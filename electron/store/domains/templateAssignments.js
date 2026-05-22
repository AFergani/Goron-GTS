/**
 * Attribution des modèles Word (.docx) par flux métier et portée (site ou famille).
 *
 * Table `data_document_template_assignments` (schéma `schemaBusinessData`).
 * Résolution à l'export : site prioritaire sur famille pour un `flowKind` donné.
 * Gestion Paramètres (manager) ; `resolveTemplateFileForContext` utilisé par les exports Word.
 */

const { generateEntityId } = require("../core/ids");

const FLOW_KINDS = new Set(["INTERVENTION", "RONDE_EXCEPTIONNELLE", "RONDE_PLANIFIEE", "GARDIENNAGE"]);
const SCOPE_KINDS = new Set(["SITE", "FAMILLE"]);

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
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string }} payload
 */
function listTemplateAssignments(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const rows = store.db
    .prepare(
      `SELECT id, flow_kind, scope_kind, scope_value, scope_label, template_file_name, created_at, updated_at
       FROM data_document_template_assignments
       ORDER BY flow_kind ASC, scope_kind ASC, scope_label ASC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    flowKind: row.flow_kind,
    scopeKind: row.scope_kind,
    scopeValue: row.scope_value,
    scopeLabel: row.scope_label,
    templateFileName: row.template_file_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

/**
 * Crée ou met à jour une attribution (clé unique flux + portée + valeur).
 * Écriture réservée au rôle data manager.
 *
 * @param {import('../userStore')} store
 * @returns {object} Attribution persistée.
 */
function upsertTemplateAssignment(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const flowKind = normalizeFlowKind(payload.flowKind);
  const scopeKind = normalizeScopeKind(payload.scopeKind);
  const scopeValue = String(payload.scopeValue || "").trim();
  const scopeLabel = String(payload.scopeLabel || "").trim();
  const templateFileName = String(payload.templateFileName || "").trim();
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
  if (!templateFileName || !String(templateFileName).toLowerCase().endsWith(".docx")) {
    store.fail("templates:assign:upsert", "Nom de modèle invalide.", "DATA_TEMPLATE_ASSIGN_TEMPLATE_REQUIRED");
  }
  const now = new Date().toISOString();
  const existing = store.db
    .prepare(
      `SELECT id, template_file_name, scope_label
       FROM data_document_template_assignments
       WHERE flow_kind = ? AND scope_kind = ? AND scope_value = ?
       LIMIT 1`
    )
    .get(flowKind, scopeKind, scopeValue);
  if (existing) {
    store.db
      .prepare(
        `UPDATE data_document_template_assignments
         SET scope_label = ?, template_file_name = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(scopeLabel, templateFileName, now, existing.id);
    store.logAudit({
      actorUsername: payload.requesterUsername || "unknown",
      action: "DATA_TEMPLATE_ASSIGNMENT_UPDATE",
      details: {
        id: existing.id,
        before: { templateFileName: String(existing.template_file_name || ""), scopeLabel: String(existing.scope_label || "") },
        after: { templateFileName, scopeLabel, flowKind, scopeKind, scopeValue }
      }
    });
    return {
      id: existing.id,
      flowKind,
      scopeKind,
      scopeValue,
      scopeLabel,
      templateFileName,
      createdAt: now,
      updatedAt: now
    };
  }
  const id = generateEntityId();
  store.db
    .prepare(
      `INSERT INTO data_document_template_assignments (
        id, flow_kind, scope_kind, scope_value, scope_label, template_file_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, flowKind, scopeKind, scopeValue, scopeLabel, templateFileName, now, now);
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "DATA_TEMPLATE_ASSIGNMENT_CREATE",
    details: { id, flowKind, scopeKind, scopeValue, scopeLabel, templateFileName }
  });
  return { id, flowKind, scopeKind, scopeValue, scopeLabel, templateFileName, createdAt: now, updatedAt: now };
}

/**
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function deleteTemplateAssignment(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const id = String(payload.id || "").trim();
  const reason = String(payload.reason || "").trim();
  if (!id) {
    store.fail("templates:assign:delete", "Identifiant d'attribution manquant.", "DATA_TEMPLATE_ASSIGN_ID_REQUIRED");
  }
  if (!reason) {
    store.fail("templates:assign:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db
    .prepare(
      `SELECT id, flow_kind, scope_kind, scope_value, scope_label, template_file_name
       FROM data_document_template_assignments WHERE id = ?`
    )
    .get(id);
  if (!existing) {
    store.fail("templates:assign:delete", "Attribution introuvable.", "DATA_TEMPLATE_ASSIGN_NOT_FOUND");
  }
  store.db.prepare("DELETE FROM data_document_template_assignments WHERE id = ?").run(id);
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "DATA_TEMPLATE_ASSIGNMENT_DELETE",
    details: {
      id,
      deleted: {
        flowKind: existing.flow_kind,
        scopeKind: existing.scope_kind,
        scopeValue: existing.scope_value,
        scopeLabel: existing.scope_label,
        templateFileName: existing.template_file_name
      },
      reason
    }
  });
  return { success: true };
}

/**
 * Retourne le nom de fichier `.docx` applicable pour un export (site puis famille).
 *
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string, flowKind: string, siteId?: string, famille?: string }} payload
 * @returns {{ templateFileName: string|null }}
 */
function resolveTemplateFileForContext(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const flowKind = normalizeFlowKind(payload.flowKind);
  if (!FLOW_KINDS.has(flowKind)) return { templateFileName: null };
  const siteId = String(payload.siteId || "").trim();
  let famille = String(payload.famille || "").trim();
  if (!famille && siteId) {
    const site = store.db.prepare("SELECT famille FROM data_sites WHERE id = ?").get(siteId);
    famille = String(site?.famille || "").trim();
  }
  if (siteId) {
    const bySite = store.db
      .prepare(
        `SELECT template_file_name FROM data_document_template_assignments
         WHERE flow_kind = ? AND scope_kind = 'SITE' AND scope_value = ?
         LIMIT 1`
      )
      .get(flowKind, siteId);
    if (bySite?.template_file_name) return { templateFileName: String(bySite.template_file_name) };
  }
  if (famille) {
    const byFamille = store.db
      .prepare(
        `SELECT template_file_name FROM data_document_template_assignments
         WHERE flow_kind = ? AND scope_kind = 'FAMILLE' AND lower(scope_value) = lower(?)
         LIMIT 1`
      )
      .get(flowKind, famille);
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
