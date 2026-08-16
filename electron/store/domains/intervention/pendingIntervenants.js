/**
 * Gestion PostgreSQL des intervenants Intervention en attente.
 *
 * @module electron/store/domains/intervention/pendingIntervenants
 */

const { generateEntityId } = require("../../core/ids");
const { requireInterventionPersistence } = require("./persistence");
const { propagateIntervenantToOtherDomains } = require("./propagate");

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object[]>} */
async function listPendingInterventionIntervenants(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingIntervenant:list");
  const rows = await db.all(
    `SELECT p.*, u.full_name AS created_by_display FROM intervention_intervenant_pending p
     LEFT JOIN users u ON u.username = p.created_by ORDER BY p.created_at DESC`,
    []
  );
  return rows.map((row) => ({ id: row.id, name: row.name, createdBy: row.created_by_display || row.created_by, createdAt: row.created_at }));
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function createPendingInterventionIntervenant(store, { requesterRole, requesterUsername, name }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingIntervenant:create");
  const cleanName = String(name || "").trim();
  if (!cleanName) store.fail("intervention:pendingIntervenant", "Le nom de l'intervenant est obligatoire.", "INTERVENTION_PENDING_INTERVENANT_NAME_REQUIRED");
  if (await db.get("SELECT id FROM data_intervenants WHERE lower(name) = lower(?) LIMIT 1", [cleanName])) return { success: true, alreadyExists: true };
  if (await db.get("SELECT id FROM intervention_intervenant_pending WHERE lower(name) = lower(?) LIMIT 1", [cleanName])) return { success: true, alreadyExists: true };
  const id = `intervenant-pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  await db.run("INSERT INTO intervention_intervenant_pending (id, name, created_by, created_at) VALUES (?, ?, ?, ?)",
    [id, cleanName, String(requesterUsername || "unknown"), new Date().toISOString()]);
  store.logAudit({ actorUsername: requesterUsername || "unknown", action: "INTERVENTION_INTERVENANT_PENDING_CREATE",
    details: { pendingIntervenant: { id, name: cleanName } } });
  return { success: true, alreadyExists: false };
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<object>} */
async function resolvePendingInterventionIntervenant(store, { requesterRole, requesterUsername, pendingId, name }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingIntervenantResolve");
  const resolved = await db.transaction(async (tx) => {
    const pending = await tx.get("SELECT * FROM intervention_intervenant_pending WHERE id = ? FOR UPDATE", [String(pendingId || "").trim()]);
    if (!pending) store.fail("intervention:pendingIntervenantResolve", "Intervenant en attente introuvable.", "INTERVENTION_PENDING_INTERVENANT_NOT_FOUND");
    const finalName = String(name || pending.name || "").trim();
    if (!finalName) store.fail("intervention:pendingIntervenantResolve", "Le nom de l'intervenant est obligatoire.", "INTERVENTION_PENDING_INTERVENANT_NAME_REQUIRED");
    const existing = await tx.get("SELECT id FROM data_intervenants WHERE lower(name) = lower(?) LIMIT 1", [finalName]);
    const intervenantId = existing ? existing.id : generateEntityId();
    if (!existing) await tx.run("INSERT INTO data_intervenants (id, name, created_at) VALUES (?, ?, ?)", [intervenantId, finalName, new Date().toISOString()]);
    await tx.run("DELETE FROM intervention_intervenant_pending WHERE id = ?", [pending.id]);
    const result = await tx.run(
      `UPDATE intervention_entries SET intervenant_id = ?, intervenant_name = ?
       WHERE intervenant_id IS NULL AND lower(intervenant_name) = lower(?)`,
      [intervenantId, finalName, pending.name]
    );
    return { pending, finalName, intervenantId, alreadyExists: Boolean(existing), interventionEntries: Number(result.changes || 0) };
  });
  const propagation = {
    interventionEntries: resolved.interventionEntries,
    ...await propagateIntervenantToOtherDomains(
      store,
      resolved.intervenantId,
      resolved.finalName,
      resolved.pending.name
    )
  };
  store.logAudit({ actorUsername: requesterUsername || "unknown", action: "INTERVENTION_INTERVENANT_PENDING_RESOLVE", details: {
    pendingIntervenant: { id: resolved.pending.id, name: resolved.pending.name },
    resolvedIntervenantId: resolved.intervenantId, mode: resolved.alreadyExists ? "already_exists" : "created", propagation
  } });
  return { success: true, intervenantId: resolved.intervenantId, alreadyExists: resolved.alreadyExists, propagation };
}

/** @param {import('../../../userStore')} store @param {object} payload @returns {Promise<{success:true}>} */
async function deletePendingInterventionIntervenant(store, { requesterRole, requesterUsername, pendingId, reason }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireInterventionPersistence(store, "intervention:pendingIntervenantDelete");
  const pending = await db.get("SELECT * FROM intervention_intervenant_pending WHERE id = ?", [String(pendingId || "").trim()]);
  if (!pending) store.fail("intervention:pendingIntervenantDelete", "Intervenant en attente introuvable.", "INTERVENTION_PENDING_INTERVENANT_NOT_FOUND");
  if (await db.get("SELECT id FROM data_intervenants WHERE lower(name) = lower(?) LIMIT 1", [pending.name])) {
    store.fail("intervention:pendingIntervenantDelete", "Suppression impossible: cet intervenant est déjà présent en base.", "INTERVENTION_PENDING_INTERVENANT_DELETE_BLOCKED_ALREADY_IN_BASE");
  }
  const linked = await db.get(
    "SELECT id FROM intervention_entries WHERE archived_at IS NULL AND intervenant_id IS NULL AND lower(intervenant_name) = lower(?) LIMIT 1",
    [pending.name]
  );
  const linkedGardiennage = await db.get(
    "SELECT id FROM gardiennage_entries WHERE intervenant_id IS NULL AND lower(intervenant_name) = lower(?) LIMIT 1",
    [pending.name]
  );
  const linkedRonde = await db.get(
    "SELECT id FROM ronde_entries WHERE intervenant_id IS NULL AND lower(intervenant_name) = lower(?) LIMIT 1",
    [pending.name]
  );
  if (linked || linkedGardiennage || linkedRonde) {
    store.fail("intervention:pendingIntervenantDelete", "Suppression impossible: cet intervenant en attente est encore utilisé par une entrée métier.", "INTERVENTION_PENDING_INTERVENANT_DELETE_BLOCKED_LINKED_INTERVENTION");
  }
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) store.fail("intervention:pendingIntervenantDelete", "Le motif de suppression est obligatoire.", "INTERVENTION_PENDING_INTERVENANT_DELETE_REASON_REQUIRED");
  await db.run("DELETE FROM intervention_intervenant_pending WHERE id = ?", [pending.id]);
  store.logAudit({ actorUsername: requesterUsername || "unknown", action: "INTERVENTION_INTERVENANT_PENDING_DELETE",
    details: { pendingIntervenant: { id: pending.id, name: pending.name }, reason: cleanReason } });
  return { success: true };
}

module.exports = {
  listPendingInterventionIntervenants, createPendingInterventionIntervenant,
  resolvePendingInterventionIntervenant, deletePendingInterventionIntervenant
};
