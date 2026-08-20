/**
 * Référentiels Paramètres : sites, intervenants, types d'anomalie (main courante).
 *
 * Tables `data_sites`, `data_intervenants`, `data_anomaly_types`.
 * Accès PostgreSQL via `store.getReferentialsPersistence()`.
 * `auditMode: "batch"` : pas de log unitaire (imports via `importAudit.js`).
 * Modifications : `entityHistory` + audit before/after ; suppressions : motif obligatoire.
 *
 * @module electron/store/domains/data/referentials
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { sqlFoldExpr } = require("../../core/textFold");
const {
  SYSTEM_ANOMALY_TYPE_COLOR,
  SYSTEM_ANOMALY_TYPE_ID,
  SYSTEM_ANOMALY_TYPE_LABEL,
  isSystemAnomalyType
} = require("../../core/systemReferentials");

/**
 * Normalise une couleur hexadécimale `#rrggbb`.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function normalizeColorHex(value, fallback = SYSTEM_ANOMALY_TYPE_COLOR) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return fallback;
}

/**
 * Texte trimé puis passé en majuscules (parc / famille).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUpperText(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
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
      "data:referentials",
      "Base PostgreSQL inaccessible. Les référentiels ne peuvent pas être consultés ni modifiés tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

/**
 * @param {{ code?: unknown, name?: unknown, address?: unknown, parc?: unknown, famille?: unknown }} row
 * @returns {{ code: string, name: string, address: string, parc: string, famille: string }}
 */
function toSiteSnapshot(row) {
  return {
    code: String(row.code || ""),
    name: String(row.name || ""),
    address: String(row.address || ""),
    parc: String(row.parc || ""),
    famille: String(row.famille || "")
  };
}

/**
 * @param {object} input
 * @returns {{ code: string, name: string, address: string, parc: string, famille: string }}
 */
function normalizeSiteInput(input) {
  return {
    code: String(input.code || "").trim(),
    name: String(input.name || "").trim(),
    address: String(input.address || "").trim(),
    parc: normalizeUpperText(input.parc),
    famille: normalizeUpperText(input.famille)
  };
}

/** --- Sites (`data_sites`) --- */

/**
 * Liste les sites du référentiel (ordre alphabétique sur le nom).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, code: string, name: string, address: string, parc: string, famille: string, createdAt: string, updatedAt: string|null }>>}
 */
async function listSites(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const rows = await db.all(
    `SELECT id, code, name, address, parc, famille, created_at, updated_at
     FROM data_sites
     ORDER BY name ASC`,
    []
  );
  return rows.map((row) => ({
    id: row.id,
    ...toSiteSnapshot(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  }));
}

/**
 * Crée un site. `auditMode: "batch"` pour import sans log unitaire.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function createSite(
  store,
  { requesterRole, requesterUsername, code, name, address, parc, famille, auditMode = "single" }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const fields = normalizeSiteInput({ code, name, address, parc, famille });
  if (!fields.code || !fields.name) {
    store.fail("data:sites:create", "Code site et nom de site obligatoires.", "DATA_SITE_REQUIRED");
  }
  const existsRow = await db.get(
    `SELECT name FROM data_sites WHERE ${sqlFoldExpr("code")} = ${sqlFoldExpr("?")}`,
    [fields.code]
  );
  if (existsRow) {
    const nomRef = String(existsRow.name || "").trim() || "sans nom";
    store.fail(
      "data:sites:create",
      `Le code site « ${fields.code} » existe déjà en référentiel (fiche actuelle : « ${nomRef} »).`,
      "DATA_SITE_EXISTS",
      { code: fields.code, existingName: nomRef }
    );
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO data_sites (id, code, name, address, parc, famille, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, fields.code, fields.name, fields.address || null, fields.parc || null, fields.famille || null, now]
  );
  await store.recordEntityChange({
    entityType: "data_sites",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot: fields
  });
  if (auditMode !== "batch") {
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "DATA_SITE_CREATE",
      details: { id, code: fields.code, name: fields.name }
    });
  }
  return { success: true };
}

/**
 * Met à jour un site (audit `DATA_SITE_UPDATE` avec `historyBefore` hors batch).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function updateSite(
  store,
  { requesterRole, requesterUsername, id, code, name, address, parc, famille, auditMode = "single" }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const fields = normalizeSiteInput({ code, name, address, parc, famille });
  if (!id || !fields.code || !fields.name) {
    store.fail("data:sites:update", "Données site invalides.", "DATA_SITE_REQUIRED");
  }
  const existingSite = await db.get(
    "SELECT id, code, name, address, parc, famille FROM data_sites WHERE id = ?",
    [id]
  );
  if (!existingSite) {
    store.fail("data:sites:update", "Site introuvable.", "DATA_SITE_NOT_FOUND");
  }
  const dupSite = await db.get(
    `SELECT name FROM data_sites WHERE ${sqlFoldExpr("code")} = ${sqlFoldExpr("?")} AND id <> ?`,
    [fields.code, id]
  );
  if (dupSite) {
    const nomRef = String(dupSite.name || "").trim() || "sans nom";
    store.fail(
      "data:sites:update",
      `Le code site « ${fields.code} » est déjà attribué au site « ${nomRef} ».`,
      "DATA_SITE_EXISTS",
      { code: fields.code, existingName: nomRef }
    );
  }
  await db.run(
    `UPDATE data_sites
     SET code = ?, name = ?, address = ?, parc = ?, famille = ?, updated_at = ?
     WHERE id = ?`,
    [fields.code, fields.name, fields.address || null, fields.parc || null, fields.famille || null, new Date().toISOString(), id]
  );
  if (auditMode !== "batch") {
    const historyBefore = await store.getEntityChangeHistory("data_sites", id, 3);
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "DATA_SITE_UPDATE",
      details: {
        id,
        before: toSiteSnapshot(existingSite),
        after: fields,
        historyBefore
      }
    });
  }
  await store.recordEntityChange({
    entityType: "data_sites",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot: fields
  });
  return { success: true };
}

/**
 * Supprime un site (motif obligatoire).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteSite(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requirePersistence(store);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:sites:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get(
    "SELECT id, code, name, address, parc, famille FROM data_sites WHERE id = ?",
    [id]
  );
  if (!existing) {
    store.fail("data:sites:delete", "Site introuvable.", "DATA_SITE_NOT_FOUND");
  }
  await db.run("DELETE FROM data_sites WHERE id = ?", [id]);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_SITE_DELETE",
    details: { id, deleted: toSiteSnapshot(existing), reason: cleanReason }
  });
  return { success: true };
}

/** --- Intervenants (`data_intervenants`) --- */

/**
 * Liste les intervenants (ordre alphabétique).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, name: string, createdAt: string, updatedAt: string|null }>>}
 */
async function listIntervenants(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const rows = await db.all(
    `SELECT id, name, created_at, updated_at FROM data_intervenants ORDER BY name ASC`,
    []
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  }));
}

/**
 * Crée un intervenant. Identifiant généré une fois (pas de relecture par nom).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function createIntervenant(store, { requesterRole, requesterUsername, name, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    store.fail("data:intervenants:create", "Nom intervenant obligatoire.", "DATA_INTERVENANT_REQUIRED");
  }
  const exists = await db.get(
    `SELECT id FROM data_intervenants WHERE ${sqlFoldExpr("name")} = ${sqlFoldExpr("?")}`,
    [cleanName]
  );
  if (exists) {
    store.fail(
      "data:intervenants:create",
      "Ce nom d'intervenant / société est déjà présent dans le référentiel (même libellé : pas de doublon).",
      "DATA_INTERVENANT_EXISTS"
    );
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  await db.run("INSERT INTO data_intervenants (id, name, created_at) VALUES (?, ?, ?)", [id, cleanName, now]);
  await store.recordEntityChange({
    entityType: "data_intervenants",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot: { name: cleanName }
  });
  if (auditMode !== "batch") {
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "DATA_INTERVENANT_CREATE",
      details: { id, name: cleanName }
    });
  }
  return { success: true };
}

/**
 * Met à jour un intervenant.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function updateIntervenant(store, { requesterRole, requesterUsername, id, name, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) {
    store.fail("data:intervenants:update", "Données intervenant invalides.", "DATA_INTERVENANT_REQUIRED");
  }
  const existingIntervenant = await db.get("SELECT id, name FROM data_intervenants WHERE id = ?", [id]);
  if (!existingIntervenant) {
    store.fail("data:intervenants:update", "Intervenant introuvable.", "DATA_INTERVENANT_NOT_FOUND");
  }
  const duplicate = await db.get(
    `SELECT id FROM data_intervenants WHERE ${sqlFoldExpr("name")} = ${sqlFoldExpr("?")} AND id <> ?`,
    [cleanName, id]
  );
  if (duplicate) {
    store.fail(
      "data:intervenants:update",
      "Un autre intervenant du référentiel porte déjà ce libellé.",
      "DATA_INTERVENANT_EXISTS"
    );
  }
  await db.run("UPDATE data_intervenants SET name = ?, updated_at = ? WHERE id = ?", [
    cleanName,
    new Date().toISOString(),
    id
  ]);
  if (auditMode !== "batch") {
    const historyBefore = await store.getEntityChangeHistory("data_intervenants", id, 3);
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "DATA_INTERVENANT_UPDATE",
      details: {
        id,
        before: { name: String(existingIntervenant.name || "") },
        after: { name: cleanName },
        historyBefore
      }
    });
  }
  await store.recordEntityChange({
    entityType: "data_intervenants",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot: { name: cleanName }
  });
  return { success: true };
}

/**
 * Supprime un intervenant (motif obligatoire).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteIntervenant(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requirePersistence(store);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:intervenants:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get("SELECT id, name FROM data_intervenants WHERE id = ?", [id]);
  if (!existing) {
    store.fail("data:intervenants:delete", "Intervenant introuvable.", "DATA_INTERVENANT_NOT_FOUND");
  }
  await db.run("DELETE FROM data_intervenants WHERE id = ?", [id]);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_INTERVENANT_DELETE",
    details: { id, deleted: { name: String(existing.name || "") }, reason: cleanReason }
  });
  return { success: true };
}

/** --- Types d'anomalie main courante (`data_anomaly_types`) --- */

/**
 * Liste les types d'anomalie.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, label: string, colorHex: string, createdAt: string, updatedAt: string|null, isSystem: boolean }>>}
 */
async function listAnomalyTypes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const rows = await db.all(
    `SELECT id, label, color_hex, created_at, updated_at FROM data_anomaly_types ORDER BY label ASC`,
    []
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    colorHex: normalizeColorHex(row.color_hex),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    isSystem: isSystemAnomalyType(row)
  }));
}

/**
 * Garantit la présence du type d'anomalie système « Voir Observation ».
 * Réutilise une ligne existante au même libellé (insensible à la casse) ; sinon insertion.
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<void>}
 */
async function ensureSystemAnomalyType(store) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return;
  const existing = await db.get(
    `SELECT id FROM data_anomaly_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
    [SYSTEM_ANOMALY_TYPE_LABEL]
  );
  if (existing) return;
  await db.run("INSERT INTO data_anomaly_types (id, label, color_hex, created_at) VALUES (?, ?, ?, ?)", [
    SYSTEM_ANOMALY_TYPE_ID,
    SYSTEM_ANOMALY_TYPE_LABEL,
    SYSTEM_ANOMALY_TYPE_COLOR,
    new Date().toISOString()
  ]);
}

/**
 * Crée un type d'anomalie.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function createAnomalyType(
  store,
  { requesterRole, requesterUsername, label, colorHex, auditMode = "single" }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanLabel = String(label || "").trim();
  const cleanColorHex = normalizeColorHex(colorHex);
  if (!cleanLabel) {
    store.fail("data:types:create", "Libellé du type obligatoire.", "DATA_TYPE_REQUIRED");
  }
  const exists = await db.get(
    `SELECT id FROM data_anomaly_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
    [cleanLabel]
  );
  if (exists) {
    store.fail("data:types:create", "Ce type existe déjà.", "DATA_TYPE_EXISTS");
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  await db.run("INSERT INTO data_anomaly_types (id, label, color_hex, created_at) VALUES (?, ?, ?, ?)", [
    id,
    cleanLabel,
    cleanColorHex,
    now
  ]);
  await store.recordEntityChange({
    entityType: "data_anomaly_types",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot: { label: cleanLabel, colorHex: cleanColorHex }
  });
  if (auditMode !== "batch") {
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "DATA_TYPE_CREATE",
      details: { id, label: cleanLabel, colorHex: cleanColorHex }
    });
  }
  return { success: true };
}

/**
 * Met à jour un type d'anomalie.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function updateAnomalyType(
  store,
  { requesterRole, requesterUsername, id, label, colorHex, auditMode = "single" }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanLabel = String(label || "").trim();
  const cleanColorHex = normalizeColorHex(colorHex);
  if (!id || !cleanLabel) {
    store.fail("data:types:update", "Données type invalides.", "DATA_TYPE_REQUIRED");
  }
  const existingType = await db.get("SELECT id, label, color_hex FROM data_anomaly_types WHERE id = ?", [id]);
  if (!existingType) {
    store.fail("data:types:update", "Type introuvable.", "DATA_TYPE_NOT_FOUND");
  }
  if (isSystemAnomalyType(existingType)) {
    store.fail(
      "data:types:update",
      "Ce type d'anomalie est un type système et ne peut pas être modifié.",
      "DATA_TYPE_SYSTEM_PROTECTED"
    );
  }
  const duplicate = await db.get(
    `SELECT id FROM data_anomaly_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")} AND id <> ?`,
    [cleanLabel, id]
  );
  if (duplicate) {
    store.fail("data:types:update", "Ce type existe déjà.", "DATA_TYPE_EXISTS");
  }
  await db.run("UPDATE data_anomaly_types SET label = ?, color_hex = ?, updated_at = ? WHERE id = ?", [
    cleanLabel,
    cleanColorHex,
    new Date().toISOString(),
    id
  ]);
  if (auditMode !== "batch") {
    const historyBefore = await store.getEntityChangeHistory("data_anomaly_types", id, 3);
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "DATA_TYPE_UPDATE",
      details: {
        id,
        before: { label: String(existingType.label || ""), colorHex: normalizeColorHex(existingType.color_hex) },
        after: { label: cleanLabel, colorHex: cleanColorHex },
        historyBefore
      }
    });
  }
  await store.recordEntityChange({
    entityType: "data_anomaly_types",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot: { label: cleanLabel, colorHex: cleanColorHex }
  });
  return { success: true };
}

/**
 * Supprime un type d'anomalie (motif obligatoire).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteAnomalyType(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requirePersistence(store);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:types:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get("SELECT id, label, color_hex FROM data_anomaly_types WHERE id = ?", [id]);
  if (!existing) {
    store.fail("data:types:delete", "Type introuvable.", "DATA_TYPE_NOT_FOUND");
  }
  if (isSystemAnomalyType(existing)) {
    store.fail(
      "data:types:delete",
      "Ce type d'anomalie est un type système et ne peut pas être supprimé.",
      "DATA_TYPE_SYSTEM_PROTECTED"
    );
  }
  await db.run("DELETE FROM data_anomaly_types WHERE id = ?", [id]);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_TYPE_DELETE",
    details: {
      id,
      deleted: { label: String(existing.label || ""), colorHex: normalizeColorHex(existing.color_hex) },
      reason: cleanReason
    }
  });
  return { success: true };
}

module.exports = {
  listSites,
  createSite,
  updateSite,
  deleteSite,
  listIntervenants,
  createIntervenant,
  updateIntervenant,
  deleteIntervenant,
  listAnomalyTypes,
  createAnomalyType,
  updateAnomalyType,
  deleteAnomalyType,
  ensureSystemAnomalyType
};
