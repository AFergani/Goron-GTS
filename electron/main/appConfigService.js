/**
 * Persistance locale de la géométrie de la fenêtre principale (`app-config.json` dans userData).
 *
 * Instancié dans `main.js` ; lu et écrit par `windowService.js`.
 * Ne stocke pas la connexion PostgreSQL (secret dans `gts-pg.enc` / DPAPI).
 *
 * @module electron/main/appConfigService
 */

/**
 * Fabrique le service de configuration applicative injecté dans le processus principal.
 *
 * @param {object} deps - Dépendances injectées pour limiter le couplage.
 * @param {import('fs')} deps.fs - API Node `fs` (lecture/écriture synchrone du JSON).
 * @param {string} deps.appConfigPath - Chemin `{userData}/app-config.json` (défini dans `main.js`).
 * @returns {{ readAppConfig: () => object, writeAppConfig: (config: object) => void }}
 */
function createAppConfigService(deps) {
  const { fs, appConfigPath } = deps;

  /**
   * Ne conserve que les clés portées par ce fichier (`windowBounds`, `windowMaximized`).
   * Tout autre champ (y compris un JSON corrompu ou un tableau) est ignoré.
   *
   * @param {unknown} raw
   * @returns {{ windowBounds?: object, windowMaximized?: boolean }}
   */
  function sanitizeAppConfig(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const next = {};
    if (raw.windowBounds && typeof raw.windowBounds === "object" && !Array.isArray(raw.windowBounds)) {
      next.windowBounds = raw.windowBounds;
    }
    if (typeof raw.windowMaximized === "boolean") {
      next.windowMaximized = raw.windowMaximized;
    }
    return next;
  }

  /**
   * Charge `app-config.json`.
   *
   * Fichier absent, JSON invalide ou contenu non objet → `{}` (le démarrage n'est pas bloqué).
   *
   * @returns {{ windowBounds?: object, windowMaximized?: boolean }}
   */
  function readAppConfig() {
    if (!fs.existsSync(appConfigPath)) {
      return {};
    }
    try {
      return sanitizeAppConfig(JSON.parse(fs.readFileSync(appConfigPath, "utf-8")));
    } catch {
      return {};
    }
  }

  /**
   * Écrit la géométrie de fenêtre dans `app-config.json` (écrasement du fichier).
   *
   * @param {object} config - Objet fusionné par l'appelant (`windowService.js`).
   * @returns {void}
   */
  function writeAppConfig(config) {
    const sanitized = sanitizeAppConfig(config);
    fs.writeFileSync(appConfigPath, JSON.stringify(sanitized, null, 2), "utf-8");
  }

  return {
    readAppConfig,
    writeAppConfig
  };
}

module.exports = {
  createAppConfigService
};
