/**
 * Journalisation technique des flux writer (`writer-transit.log`) : emplacement, rotation et append.
 * Ne bloque jamais le flux applicatif en cas d'échec disque (repli vers `userData/logs`).
 *
 * Service lazy dans `main.js` (`getWriterLogsService`) ; `appendWriterTransitLog` injecté dans
 * HTTP writer, file SMB, runtime, monitor et création main courante forward.
 */

/**
 * Fabrique le service de logs writer.
 *
 * @param {object} deps
 * @param {import('fs')} deps.fs
 * @param {import('path')} deps.path
 * @param {string} deps.fallbackWriterLogsDir - Répertoire de repli (`userData/logs`).
 * @param {number} deps.writerLogMaxFileBytes - Seuil de rotation d'un fichier (ex. 5 Mo).
 * @param {number} deps.writerLogMaxFiles - Nombre de fichiers historiques conservés.
 * @param {() => object} deps.readAppConfig - Pour `dbPath` si config writer absente.
 * @param {() => { config: object|null, configPath: string|null }} deps.resolveWriterConfigPath - Dossier `logs` voisin de la config.
 * @returns {{
 *   getWriterLogContext: () => { logsDir: string, logFile: string },
 *   rotateWriterTransitLogsIfNeeded: (logFile: string) => void,
 *   appendWriterTransitLog: (entry: object) => void
 * }}
 */
function createWriterLogsService(deps) {
  const {
    fs,
    path,
    fallbackWriterLogsDir,
    writerLogMaxFileBytes,
    writerLogMaxFiles,
    readAppConfig,
    resolveWriterConfigPath
  } = deps;

  /**
   * Résout le répertoire et le fichier actif `writer-transit.log`.
   *
   * Priorité : `logs/` à côté du `gts_writer-config.json` trouvé, sinon à côté de `dbPath`,
   * sinon `fallbackWriterLogsDir`.
   *
   * @returns {{ logsDir: string, logFile: string }}
   */
  function getWriterLogContext() {
    const appCfg = readAppConfig();
    const { configPath } = resolveWriterConfigPath();
    let logsDir = fallbackWriterLogsDir;
    if (configPath) {
      logsDir = path.join(path.dirname(configPath), "logs");
    } else if (appCfg.dbPath && fs.existsSync(appCfg.dbPath)) {
      logsDir = path.join(path.dirname(appCfg.dbPath), "logs");
    }
    const logFile = path.join(logsDir, "writer-transit.log");
    return { logsDir, logFile };
  }

  /**
   * Effectue une rotation nommée si `writer-transit.log` dépasse la taille max.
   *
   * Décale `writer-transit.N.log` et supprime le plus ancien au-delà de `writerLogMaxFiles`.
   *
   * @param {string} logFile - Chemin du fichier courant.
   * @returns {void} No-op si fichier absent ou sous le seuil.
   */
  function rotateWriterTransitLogsIfNeeded(logFile) {
    if (!fs.existsSync(logFile)) return;
    const currentSize = fs.statSync(logFile).size;
    if (currentSize < writerLogMaxFileBytes) return;
    for (let index = writerLogMaxFiles - 1; index >= 1; index -= 1) {
      const sourcePath = path.join(path.dirname(logFile), `writer-transit.${index}.log`);
      const targetPath = path.join(path.dirname(logFile), `writer-transit.${index + 1}.log`);
      if (!fs.existsSync(sourcePath)) continue;
      if (index === writerLogMaxFiles - 1) {
        fs.unlinkSync(sourcePath);
        continue;
      }
      fs.renameSync(sourcePath, targetPath);
    }
    fs.renameSync(logFile, path.join(path.dirname(logFile), "writer-transit.1.log"));
  }

  /**
   * Ajoute une ligne JSON horodatée au journal transit writer.
   *
   * Effet de bord disque ; erreurs avalées (tentative repli `fallbackWriterLogsDir`).
   *
   * @param {object} entry - Objet sérialisé en JSON (événement, requestId, result, etc.).
   * @returns {void}
   */
  function appendWriterTransitLog(entry) {
    const line = `${new Date().toISOString()} ${JSON.stringify(entry)}\n`;
    const writeTo = (logsDir) => {
      const logFile = path.join(logsDir, "writer-transit.log");
      fs.mkdirSync(logsDir, { recursive: true });
      rotateWriterTransitLogsIfNeeded(logFile);
      fs.appendFileSync(logFile, line, "utf-8");
    };
    try {
      writeTo(getWriterLogContext().logsDir);
    } catch {
      try {
        writeTo(fallbackWriterLogsDir);
      } catch {
        // Ne jamais bloquer le flux applicatif à cause des logs.
      }
    }
  }

  return {
    getWriterLogContext,
    rotateWriterTransitLogsIfNeeded,
    appendWriterTransitLog
  };
}

module.exports = {
  createWriterLogsService
};
