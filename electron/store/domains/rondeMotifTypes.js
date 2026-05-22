/**
 * Référentiel des motifs de ronde (`data_ronde_motif_types`).
 *
 * Paramètres données et écrans rondes : libellé, couleur, précision libre obligatoire, tri.
 * Seed « Autre » à la création du schéma (`schemaRonde`). Suppression refusée si motif référencé
 * par des `ronde_entries`.
 */

const { generateEntityId } = require("../core/ids");

/**
 * @param {string} value
 * @param {string} [fallback="#5c6bc0"]
 * @returns {string}
 */
function normalizeColorHex(value, fallback = "#5c6bc0") {
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
    requiresFreeText: Boolean(row.requires_free_text),
    colorHex: row.color_hex || "#5c6bc0",
    sortOrder: row.sort_order == null ? 0 : Number(row.sort_order),
    legacyCode: row.legacy_code || null,
    createdAt: row.created_at
  };
}

/**
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string }} payload
 */
function listRondeMotifTypes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const rows = store.db
    .prepare(
      `SELECT id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at
       FROM data_ronde_motif_types
       ORDER BY sort_order ASC, label COLLATE NOCASE ASC`
    )
    .all();
  return rows.map(mapRow);
}

/**
 * @param {import('../userStore')} store
 * @returns {object} Motif créé.
 */
function createRondeMotifType(store, { requesterRole, requesterUsername, label, requiresFreeText, colorHex }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) {
    store.fail("data:rondeMotifs:create", "Libellé du motif obligatoire.", "DATA_RONDE_MOTIF_REQUIRED");
  }
  const dup = store.db.prepare("SELECT id FROM data_ronde_motif_types WHERE lower(trim(label)) = lower(?)").get(cleanLabel);
  if (dup) {
    store.fail("data:rondeMotifs:create", "Ce libellé existe déjà.", "DATA_RONDE_MOTIF_EXISTS");
  }
  const maxRow = store.db.prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM data_ronde_motif_types").get();
  const sortOrder = Number(maxRow?.m ?? -1) + 1;
  const id = generateEntityId();
  const now = new Date().toISOString();
  const color = normalizeColorHex(colorHex);
  const req = Boolean(requiresFreeText);
  store.db
    .prepare(
      `INSERT INTO data_ronde_motif_types (id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(id, cleanLabel, req ? 1 : 0, color, sortOrder, now);

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_RONDE_MOTIF_CREATE",
    details: { id, label: cleanLabel, requiresFreeText: req }
  });

  return mapRow(store.db.prepare("SELECT * FROM data_ronde_motif_types WHERE id = ?").get(id));
}

/**
 * @param {import('../userStore')} store
 * @returns {object} Motif mis à jour.
 */
function updateRondeMotifType(store, { requesterRole, requesterUsername, id, label, requiresFreeText, colorHex }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanId = String(id || "").trim();
  const cleanLabel = String(label || "").trim();
  if (!cleanId || !cleanLabel) {
    store.fail("data:rondeMotifs:update", "Données motif invalides.", "DATA_RONDE_MOTIF_REQUIRED");
  }
  const existing = store.db.prepare("SELECT * FROM data_ronde_motif_types WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:rondeMotifs:update", "Motif introuvable.", "DATA_RONDE_MOTIF_NOT_FOUND");
  }
  const dup = store.db
    .prepare("SELECT id FROM data_ronde_motif_types WHERE lower(trim(label)) = lower(?) AND id <> ?")
    .get(cleanLabel, cleanId);
  if (dup) {
    store.fail("data:rondeMotifs:update", "Ce libellé existe déjà.", "DATA_RONDE_MOTIF_EXISTS");
  }
  const color = normalizeColorHex(colorHex);
  const req = Boolean(requiresFreeText);
  store.db
    .prepare(
      `UPDATE data_ronde_motif_types SET label = ?, requires_free_text = ?, color_hex = ? WHERE id = ?`
    )
    .run(cleanLabel, req ? 1 : 0, color, cleanId);

  const historyBefore = store.getEntityChangeHistory("data_ronde_motif_types", cleanId, 3);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_RONDE_MOTIF_UPDATE",
    details: {
      id: cleanId,
      before: {
        label: String(existing.label || ""),
        requiresFreeText: Boolean(existing.requires_free_text),
        colorHex: String(existing.color_hex || "")
      },
      after: { label: cleanLabel, requiresFreeText: req, colorHex: color },
      historyBefore
    }
  });

  store.recordEntityChange({
    entityType: "data_ronde_motif_types",
    entityId: cleanId,
    changedBy: requesterUsername || "unknown",
    snapshot: { label: cleanLabel, requiresFreeText: req, colorHex: color }
  });

  return mapRow(store.db.prepare("SELECT * FROM data_ronde_motif_types WHERE id = ?").get(cleanId));
}

/**
 * Suppression physique si aucune ronde ne référence le motif (motif obligatoire).
 *
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function deleteRondeMotifType(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:rondeMotifs:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const cleanId = String(id || "").trim();
  const existing = store.db.prepare("SELECT * FROM data_ronde_motif_types WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:rondeMotifs:delete", "Motif introuvable.", "DATA_RONDE_MOTIF_NOT_FOUND");
  }
  const usage = store.db.prepare("SELECT COUNT(*) as n FROM ronde_entries WHERE motif_type_id = ?").get(cleanId);
  if (usage && Number(usage.n) > 0) {
    store.fail(
      "data:rondeMotifs:delete",
      "Impossible de supprimer : ce motif est utilisé par des rondes.",
      "DATA_RONDE_MOTIF_IN_USE"
    );
  }
  store.db.prepare("DELETE FROM data_ronde_motif_types WHERE id = ?").run(cleanId);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
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
  deleteRondeMotifType
};
