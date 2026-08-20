/**
 * Référentiel des motifs de ronde (`data_ronde_motif_types`).
 *
 * Paramètres et écrans rondes : libellé, couleur, précision libre, tri.
 * Accès PostgreSQL via `store.getReferentialsPersistence()`.
 * Suppression refusée si une ligne de profil planifié l'utilise encore
 * (génération de rondes). Les fiches ronde déjà saisies gardent le libellé
 * dans `motif_category` (même logique que les types d'anomalie main courante).
 *
 * @module electron/store/domains/data/rondeMotifTypes
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { sqlFoldExpr } = require("../../core/textFold");
const {
  SYSTEM_RONDE_MOTIF_COLOR,
  SYSTEM_RONDE_MOTIF_ID,
  SYSTEM_RONDE_MOTIF_LABEL,
  isSystemRondeMotifType
} = require("../../core/systemReferentials");

/**
 * Normalise une couleur hexadécimale `#rrggbb`.
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function normalizeColorHex(value, fallback = SYSTEM_RONDE_MOTIF_COLOR) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return fallback;
}

/**
 * @param {object} row - Ligne SQL.
 * @returns {object}
 */
function mapRow(row) {
  return {
    id: row.id,
    label: row.label || "",
    requiresFreeText: Boolean(Number(row.requires_free_text)),
    colorHex: normalizeColorHex(row.color_hex),
    sortOrder: row.sort_order == null ? 0 : Number(row.sort_order),
    legacyCode: row.legacy_code || null,
    createdAt: row.created_at,
    isSystem: isSystemRondeMotifType(row)
  };
}

/**
 * @param {{ label?: unknown, requires_free_text?: unknown, color_hex?: unknown }} row
 * @returns {{ label: string, requiresFreeText: boolean, colorHex: string }}
 */
function toMotifSnapshot(row) {
  return {
    label: String(row.label || ""),
    requiresFreeText: Boolean(Number(row.requires_free_text)),
    colorHex: normalizeColorHex(row.color_hex)
  };
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
      "data:rondeMotifs",
      "Base PostgreSQL inaccessible. Les motifs de ronde ne peuvent pas être consultés ni modifiés tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

/**
 * Garantit la présence du motif système « Voir Consigne ».
 * Réutilise une ligne existante au même libellé ; sinon insertion en tête de tri.
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<void>}
 */
async function ensureSystemRondeMotifType(store) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return;
  const existing = await db.get(
    `SELECT id FROM data_ronde_motif_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
    [SYSTEM_RONDE_MOTIF_LABEL]
  );
  if (existing) return;
  await db.run(
    `INSERT INTO data_ronde_motif_types (id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at)
     VALUES (?, ?, 0, ?, 0, NULL, ?)`,
    [SYSTEM_RONDE_MOTIF_ID, SYSTEM_RONDE_MOTIF_LABEL, SYSTEM_RONDE_MOTIF_COLOR, new Date().toISOString()]
  );
}

/**
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listRondeMotifTypes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const rows = await db.all(
    `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at
     FROM data_ronde_motif_types
     ORDER BY sort_order ASC, lower(label) ASC`,
    []
  );
  return rows.map(mapRow);
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>} Motif créé.
 */
async function createRondeMotifType(store, { requesterRole, requesterUsername, label, requiresFreeText, colorHex }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) {
    store.fail("data:rondeMotifs:create", "Libellé du motif obligatoire.", "DATA_RONDE_MOTIF_REQUIRED");
  }
  const dup = await db.get(
    `SELECT id FROM data_ronde_motif_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
    [cleanLabel]
  );
  if (dup) {
    store.fail("data:rondeMotifs:create", "Ce libellé existe déjà.", "DATA_RONDE_MOTIF_EXISTS");
  }
  const maxRow = await db.get("SELECT COALESCE(MAX(sort_order), -1) as m FROM data_ronde_motif_types", []);
  const sortOrder = Number(maxRow?.m ?? -1) + 1;
  const id = generateEntityId();
  const now = new Date().toISOString();
  const color = normalizeColorHex(colorHex);
  const req = Boolean(requiresFreeText);
  await db.run(
    `INSERT INTO data_ronde_motif_types (id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    [id, cleanLabel, req ? 1 : 0, color, sortOrder, now]
  );
  const snapshot = { label: cleanLabel, requiresFreeText: req, colorHex: color };
  await store.recordEntityChange({
    entityType: "data_ronde_motif_types",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot
  });
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_RONDE_MOTIF_CREATE",
    details: { id, ...snapshot }
  });
  return mapRow({
    id,
    label: cleanLabel,
    requires_free_text: req ? 1 : 0,
    color_hex: color,
    sort_order: sortOrder,
    legacy_code: null,
    created_at: now
  });
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>} Motif mis à jour.
 */
async function updateRondeMotifType(store, { requesterRole, requesterUsername, id, label, requiresFreeText, colorHex }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanId = String(id || "").trim();
  const cleanLabel = String(label || "").trim();
  if (!cleanId || !cleanLabel) {
    store.fail("data:rondeMotifs:update", "Données motif invalides.", "DATA_RONDE_MOTIF_REQUIRED");
  }
  const existing = await db.get(
    `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at
     FROM data_ronde_motif_types WHERE id = ?`,
    [cleanId]
  );
  if (!existing) {
    store.fail("data:rondeMotifs:update", "Motif introuvable.", "DATA_RONDE_MOTIF_NOT_FOUND");
  }
  if (isSystemRondeMotifType(existing)) {
    store.fail(
      "data:rondeMotifs:update",
      "Ce motif de ronde est un type système et ne peut pas être modifié.",
      "DATA_RONDE_MOTIF_SYSTEM_PROTECTED"
    );
  }
  const dup = await db.get(
    `SELECT id FROM data_ronde_motif_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")} AND id <> ?`,
    [cleanLabel, cleanId]
  );
  if (dup) {
    store.fail("data:rondeMotifs:update", "Ce libellé existe déjà.", "DATA_RONDE_MOTIF_EXISTS");
  }
  const color = normalizeColorHex(colorHex);
  const req = Boolean(requiresFreeText);
  await db.run(
    `UPDATE data_ronde_motif_types SET label = ?, requires_free_text = ?, color_hex = ? WHERE id = ?`,
    [cleanLabel, req ? 1 : 0, color, cleanId]
  );
  const after = { label: cleanLabel, requiresFreeText: req, colorHex: color };
  const historyBefore = await store.getEntityChangeHistory("data_ronde_motif_types", cleanId, 3);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_RONDE_MOTIF_UPDATE",
    details: {
      id: cleanId,
      before: toMotifSnapshot(existing),
      after,
      historyBefore
    }
  });
  await store.recordEntityChange({
    entityType: "data_ronde_motif_types",
    entityId: cleanId,
    changedBy: actorName(requesterUsername),
    snapshot: after
  });
  return mapRow({
    ...existing,
    label: cleanLabel,
    requires_free_text: req ? 1 : 0,
    color_hex: color
  });
}

/**
 * Suppression physique si aucun profil planifié ne référence encore le motif.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteRondeMotifType(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requirePersistence(store);
  const cleanId = String(id || "").trim();
  const cleanReason = String(reason || "").trim();
  if (!cleanId) {
    store.fail("data:rondeMotifs:delete", "Identifiant motif obligatoire.", "DATA_RONDE_MOTIF_NOT_FOUND");
  }
  if (!cleanReason) {
    store.fail("data:rondeMotifs:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get(
    `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at
     FROM data_ronde_motif_types WHERE id = ?`,
    [cleanId]
  );
  if (!existing) {
    store.fail("data:rondeMotifs:delete", "Motif introuvable.", "DATA_RONDE_MOTIF_NOT_FOUND");
  }
  if (isSystemRondeMotifType(existing)) {
    store.fail(
      "data:rondeMotifs:delete",
      "Ce motif de ronde est un type système et ne peut pas être supprimé.",
      "DATA_RONDE_MOTIF_SYSTEM_PROTECTED"
    );
  }
  const usage = await db.get(
    "SELECT COUNT(*) AS count FROM data_ronde_planned_profile_lines WHERE motif_type_id = ?",
    [cleanId]
  );
  if (Number(usage?.count || 0) > 0) {
    store.fail(
      "data:rondeMotifs:delete",
      "Impossible de supprimer : ce motif est encore utilisé par un profil de ronde planifiée.",
      "DATA_RONDE_MOTIF_IN_USE"
    );
  }
  await db.run("DELETE FROM data_ronde_motif_types WHERE id = ?", [cleanId]);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_RONDE_MOTIF_DELETE",
    details: {
      id: cleanId,
      deleted: { label: String(existing.label || "") },
      reason: cleanReason
    }
  });
  return { success: true };
}

module.exports = {
  listRondeMotifTypes,
  createRondeMotifType,
  updateRondeMotifType,
  deleteRondeMotifType,
  ensureSystemRondeMotifType
};
