/**
 * Persistance locale de la configuration applicative Electron (fichier JSON dans userData).
 * Centralise la lecture/écriture de `app-config.json` pour éviter la duplication des accès disque
 * dans main.js, databaseAdmin, writerRuntime, ipcSystemHandlers, etc.
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
   * Utilisée au démarrage et avant toute opération sensible (résolution du chemin SQLite,
   * writer, archivage, restauration de la fenêtre) pour connaître l'état local de la station.
   *
   * Comportement :
   * - Fichier absent → `{ dbPath: null }` (premier lancement ou config effacée).
   * - JSON invalide ou lecture impossible → même repli sécurisé (évite de bloquer le démarrage).
   *
   * Clés couramment présentes dans l'objet retourné (fusionnées par les appelants via spread) :
   * - `dbPath` : chemin canonique de la base active (`Activedb/gts-active.db`).
   * - `activeSourceDbPath` : fichier source réellement ouvert (archive ou actif) lors d'une session archive.
   * - `writerConfigPath` : chemin du dernier `gts_writer-config.json` généré ou détecté.
   * - `lastArchivedQuarterKey` : trimestre civil déjà archivé (ex. `2026-Q1`) pour la rotation.
   * - `lastArchiveBatchAt` : horodatage ISO du dernier lot d'archivage logique main courante.
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
   * (`writeAppConfig({ ...readAppConfig(), dbPath: newPath })`) pour ne pas effacer les autres clés.
   *
   * Appelée notamment lors de :
   * - choix ou bascule de base SQLite (`databaseAdmin`, `ipcSystemHandlers`) ;
   * - génération / mémorisation du chemin writer (`writerRuntime`, `main.js`) ;
   * - rotation trimestrielle et archivage logique (`main.js`) ;
   * - persistance de la taille/position de fenêtre (`windowService.js`).
   *
   * @param {object} config - Objet JSON-serializable ; structure libre selon les modules métier.
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
