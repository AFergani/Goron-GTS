/**
 * Écriture SQL unique dans `audit_logs` (journal des actions métier).
 *
 * Chaîne réelle : domaines → `UserStore.logAudit` → `auditPersistence.write` → `writeAudit`.
 * Ne journalise pas les lectures ; réservé aux écritures tracées (CRUD, imports, etc.).
 * Un seul consommateur : `electron/store/persistence/auditPersistence.js`.
 *
 * @module electron/store/core/audit
 */

/**
 * Insère une ligne d'audit via l'adaptateur PostgreSQL.
 *
 * @param {import('../persistence/persistenceContract').PersistenceAdapter} persistence
 * @param {object} entry
 * @param {string} entry.actorUsername - Compte à l'origine de l'action ; défaut `"system"` si vide.
 * @param {string} entry.action - Code d'action (ex. `MAIN_COURANTE_CREATE`, `DATA_SITE_DELETE`).
 * @param {string|null} [entry.targetUsername=null] - Utilisateur cible si l'action concerne un compte.
 * @param {string} [entry.status="SUCCESS"] - Résultat (`SUCCESS`, `FAILED`, etc.).
 * @param {object|null} [entry.details=null] - Objet sérialisé en JSON (`before`/`after`, compteurs import, etc.).
 * @param {string|null} [entry.occurredAt=null] - Horodatage ISO ; défaut : maintenant.
 * @returns {Promise<void>}
 */
async function writeAudit(
  persistence,
  { actorUsername, action, targetUsername = null, status = "SUCCESS", details = null, occurredAt = null }
) {
  if (!persistence || typeof persistence.run !== "function") {
    throw new Error("Adaptateur de persistance indisponible pour l'audit.");
  }
  await persistence.run(
    `INSERT INTO audit_logs (occurred_at, actor_username, action, target_username, status, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      occurredAt || new Date().toISOString(),
      actorUsername || "system",
      action,
      targetUsername,
      status,
      details ? JSON.stringify(details) : null
    ]
  );
}

module.exports = { writeAudit };
