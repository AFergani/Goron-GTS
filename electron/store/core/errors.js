/**
 * Erreurs métier du store : `AppError` typée + `failWithLog` (fail-fast).
 *
 * Les domaines appellent `store.fail(...)`, qui délègue ici.
 * `AppError` est reconnue dans `main.js` (handlers IPC) : seul le message français
 * part vers le renderer, sans stack technique.
 *
 * `failWithLog` tente `store.logError` avant le throw. Aujourd'hui `UserStore.logError`
 * est un no-op : le journal technique PG du poste est `gts-pg-events.log`.
 *
 * @module electron/store/core/errors
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
   * @param {object} [context={}] - Contexte métier (source, champs, etc.).
   */
  constructor(userMessage, code = "APP_ERROR", context = {}) {
    super(userMessage);
    this.name = "AppError";
    this.userMessage = userMessage;
    this.code = code;
    this.context = context;
  }
}

/**
 * Tente un journal technique puis lève toujours une `AppError`.
 *
 * @param {import('../../userStore')} store
 * @param {string} source - Canal ou opération en échec (ex. `intervention:create`).
 * @param {string} userMessage - Message en français pour l'utilisateur.
 * @param {string} code - Code d'erreur stable.
 * @param {object} [details={}] - Contexte passé à `logError` et à `AppError.context`.
 * @returns {never}
 * @throws {AppError}
 */
function failWithLog(store, source, userMessage, code, details = {}) {
  try {
    if (store && typeof store.logError === "function") {
      const maybePromise = store.logError({ source, code, messageFr: userMessage, details });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.catch(() => {});
      }
    }
  } catch {
    /* le journal technique ne doit jamais masquer l'erreur métier */
  }
  throw new AppError(userMessage, code, details);
}

module.exports = { AppError, failWithLog };
