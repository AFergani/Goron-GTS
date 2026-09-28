/**
 * Référentiel des motifs de ronde (`data_ronde_motif_types`).
 *
 * Paramètres et écrans rondes : libellé, couleur, précision libre, tri.
 * Écritures : transaction + `FOR UPDATE` ; updates : `expectedUpdatedAt`.
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
const { assertOptimisticLock } = require("./optimisticLock");
const { requireDataPersistence } = require("./persistence");

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
    updatedAt: row.updated_at || null,
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
 * Garantit la présence du motif système « Voir Consigne ».
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<void>}
 */
async function ensureSystemRondeMotifType(store) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return;
  await db.transaction(async (tx) => {
    const existing = await tx.get(
      `SELECT id FROM data_ronde_motif_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
      [SYSTEM_RONDE_MOTIF_LABEL]
    );
    if (existing) return;
    await tx.run(
      `INSERT INTO data_ronde_motif_types (id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at)
       VALUES (?, ?, 0, ?, 0, NULL, ?)`,
      [SYSTEM_RONDE_MOTIF_ID, SYSTEM_RONDE_MOTIF_LABEL, SYSTEM_RONDE_MOTIF_COLOR, new Date().toISOString()]
    );
  });
}

/**
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listRondeMotifTypes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireDataPersistence(store, "data:rondeMotifs:list");
  const rows = await db.all(
    `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at, updated_at
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
  store.ensureDataManagerRole(requesterRole);
  const db = requireDataPersistence(store, "data:rondeMotifs:create");
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) {
    store.fail("data:rondeMotifs:create", "Libellé du motif obligatoire.", "DATA_RONDE_MOTIF_REQUIRED");
  }
  const color = normalizeColorHex(colorHex);
  const req = Boolean(requiresFreeText);
  const id = generateEntityId();
  const now = new Date().toISOString();
  let sortOrder = 0;
  await db.transaction(async (tx) => {
    const dup = await tx.get(
      `SELECT id FROM data_ronde_motif_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
      [cleanLabel]
    );
    if (dup) {
      store.fail("data:rondeMotifs:create", "Ce libellé existe déjà.", "DATA_RONDE_MOTIF_EXISTS");
    }
    const maxRow = await tx.get("SELECT COALESCE(MAX(sort_order), -1) as m FROM data_ronde_motif_types", []);
    sortOrder = Number(maxRow?.m ?? -1) + 1;
    await tx.run(
      `INSERT INTO data_ronde_motif_types (id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      [id, cleanLabel, req ? 1 : 0, color, sortOrder, now, now]
    );
  });
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
    created_at: now,
    updated_at: now
  });
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>} Motif mis à jour.
 */
async function updateRondeMotifType(
  store,
  { requesterRole, requesterUsername, id, label, requiresFreeText, colorHex, expectedUpdatedAt }
) {
  store.ensureDataManagerRole(requesterRole);
  const db = requireDataPersistence(store, "data:rondeMotifs:update");
  const cleanId = String(id || "").trim();
  const cleanLabel = String(label || "").trim();
  if (!cleanId || !cleanLabel) {
    store.fail("data:rondeMotifs:update", "Données motif invalides.", "DATA_RONDE_MOTIF_REQUIRED");
  }
  const color = normalizeColorHex(colorHex);
  const req = Boolean(requiresFreeText);
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at, updated_at
       FROM data_ronde_motif_types WHERE id = ? FOR UPDATE`,
      [cleanId]
    );
    if (!row) {
      store.fail("data:rondeMotifs:update", "Motif introuvable.", "DATA_RONDE_MOTIF_NOT_FOUND");
    }
    if (isSystemRondeMotifType(row)) {
      store.fail(
        "data:rondeMotifs:update",
        "Ce motif de ronde est un type système et ne peut pas être modifié.",
        "DATA_RONDE_MOTIF_SYSTEM_PROTECTED"
      );
    }
    assertOptimisticLock(store, "data:rondeMotifs:update", row, expectedUpdatedAt, "DATA_RONDE_MOTIF_CONFLICT");
    const dup = await tx.get(
      `SELECT id FROM data_ronde_motif_types WHERE ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")} AND id <> ?`,
      [cleanLabel, cleanId]
    );
    if (dup) {
      store.fail("data:rondeMotifs:update", "Ce libellé existe déjà.", "DATA_RONDE_MOTIF_EXISTS");
    }
    const now = new Date().toISOString();
    const result = await tx.run(
      `UPDATE data_ronde_motif_types
       SET label = ?, requires_free_text = ?, color_hex = ?, updated_at = ?
       WHERE id = ? AND updated_at IS NOT DISTINCT FROM ?`,
      [cleanLabel, req ? 1 : 0, color, now, cleanId, expectedUpdatedAt ?? null]
    );
    if (!result.changes) {
      store.fail(
        "data:rondeMotifs:update",
        "Cette fiche a été modifiée ailleurs. Actualisez la liste puis réessayez.",
        "DATA_RONDE_MOTIF_CONFLICT"
      );
    }
    return row;
  });
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
    color_hex: color,
    updated_at: new Date().toISOString()
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
  const db = requireDataPersistence(store, "data:rondeMotifs:delete");
  const cleanId = String(id || "").trim();
  const cleanReason = String(reason || "").trim();
  if (!cleanId) {
    store.fail("data:rondeMotifs:delete", "Identifiant motif obligatoire.", "DATA_RONDE_MOTIF_NOT_FOUND");
  }
  if (!cleanReason) {
    store.fail("data:rondeMotifs:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at, updated_at
       FROM data_ronde_motif_types WHERE id = ? FOR UPDATE`,
      [cleanId]
    );
    if (!row) {
      store.fail("data:rondeMotifs:delete", "Motif introuvable.", "DATA_RONDE_MOTIF_NOT_FOUND");
    }
    if (isSystemRondeMotifType(row)) {
      store.fail(
        "data:rondeMotifs:delete",
        "Ce motif de ronde est un type système et ne peut pas être supprimé.",
        "DATA_RONDE_MOTIF_SYSTEM_PROTECTED"
      );
    }
    const usage = await tx.get(
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
    await tx.run("DELETE FROM data_ronde_motif_types WHERE id = ?", [cleanId]);
    return row;
  });
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
