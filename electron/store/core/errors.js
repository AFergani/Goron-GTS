/**
 * Gestion uniforme des erreurs métier côté store : journalisation puis exception typée.
 * Les domaines appellent `store.fail(source, messageFr, code, details)` qui délègue à `failWithLog`.
 *
 * `AppError` est reconnue dans `main.js` (handlers IPC) pour renvoyer un message utilisateur
 * sans exposer la stack technique.
 */

/**
 * Erreur applicative avec message utilisateur et code machine.
 *
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} userMessage - Texte affiché ou transmis au renderer (français).
   * @param {string} [code="APP_ERROR"] - Identifiant stable (ex. `DATA_SITE_NOT_FOUND`).
   * @param {object} [context={}] - Détails techniques ou métier (également passés à `error_logs`).
   */
  constructor(userMessage, code = "APP_ERROR", context = {}) {
    super(userMessage);
    this.userMessage = userMessage;
    this.code = code;
    this.context = context;
  }
}

/**
 * Journalise l'erreur puis lève une `AppError` (pattern fail-fast des domaines).
 *
 * @param {import('../userStore')} store
 * @param {string} source - Canal ou opération en échec (ex. `intervention:create`).
 * @param {string} userMessage - Message en français pour l'utilisateur / le support.
 * @param {string} code - Code d'erreur référencé côté UI si besoin.
 * @param {object} [details={}] - Contexte persisté dans `error_logs.details_json`.
 * @returns {never}
 * @throws {AppError} Toujours levée après écriture du log.
 */
function failWithLog(store, source, userMessage, code, details = {}) {
  try {
    const maybePromise = store.logError({ source, code, messageFr: userMessage, details });
    // Sur SQLite async wrappé, l'INSERT s'exécute avant le premier yield.
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.catch(() => {});
    }
  } catch {
    // Le journal technique ne doit jamais masquer l'erreur métier.
  }
  throw new AppError(userMessage, code, details);
}

module.exports = { AppError, failWithLog };
