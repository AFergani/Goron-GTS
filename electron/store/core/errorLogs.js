/**
 * Journalisation technique des erreurs métier dans `error_logs` (support et diagnostic).
 * Complète les messages utilisateur : chaque `store.fail` passe par `errors.failWithLog` → `UserStore.logError` → ici.
 *
 * Distinct de `audit.js` (actions métier réussies ou suivies) ; réservé aux échecs / validations avec code d'erreur.
 */

/**
 * Insère une entrée dans `error_logs`.
 *
 * @param {import('../userStore')} store - Instance store (accès `store.db`).
 * @param {object} entry
 * @param {string} entry.source - Canal IPC ou contexte (ex. `data:sites:update`, `auth:login`).
 * @param {string} entry.code - Code machine (ex. `DATA_SITE_NOT_FOUND`, `AUTH_BAD_PASSWORD`).
 * @param {string} entry.messageFr - Message affichable ou exploitable par le support, en français.
 * @param {object} [entry.details] - Contexte additionnel sérialisé en JSON (champs rejetés, ids, etc.).
 * @returns {void}
 */
function writeErrorLog(store, { source, code, messageFr, details }) {
  store.db
    .prepare(
      `INSERT INTO error_logs (occurred_at, source, code, message_fr, details_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      new Date().toISOString(),
      source,
      code,
      messageFr,
      details ? JSON.stringify(details) : null
    );
}

module.exports = {
  writeErrorLog
};
