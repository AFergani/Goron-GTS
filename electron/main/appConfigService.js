/**
 * Persistance locale de la configuration applicative Electron (fichier JSON dans userData).
 * Centralise la lecture/écriture de `app-config.json` pour éviter la duplication des accès disque
 * dans main.js, ipcSystemHandlers, windowService, etc.
 */

/**
 * Fabrique le service de configuration applicative injecté dans le processus principal.
 *
 * @param {object} deps - Dépendances injectées pour faciliter les tests et limiter le couplage.
 * @param {import('fs')} deps.fs - API Node `fs` (lecture/écriture synchrone du fichier JSON).
 * @param {string} deps.appConfigPath - Chemin absolu du fichier, typiquement
 *   `{userData}/app-config.json` (défini dans `main.js` via `app.getPath('userData')`).
 * @returns {{ readAppConfig: () => object, writeAppConfig: (config: object) => void }}
 *   API exposée au reste du main process (`readAppConfig` / `writeAppConfig` réexportées dans `main.js`).
 */
function createAppConfigService(deps) {
  const { fs, appConfigPath } = deps;

  /**
   * Charge la configuration persistée du poste depuis `app-config.json`.
   *
   * Utilisée au démarrage et avant des opérations locales (géométrie fenêtre, clés héritées)
   * pour connaître l'état du poste. La connexion PostgreSQL vit dans `gts-pg.enc` (DPAPI),
   * pas dans ce fichier.
   *
   * Comportement :
   * - Fichier absent → `{}` avec repli historique `{ dbPath: null }` pour compat IPC.
   * - JSON invalide ou lecture impossible → même repli sécurisé (évite de bloquer le démarrage).
   *
   * Clés couramment présentes (fusionnées par les appelants via spread) :
   * - `dbPath` : clé historique (plus de SQLite métier) — conservée à `null` pour compat.
   * - `windowBounds` / `windowMaximized` : géométrie de la fenêtre principale (voir `windowService.js`).
   *
   * @returns {object} Configuration parsée ; au minimum `{ dbPath: null }` en cas d'absence ou d'erreur.
   */
  function readAppConfig() {
    if (!fs.existsSync(appConfigPath)) {
      return { dbPath: null };
    }
    try {
      return JSON.parse(fs.readFileSync(appConfigPath, "utf-8"));
    } catch {
      return { dbPath: null };
    }
  }

  /**
   * Enregistre intégralement la configuration applicative sur disque (écrasement du fichier).
   *
   * Les appelants doivent **fusionner** l'existant avec `readAppConfig()` avant d'écrire
   * (`writeAppConfig({ ...readAppConfig(), windowBounds })`) pour ne pas effacer les autres clés.
   *
   * Appelée notamment pour la persistance de la taille/position de fenêtre (`windowService.js`).
   *
   * @param {object} config - Objet JSON-serializable ; structure libre selon les modules.
   * @returns {void}
   */
  function writeAppConfig(config) {
    fs.writeFileSync(appConfigPath, JSON.stringify(config, null, 2), "utf-8");
  }

  return {
    readAppConfig,
    writeAppConfig
  };
}

module.exports = {
  createAppConfigService
};
