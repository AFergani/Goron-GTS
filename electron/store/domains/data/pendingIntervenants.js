/**
 * Prestataires proposés hors référentiel (file d'attente Paramètres).
 *
 * Module partagé : création depuis les formulaires métier (intervention, rondes,
 * gardiennage) ; validation / suppression dans Paramètres.
 * Unicité du nom : casse et accents ignorés (`sqlFoldExpr`), comme `data_intervenants`.
 *
 * Noms d'API `listPendingIntervenants` / `createPendingIntervenant` : contrat IPC `data:pendingIntervenants:*`.
 *
 * @module electron/store/domains/data/pendingIntervenants
 */

const { actorName } = require("../../core/actorName");
const { generateEntityId } = require("../../core/ids");
const { sqlFoldExpr } = require("../../core/textFold");
const { requireDataPersistence } = require("./persistence");
const { propagateIntervenantToOtherDomains } = require("./pendingPropagate");

const PENDING_SELECT = "id, name, created_by, created_at";
const FOLD_NAME = `${sqlFoldExpr("name")} = ${sqlFoldExpr("?")}`;
const FOLD_INTERVENANT_NAME = `${sqlFoldExpr("intervenant_name")} = ${sqlFoldExpr("?")}`;

/**
 * @param {object} row - Ligne SQL (+ `created_by_display` optionnel)
 * @returns {{ id: string, name: string, createdBy: string, createdAt: string }}
 */
function mapPendingIntervenantRow(row) {
  return {
    id: row.id,
    name: row.name || "",
    createdBy: row.created_by_display || row.created_by || "",
    createdAt: row.created_at
  };
}

/**
 * @param {import('../../../userStore')} store
 * @param {unknown} pendingId
 * @param {string} source
 * @returns {string}
 */
function requirePendingId(store, pendingId, source) {
  const id = String(pendingId || "").trim();
  if (!id) {
    store.fail(source, "Identifiant de proposition manquant.", "DATA_PENDING_INTERVENANT_ID_REQUIRED");
  }
  return id;
}

/**
 * Liste les prestataires en attente de validation (plus récent d'abord).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, name: string, createdBy: string, createdAt: string }>>}
 */
async function listPendingIntervenants(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireDataPersistence(store, "data:pendingIntervenant:list");
  const rows = await db.all(
    `SELECT p.id, p.name, p.created_by, p.created_at, u.full_name AS created_by_display
     FROM data_intervenant_pending p
     LEFT JOIN users u ON u.username = p.created_by
     ORDER BY p.created_at DESC`,
    []
  );
  return rows.map(mapPendingIntervenantRow);
}

/**
 * Propose un prestataire. Idempotent si le nom existe déjà (référentiel ou file).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, name?: unknown }} payload
 * @returns {Promise<{ success: true, alreadyExists: boolean }>}
 */
async function createPendingIntervenant(store, { requesterRole, requesterUsername, name }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireDataPersistence(store, "data:pendingIntervenant:create");
  const actor = actorName(requesterUsername);
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    store.fail(
      "data:pendingIntervenant",
      "Le nom de l'intervenant est obligatoire.",
      "DATA_PENDING_INTERVENANT_NAME_REQUIRED"
    );
  }
  const outcome = await db.transaction(async (tx) => {
    if (await tx.get(`SELECT id FROM data_intervenants WHERE ${FOLD_NAME} LIMIT 1`, [cleanName])) {
      return { alreadyExists: true };
    }
    if (await tx.get(`SELECT id FROM data_intervenant_pending WHERE ${FOLD_NAME} LIMIT 1`, [cleanName])) {
      return { alreadyExists: true };
    }
    const id = generateEntityId();
    await tx.run(
      `INSERT INTO data_intervenant_pending (${PENDING_SELECT}) VALUES (?, ?, ?, ?)`,
      [id, cleanName, actor, new Date().toISOString()]
    );
    return { alreadyExists: false };
  });
  if (!outcome.alreadyExists) {
    store.logAudit({
      actorUsername: actor,
      action: "DATA_INTERVENANT_PENDING_CREATE",
      details: { pendingIntervenant: { name: cleanName } }
    });
  }
  return { success: true, alreadyExists: outcome.alreadyExists };
}

/**
 * Valide la proposition : crée ou rattache l'intervenant, propage les fiches orphelines.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, pendingId?: unknown, name?: unknown }} payload
 * @returns {Promise<{ success: true, intervenantId: string, alreadyExists: boolean, propagation: object }>}
 */
async function resolvePendingIntervenant(store, { requesterRole, requesterUsername, pendingId, name }) {
  store.ensureDataReaderRole(requesterRole);
  const actor = actorName(requesterUsername);
  const db = requireDataPersistence(store, "data:pendingIntervenant:resolve");
  const id = requirePendingId(store, pendingId, "data:pendingIntervenant:resolve");
  const resolved = await db.transaction(async (tx) => {
    const pending = await tx.get(
      `SELECT ${PENDING_SELECT} FROM data_intervenant_pending WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!pending) {
      store.fail(
        "data:pendingIntervenant:resolve",
        "Intervenant en attente introuvable.",
        "DATA_PENDING_INTERVENANT_NOT_FOUND"
      );
    }
    const finalName = String(name || pending.name || "").trim();
    if (!finalName) {
      store.fail(
        "data:pendingIntervenant:resolve",
        "Le nom de l'intervenant est obligatoire.",
        "DATA_PENDING_INTERVENANT_NAME_REQUIRED"
      );
    }
    const existing = await tx.get(`SELECT id FROM data_intervenants WHERE ${FOLD_NAME} LIMIT 1`, [finalName]);
    const intervenantId = existing ? existing.id : generateEntityId();
    if (!existing) {
      await tx.run("INSERT INTO data_intervenants (id, name, created_at) VALUES (?, ?, ?)", [
        intervenantId,
        finalName,
        new Date().toISOString()
      ]);
    }
    await tx.run("DELETE FROM data_intervenant_pending WHERE id = ?", [pending.id]);
    const result = await tx.run(
      `UPDATE intervention_entries SET intervenant_id = ?, intervenant_name = ?
       WHERE intervenant_id IS NULL AND ${FOLD_INTERVENANT_NAME}`,
      [intervenantId, finalName, pending.name]
    );
    const other = await propagateIntervenantToOtherDomains(
      store,
      intervenantId,
      finalName,
      pending.name,
      tx
    );
    return {
      pending,
      finalName,
      intervenantId,
      created: !existing,
      alreadyExists: Boolean(existing),
      interventionEntries: Number(result.changes || 0),
      propagation: { interventionEntries: Number(result.changes || 0), ...other }
    };
  });
  if (resolved.created) {
    await store.recordEntityChange({
      entityType: "data_intervenants",
      entityId: resolved.intervenantId,
      changedBy: actor,
      snapshot: { name: resolved.finalName }
    });
  }
  const propagation = resolved.propagation;
  store.logAudit({
    actorUsername: actor,
    action: "DATA_INTERVENANT_PENDING_RESOLVE",
    details: {
      pendingIntervenant: { name: resolved.pending.name },
      createdIntervenant: { name: resolved.finalName },
      mode: resolved.alreadyExists ? "already_exists" : "created",
      propagation
    }
  });
  return {
    success: true,
    intervenantId: resolved.intervenantId,
    alreadyExists: resolved.alreadyExists,
    propagation
  };
}

/**
 * Supprime une proposition non utilisée. Motif obligatoire. Refus si déjà au référentiel
 * ou si une fiche (intervention, ronde, gardiennage) porte encore ce nom sans id.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, pendingId?: unknown, reason?: unknown }} payload
 * @returns {Promise<{ success: true }>}
 */
async function deletePendingIntervenant(store, { requesterRole, requesterUsername, pendingId, reason }) {
  store.ensureDataReaderRole(requesterRole);
  const actor = actorName(requesterUsername);
  const db = requireDataPersistence(store, "data:pendingIntervenant:delete");
  const id = requirePendingId(store, pendingId, "data:pendingIntervenant:delete");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail(
      "data:pendingIntervenant:delete",
      "Le motif de suppression est obligatoire.",
      "DATA_PENDING_INTERVENANT_DELETE_REASON_REQUIRED"
    );
  }
  const pending = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${PENDING_SELECT} FROM data_intervenant_pending WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!row) {
      store.fail(
        "data:pendingIntervenant:delete",
        "Intervenant en attente introuvable.",
        "DATA_PENDING_INTERVENANT_NOT_FOUND"
      );
    }
    if (await tx.get(`SELECT id FROM data_intervenants WHERE ${FOLD_NAME} LIMIT 1`, [row.name])) {
      store.fail(
        "data:pendingIntervenant:delete",
        "Cet intervenant existe déjà dans le référentiel. Validez la proposition en attente ou supprimez-la après avoir mis à jour les fiches qui l'utilisent.",
        "DATA_PENDING_INTERVENANT_DELETE_BLOCKED_ALREADY_IN_BASE"
      );
    }
    const linked = await tx.get(
      `SELECT id FROM intervention_entries
       WHERE archived_at IS NULL AND intervenant_id IS NULL AND ${FOLD_INTERVENANT_NAME} LIMIT 1`,
      [row.name]
    );
    const linkedGardiennage = await tx.get(
      `SELECT id FROM gardiennage_entries
       WHERE intervenant_id IS NULL AND ${FOLD_INTERVENANT_NAME} LIMIT 1`,
      [row.name]
    );
    const linkedRonde = await tx.get(
      `SELECT id FROM ronde_entries
       WHERE intervenant_id IS NULL AND ${FOLD_INTERVENANT_NAME} LIMIT 1`,
      [row.name]
    );
    if (linked || linkedGardiennage || linkedRonde) {
      store.fail(
        "data:pendingIntervenant:delete",
        "Cet intervenant en attente est encore utilisé par une fiche (intervention, ronde ou gardiennage). Clôturez ou modifiez la fiche concernée, ou validez l'intervenant dans le référentiel, puis réessayez.",
        "DATA_PENDING_INTERVENANT_DELETE_BLOCKED_LINKED_INTERVENTION"
      );
    }
    await tx.run("DELETE FROM data_intervenant_pending WHERE id = ?", [row.id]);
    return row;
  });
  store.logAudit({
    actorUsername: actor,
    action: "DATA_INTERVENANT_PENDING_DELETE",
    details: { pendingIntervenant: { name: pending.name }, reason: cleanReason }
  });
  return { success: true };
}

module.exports = {
  listPendingIntervenants,
  createPendingIntervenant,
  resolvePendingIntervenant,
  deletePendingIntervenant
};
