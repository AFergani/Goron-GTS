/**
 * Sites proposés hors référentiel (file d'attente Paramètres).
 *
 * Module partagé : création depuis tous les formulaires métier (intervention, rondes,
 * gardiennage, main courante) ; validation / suppression dans Paramètres.
 * Unicité du code : casse et accents ignorés (`sqlFoldExpr`), comme `data_sites`.
 * Les fiches orphelines sont reconnues par `site_display` contenant `(code)`.
 *
 * Noms d'API `listPendingSites` / `createPendingSite` : contrat IPC `data:pendingSites:*`.
 *
 * @module electron/store/domains/data/pendingSites
 */

const { actorName } = require("../../core/actorName");
const { generateEntityId } = require("../../core/ids");
const { sqlFoldExpr } = require("../../core/textFold");
const { requireDataPersistence } = require("./persistence");
const { propagateSiteToOtherDomains } = require("./pendingPropagate");

const PENDING_SELECT = "id, code, name, created_by, created_at";
const FOLD_CODE = `${sqlFoldExpr("code")} = ${sqlFoldExpr("?")}`;

/**
 * Motif LIKE pour un code site dans `site_display` (`Nom (CODE)`).
 *
 * @param {unknown} code
 * @returns {string}
 */
function siteDisplayLikePattern(code) {
  return `%(${String(code || "").trim()})%`;
}

/**
 * @param {object} row - Ligne SQL (+ `created_by_display` optionnel)
 * @returns {{ id: string, code: string, name: string, createdBy: string, createdAt: string }}
 */
function mapPendingSiteRow(row) {
  return {
    id: row.id,
    code: row.code || "",
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
    store.fail(source, "Identifiant de proposition manquant.", "DATA_PENDING_SITE_ID_REQUIRED");
  }
  return id;
}

/**
 * Liste les sites en attente de validation (plus récent d'abord).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, code: string, name: string, createdBy: string, createdAt: string }>>}
 */
async function listPendingSites(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireDataPersistence(store, "data:pendingSite:list");
  const rows = await db.all(
    `SELECT p.id, p.code, p.name, p.created_by, p.created_at, u.full_name AS created_by_display
     FROM data_site_pending p
     LEFT JOIN users u ON u.username = p.created_by
     ORDER BY p.created_at DESC`,
    []
  );
  return rows.map(mapPendingSiteRow);
}

/**
 * Propose un site. Idempotent si le code existe déjà (référentiel ou file).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, code?: unknown, name?: unknown }} payload
 * @returns {Promise<{ success: true, alreadyExists: boolean }>}
 */
async function createPendingSite(store, { requesterRole, requesterUsername, code, name }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireDataPersistence(store, "data:pendingSite:create");
  const actor = actorName(requesterUsername);
  const cleanCode = String(code || "").trim();
  const cleanName = String(name || "").trim();
  if (!cleanCode) {
    store.fail("data:pendingSite", "Le code site est obligatoire.", "DATA_PENDING_SITE_CODE_REQUIRED");
  }
  if (!cleanName) {
    store.fail("data:pendingSite", "Le nom du site est obligatoire.", "DATA_PENDING_SITE_NAME_REQUIRED");
  }
  const outcome = await db.transaction(async (tx) => {
    if (await tx.get(`SELECT id FROM data_sites WHERE ${FOLD_CODE} LIMIT 1`, [cleanCode])) {
      return { alreadyExists: true };
    }
    if (await tx.get(`SELECT id FROM data_site_pending WHERE ${FOLD_CODE} LIMIT 1`, [cleanCode])) {
      return { alreadyExists: true };
    }
    const id = generateEntityId();
    await tx.run(
      `INSERT INTO data_site_pending (${PENDING_SELECT}) VALUES (?, ?, ?, ?, ?)`,
      [id, cleanCode, cleanName, actor, new Date().toISOString()]
    );
    return { alreadyExists: false };
  });
  if (!outcome.alreadyExists) {
    store.logAudit({
      actorUsername: actor,
      action: "DATA_SITE_PENDING_CREATE",
      details: { pendingSite: { code: cleanCode, name: cleanName } }
    });
  }
  return { success: true, alreadyExists: outcome.alreadyExists };
}

/**
 * Valide la proposition : crée ou rattache le site, propage les fiches orphelines.
 * Parc obligatoire ; famille optionnelle. Un site déjà au référentiel n'est pas écrasé.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, pendingId?: unknown, parc?: unknown, famille?: unknown, address?: unknown }} payload
 * @returns {Promise<{ success: true, siteId: string, alreadyExists: boolean, propagation: object }>}
 */
async function resolvePendingSite(store, { requesterRole, requesterUsername, pendingId, parc, famille, address }) {
  store.ensureDataReaderRole(requesterRole);
  const actor = actorName(requesterUsername);
  const db = requireDataPersistence(store, "data:pendingSite:resolve");
  const id = requirePendingId(store, pendingId, "data:pendingSite:resolve");
  const cleanParc = String(parc || "").trim().toUpperCase();
  const cleanFamille = String(famille || "").trim().toUpperCase();
  const cleanAddress = String(address || "").trim().toUpperCase();
  if (!cleanParc) {
    store.fail("data:pendingSite:resolve", "Le parc est obligatoire.", "DATA_PENDING_SITE_PARC_REQUIRED");
  }
  const resolved = await db.transaction(async (tx) => {
    const pending = await tx.get(
      `SELECT ${PENDING_SELECT} FROM data_site_pending WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!pending) {
      store.fail(
        "data:pendingSite:resolve",
        "Site en attente introuvable.",
        "DATA_PENDING_SITE_NOT_FOUND"
      );
    }
    const existing = await tx.get(
      `SELECT id, code, name, address FROM data_sites WHERE ${FOLD_CODE} LIMIT 1`,
      [pending.code]
    );
    const siteId = existing ? existing.id : generateEntityId();
    const now = new Date().toISOString();
    if (!existing) {
      await tx.run(
        "INSERT INTO data_sites (id, code, name, address, parc, famille, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [siteId, pending.code, pending.name, cleanAddress || null, cleanParc, cleanFamille, now]
      );
    } else if (cleanAddress && !String(existing.address || "").trim()) {
      await tx.run(
        "UPDATE data_sites SET address = ?, updated_at = ? WHERE id = ?",
        [cleanAddress, now, existing.id]
      );
    }
    await tx.run("DELETE FROM data_site_pending WHERE id = ?", [pending.id]);
    const officialName = existing ? existing.name : pending.name;
    const officialCode = existing ? existing.code : pending.code;
    const canonicalDisplay = `${officialName} (${officialCode})`;
    const likePattern = siteDisplayLikePattern(pending.code);
    const result = await tx.run(
      `UPDATE intervention_entries SET site_id = ?, site_display = ?
       WHERE site_id IS NULL AND lower(site_display) LIKE lower(?)`,
      [siteId, canonicalDisplay, likePattern]
    );
    const other = await propagateSiteToOtherDomains(
      store,
      siteId,
      canonicalDisplay,
      likePattern,
      tx
    );
    return {
      pending,
      siteId,
      officialCode,
      officialName,
      created: !existing,
      alreadyExists: Boolean(existing),
      canonicalDisplay,
      likePattern,
      parc: cleanParc,
      famille: cleanFamille,
      interventionEntries: Number(result.changes || 0),
      propagation: { interventionEntries: Number(result.changes || 0), ...other }
    };
  });
  if (resolved.created) {
    await store.recordEntityChange({
      entityType: "data_sites",
      entityId: resolved.siteId,
      changedBy: actor,
      snapshot: {
        code: resolved.officialCode,
        name: resolved.officialName,
        address: cleanAddress,
        parc: resolved.parc,
        famille: resolved.famille
      }
    });
  }
  const propagation = resolved.propagation;
  store.logAudit({
    actorUsername: actor,
    action: "DATA_SITE_PENDING_RESOLVE",
    details: {
      pendingSite: { code: resolved.pending.code, name: resolved.pending.name },
      createdSite: { code: resolved.officialCode, name: resolved.officialName },
      mode: resolved.alreadyExists ? "already_exists" : "created",
      propagation
    }
  });
  return {
    success: true,
    siteId: resolved.siteId,
    alreadyExists: resolved.alreadyExists,
    propagation
  };
}

/**
 * Supprime une proposition non utilisée. Motif obligatoire. Refus si déjà au référentiel
 * ou si une fiche (intervention, ronde, gardiennage, main courante) porte encore ce code sans id.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername?: string, pendingId?: unknown, reason?: unknown }} payload
 * @returns {Promise<{ success: true }>}
 */
async function deletePendingSite(store, { requesterRole, requesterUsername, pendingId, reason }) {
  store.ensureDataReaderRole(requesterRole);
  const actor = actorName(requesterUsername);
  const db = requireDataPersistence(store, "data:pendingSite:delete");
  const id = requirePendingId(store, pendingId, "data:pendingSite:delete");
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail(
      "data:pendingSite:delete",
      "Le motif de suppression est obligatoire.",
      "DATA_PENDING_SITE_DELETE_REASON_REQUIRED"
    );
  }
  const pending = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${PENDING_SELECT} FROM data_site_pending WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!row) {
      store.fail(
        "data:pendingSite:delete",
        "Site en attente introuvable.",
        "DATA_PENDING_SITE_NOT_FOUND"
      );
    }
    if (await tx.get(`SELECT id FROM data_sites WHERE ${FOLD_CODE} LIMIT 1`, [row.code])) {
      store.fail(
        "data:pendingSite:delete",
        "Ce site existe déjà dans le référentiel. Validez la proposition en attente ou supprimez-la après avoir mis à jour les fiches qui l'utilisent.",
        "DATA_PENDING_SITE_DELETE_BLOCKED_ALREADY_IN_BASE"
      );
    }
    const likePattern = siteDisplayLikePattern(row.code);
    const linkedIntervention = await tx.get(
      `SELECT id FROM intervention_entries
       WHERE archived_at IS NULL AND site_id IS NULL AND lower(site_display) LIKE lower(?) LIMIT 1`,
      [likePattern]
    );
    const linkedGardiennage = await tx.get(
      `SELECT id FROM gardiennage_entries
       WHERE site_id IS NULL AND lower(site_display) LIKE lower(?) LIMIT 1`,
      [likePattern]
    );
    const linkedRonde = await tx.get(
      `SELECT id FROM ronde_entries
       WHERE site_id IS NULL AND lower(site_display) LIKE lower(?) LIMIT 1`,
      [likePattern]
    );
    const linkedMainCourante = await require("../mainCourante").hasMainCouranteLinkedToPendingSiteDisplay(
      store,
      likePattern
    );
    if (linkedIntervention || linkedGardiennage || linkedRonde || linkedMainCourante) {
      store.fail(
        "data:pendingSite:delete",
        "Ce site en attente est encore utilisé par une fiche (intervention, ronde, gardiennage ou main courante). Clôturez ou modifiez la fiche concernée, ou validez le site dans le référentiel, puis réessayez.",
        "DATA_PENDING_SITE_DELETE_BLOCKED_LINKED_INTERVENTION"
      );
    }
    await tx.run("DELETE FROM data_site_pending WHERE id = ?", [row.id]);
    return row;
  });
  store.logAudit({
    actorUsername: actor,
    action: "DATA_SITE_PENDING_DELETE",
    details: { pendingSite: { code: pending.code, name: pending.name }, reason: cleanReason }
  });
  return { success: true };
}

module.exports = {
  listPendingSites,
  createPendingSite,
  resolvePendingSite,
  deletePendingSite
};
