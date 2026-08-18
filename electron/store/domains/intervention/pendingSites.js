/**
 * Gestion PostgreSQL des sites Intervention en attente.
 *
 * @module electron/store/domains/intervention/pendingSites
 */

const { generateEntityId } = require("../../core/ids");
const { requireInterventionPersistence } = require("./persistence");
const { propagateSiteToOtherDomains } = require("./propagate");

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object[]>} */
async function listPendingInterventionSites(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingSite:list");
  const rows = await db.all(
    `SELECT p.*, u.full_name AS created_by_display FROM intervention_site_pending p
     LEFT JOIN users u ON u.username = p.created_by ORDER BY p.created_at DESC`,
    []
  );
  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, createdBy: row.created_by_display || row.created_by, createdAt: row.created_at }));
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function createPendingInterventionSite(store, { requesterRole, requesterUsername, code, name }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingSite:create");
  const cleanCode = String(code || "").trim();
  const cleanName = String(name || "").trim();
  if (!cleanCode) store.fail("intervention:pendingSite", "Le code site est obligatoire.", "INTERVENTION_PENDING_SITE_CODE_REQUIRED");
  if (!cleanName) store.fail("intervention:pendingSite", "Le nom du site est obligatoire.", "INTERVENTION_PENDING_SITE_NAME_REQUIRED");
  if (await db.get("SELECT id FROM data_sites WHERE lower(code) = lower(?) LIMIT 1", [cleanCode])) return { success: true, alreadyExists: true };
  if (await db.get("SELECT id FROM intervention_site_pending WHERE lower(code) = lower(?) LIMIT 1", [cleanCode])) return { success: true, alreadyExists: true };
  const id = `site-pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const now = new Date().toISOString();
  await db.run("INSERT INTO intervention_site_pending (id, code, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, cleanCode, cleanName, String(requesterUsername || "unknown"), now]);
  store.logAudit({ actorUsername: requesterUsername || "unknown", action: "INTERVENTION_SITE_PENDING_CREATE",
    details: { pendingSite: { id, code: cleanCode, name: cleanName } } });
  return { success: true, alreadyExists: false };
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function resolvePendingInterventionSite(store, { requesterRole, requesterUsername, pendingId, parc, famille }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingSiteResolve");
  const cleanParc = String(parc || "").trim().toUpperCase();
  const cleanFamille = String(famille || "").trim().toUpperCase();
  if (!cleanParc) store.fail("intervention:pendingSiteResolve", "Le parc est obligatoire.", "INTERVENTION_PENDING_SITE_PARC_REQUIRED");
  const resolved = await db.transaction(async (tx) => {
    const pending = await tx.get("SELECT * FROM intervention_site_pending WHERE id = ? FOR UPDATE", [String(pendingId || "").trim()]);
    if (!pending) store.fail("intervention:pendingSiteResolve", "Site en attente introuvable.", "INTERVENTION_PENDING_SITE_NOT_FOUND");
    const existing = await tx.get("SELECT id, code, name FROM data_sites WHERE lower(code) = lower(?) LIMIT 1", [pending.code]);
    const siteId = existing ? existing.id : generateEntityId();
    if (!existing) {
      await tx.run("INSERT INTO data_sites (id, code, name, parc, famille, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [siteId, pending.code, pending.name, cleanParc, cleanFamille, new Date().toISOString()]);
    }
    await tx.run("DELETE FROM intervention_site_pending WHERE id = ?", [pending.id]);
    const officialName = existing ? existing.name : pending.name;
    const officialCode = existing ? existing.code : pending.code;
    const canonicalDisplay = `${officialName} (${officialCode})`;
    const likePattern = `%(${pending.code})%`;
    const result = await tx.run(
      `UPDATE intervention_entries SET site_id = ?, site_display = ?
       WHERE site_id IS NULL AND lower(site_display) LIKE lower(?)`,
      [siteId, canonicalDisplay, likePattern]
    );
    return { pending, siteId, alreadyExists: Boolean(existing), canonicalDisplay, likePattern, interventionEntries: Number(result.changes || 0) };
  });
  const other = await propagateSiteToOtherDomains(store, resolved.siteId, resolved.canonicalDisplay, resolved.likePattern);
  const propagation = { interventionEntries: resolved.interventionEntries, ...other };
  store.logAudit({ actorUsername: requesterUsername || "unknown", action: "INTERVENTION_SITE_PENDING_RESOLVE", details: {
    pendingSite: { id: resolved.pending.id, code: resolved.pending.code, name: resolved.pending.name },
    resolvedSiteId: resolved.siteId, mode: resolved.alreadyExists ? "already_exists" : "created", propagation
  } });
  return { success: true, siteId: resolved.siteId, alreadyExists: resolved.alreadyExists, propagation };
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<{success:true}>} */
async function deletePendingInterventionSite(store, { requesterRole, requesterUsername, pendingId, reason }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingSiteDelete");
  const pending = await db.get("SELECT * FROM intervention_site_pending WHERE id = ?", [String(pendingId || "").trim()]);
  if (!pending) store.fail("intervention:pendingSiteDelete", "Site en attente introuvable.", "INTERVENTION_PENDING_SITE_NOT_FOUND");
  if (await db.get("SELECT id FROM data_sites WHERE lower(code) = lower(?) LIMIT 1", [pending.code])) {
    store.fail(
      "intervention:pendingSiteDelete",
      "Ce site existe déjà dans le référentiel. Validez la proposition en attente ou supprimez-la après avoir mis à jour les fiches qui l'utilisent.",
      "INTERVENTION_PENDING_SITE_DELETE_BLOCKED_ALREADY_IN_BASE"
    );
  }
  const likePattern = `%(${pending.code})%`;
  const linkedIntervention = await db.get(
    "SELECT id FROM intervention_entries WHERE archived_at IS NULL AND site_id IS NULL AND lower(site_display) LIKE lower(?) LIMIT 1",
    [likePattern]
  );
  const linkedGardiennage = await db.get(
    "SELECT id FROM gardiennage_entries WHERE site_id IS NULL AND lower(site_display) LIKE lower(?) LIMIT 1",
    [likePattern]
  );
  const linkedRonde = await db.get(
    "SELECT id FROM ronde_entries WHERE site_id IS NULL AND lower(site_display) LIKE lower(?) LIMIT 1",
    [likePattern]
  );
  const linkedMainCourante = await require("../mainCourante").hasMainCouranteLinkedToPendingSiteDisplay(store, likePattern);
  if (linkedIntervention || linkedGardiennage || linkedRonde || linkedMainCourante) {
    store.fail(
      "intervention:pendingSiteDelete",
      "Ce site en attente est encore utilisé par une fiche (intervention, ronde, gardiennage ou main courante). Clôturez ou modifiez la fiche concernée, ou validez le site dans le référentiel, puis réessayez.",
      "INTERVENTION_PENDING_SITE_DELETE_BLOCKED_LINKED_INTERVENTION"
    );
  }
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) store.fail("intervention:pendingSiteDelete", "Le motif de suppression est obligatoire.", "INTERVENTION_PENDING_SITE_DELETE_REASON_REQUIRED");
  await db.run("DELETE FROM intervention_site_pending WHERE id = ?", [pending.id]);
  store.logAudit({ actorUsername: requesterUsername || "unknown", action: "INTERVENTION_SITE_PENDING_DELETE",
    details: { pendingSite: { id: pending.id, code: pending.code, name: pending.name }, reason: cleanReason } });
  return { success: true };
}

module.exports = { listPendingInterventionSites, createPendingInterventionSite, resolvePendingInterventionSite, deletePendingInterventionSite };
