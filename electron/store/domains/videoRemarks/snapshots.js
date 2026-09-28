/**
 * Instantanés de remarques vidéo, un par site du référentiel.
 *
 * Table `video_remark_snapshots`. Le brouillon du poste reste côté renderer ;
 * cette couche ne voit que l'enregistrement explicite. Le chemin d'image d'alarme
 * est imposé à la relecture par le renderer.
 *
 * @module electron/store/domains/videoRemarks/snapshots
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { requireDataPersistence } = require("../data/persistence");
const { normalizePageAccess } = require("../users/userMapping");

const MAX_PAYLOAD_CHARS = 450000;

/**
 * Refuse l'accès si le profil n'a pas la page Remarques vidéo.
 *
 * @param {import("../../../userStore")} store
 * @param {string} requesterRole
 * @param {string|null|undefined} requesterManagerProfile
 */
function assertVideoRemarksAccess(store, requesterRole, requesterManagerProfile) {
  store.ensureDataReaderRole(requesterRole);
  const access = normalizePageAccess(null, requesterRole, requesterManagerProfile);
  if (!access.videoRemarks) {
    store.fail("videoRemarks:forbidden", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN");
  }
}

/**
 * Résumé d'audit sans identifiant technique ni contenu intégral.
 *
 * @param {{ code?: unknown, name?: unknown }} site
 * @param {object} payload
 * @returns {{ siteCode: string, siteName: string, sectionCount: number }}
 */
function toAuditSnapshot(site, payload) {
  const sections = payload && payload.video && Array.isArray(payload.video.sections) ? payload.video.sections.length : 0;
  return {
    siteCode: String(site.code || ""),
    siteName: String(site.name || ""),
    sectionCount: sections
  };
}

/**
 * Contrôle le document envoyé par le renderer.
 *
 * @param {import("../../../userStore")} store
 * @param {unknown} document
 * @returns {object}
 */
function normalizePayload(store, document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    store.fail("videoRemarks:save", "Contenu de remarque invalide.", "VIDEO_REMARK_PAYLOAD_INVALID");
  }
  const payload = { ...document };
  delete payload.siteId;
  delete payload.snapshotUpdatedAt;
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_CHARS) {
    store.fail("videoRemarks:save", "La remarque est trop volumineuse pour être enregistrée.", "VIDEO_REMARK_PAYLOAD_TOO_LARGE");
  }
  if (!payload.video || typeof payload.video !== "object") {
    store.fail("videoRemarks:save", "Contenu de remarque invalide.", "VIDEO_REMARK_PAYLOAD_INVALID");
  }
  return payload;
}

/**
 * Relit l'instantané d'un site. `null` s'il n'y en a pas encore.
 *
 * @param {import("../../../userStore")} store
 * @param {{ requesterRole: string, requesterManagerProfile?: string|null, siteId?: string }} payload
 * @returns {Promise<{ updatedAt: string, payload: object }|null>}
 */
async function getVideoRemarkSnapshot(store, { requesterRole, requesterManagerProfile, siteId }) {
  assertVideoRemarksAccess(store, requesterRole, requesterManagerProfile);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) return null;
  const db = requireDataPersistence(store, "videoRemarks:get");
  const row = await db.get(
    `SELECT payload_json, updated_at FROM video_remark_snapshots WHERE site_id = ?`,
    [cleanSiteId]
  );
  if (!row) return null;
  try {
    return { updatedAt: String(row.updated_at || ""), payload: JSON.parse(String(row.payload_json || "{}")) };
  } catch {
    store.fail("videoRemarks:get", "La remarque enregistrée est illisible.", "VIDEO_REMARK_PAYLOAD_INVALID");
  }
}

/**
 * Crée ou remplace l'instantané du site. Refuse un site absent du référentiel.
 * Si `expectedUpdatedAt` est fourni et ne correspond plus, un autre poste a enregistré entre-temps.
 *
 * @param {import("../../../userStore")} store
 * @param {object} payload
 * @returns {Promise<{ updatedAt: string }>}
 */
async function saveVideoRemarkSnapshot(store, payload) {
  const { requesterRole, requesterUsername, requesterManagerProfile, siteId, expectedUpdatedAt, document } = payload;
  assertVideoRemarksAccess(store, requesterRole, requesterManagerProfile);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) {
    store.fail("videoRemarks:save", "Choisissez un site avant d'enregistrer.", "VIDEO_REMARK_SITE_REQUIRED");
  }
  const cleanPayload = normalizePayload(store, document);
  const expected = expectedUpdatedAt ? String(expectedUpdatedAt) : null;
  const db = requireDataPersistence(store, "videoRemarks:save");
  const now = new Date().toISOString();
  const outcome = await db.transaction(async (tx) => {
    const site = await tx.get(`SELECT id, code, name FROM data_sites WHERE id = ?`, [cleanSiteId]);
    if (!site) {
      store.fail("videoRemarks:save", "Choisissez un site du référentiel.", "VIDEO_REMARK_SITE_REQUIRED");
    }
    const existing = await tx.get(
      `SELECT id, payload_json, updated_at FROM video_remark_snapshots WHERE site_id = ? FOR UPDATE`,
      [cleanSiteId]
    );
    const after = toAuditSnapshot(site, cleanPayload);
    if (!existing) {
      if (expected) {
        store.fail(
          "videoRemarks:save",
          "Cette remarque n'est plus disponible. Sélectionnez à nouveau le site.",
          "VIDEO_REMARK_CONFLICT"
        );
      }
      const id = generateEntityId();
      await tx.run(
        `INSERT INTO video_remark_snapshots (id, site_id, payload_json, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, cleanSiteId, JSON.stringify(cleanPayload), now, now, actorName(requesterUsername)]
      );
      return { created: true, id, before: null, after };
    }
    if (expected && String(existing.updated_at || "") !== expected) {
      store.fail(
        "videoRemarks:save",
        "Cette remarque a été enregistrée sur un autre poste. Sélectionnez à nouveau le site pour la recharger.",
        "VIDEO_REMARK_CONFLICT"
      );
    }
    await tx.run(
      `UPDATE video_remark_snapshots SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
      [JSON.stringify(cleanPayload), now, actorName(requesterUsername), existing.id]
    );
    let before = null;
    try {
      before = toAuditSnapshot(site, JSON.parse(String(existing.payload_json || "{}")));
    } catch {
      before = toAuditSnapshot(site, {});
    }
    return { created: false, id: existing.id, before, after };
  });

  if (outcome.created) {
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "VIDEO_REMARK_SNAPSHOT_CREATE",
      details: outcome.after
    });
    await store.recordEntityChange({
      entityType: "video_remark_snapshots",
      entityId: outcome.id,
      changedBy: actorName(requesterUsername),
      snapshot: outcome.after
    });
  } else {
    const historyBefore = await store.getEntityChangeHistory("video_remark_snapshots", outcome.id, 3);
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "VIDEO_REMARK_SNAPSHOT_UPDATE",
      details: { before: outcome.before, after: outcome.after, historyBefore }
    });
    await store.recordEntityChange({
      entityType: "video_remark_snapshots",
      entityId: outcome.id,
      changedBy: actorName(requesterUsername),
      snapshot: outcome.after
    });
  }
  return { updatedAt: now };
}

module.exports = { getVideoRemarkSnapshot, saveVideoRemarkSnapshot };
