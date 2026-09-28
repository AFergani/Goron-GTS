/**
 * Sauvegardes PostgreSQL : dump complet (`pg_dump -Fc`), planning quotidien 03:00,
 * rétention (14 journalières + 12 mensuelles), restauration.
 *
 * Dump auto uniquement si l'hôte PG du poste est une adresse de boucle locale
 * (PC qui héberge Docker / PostgreSQL).
 * Opérations dump/restore : `postgresBackupOps.js`.
 *
 * @module electron/main/postgresBackupService
 */

const fs = require("fs");
const path = require("path");
const { getPostgresConnectionConfig } = require("../store/persistence/postgresConnectionConfig");
const { probePostgresLab } = require("../store/persistence/postgresLabProbe");
const {
  DAILY_HOUR,
  DAILY_KEEP,
  MONTHLY_KEEP,
  readPostgresBackupConfig,
  writePostgresBackupConfig
} = require("../store/persistence/postgresBackupConfig");
const { runDumpCompare } = require("./postgresDumpCompare");
const {
  isLoopbackHost,
  reportActorLabel,
  logBackupTechEvent,
  DUMP_EXT,
  dumpFileNameForKind,
  listDumpFiles,
  applyRetention,
  dumpDatabase,
  restoreDatabase,
  terminateOtherBackends,
  resolveDumpPath,
  isPgDumpCustomFormat,
  localDateKey,
  localMonthKey
} = require("./postgresBackupOps");

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const SCHEDULER_ACTOR = "system:pg-backup";
const BUSY_ERROR = "Une sauvegarde, une restauration ou une comparaison est déjà en cours.";
/** Aligné sur `RESTORE_CONFIRM_PHRASE` côté UI (`postgresRestoreConfirm.ts`). */
const RESTORE_CONFIRM_PHRASE = "RESTAURER";

/**
 * Fabrique le service de sauvegarde PostgreSQL.
 *
 * @param {object} deps
 * @param {import('electron').Dialog} deps.dialog
 * @param {import('electron').Shell} deps.shell
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {() => import('../userStore')|null} deps.getUserStore
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @param {{ reconnect: () => Promise<object> }} deps.postgresAdmin
 * @param {import('electron').App} [deps.app]
 * @returns {object}
 */
function createPostgresBackupService(deps) {
  const { dialog, shell, getMainWindow, getUserStore, canManageDatabase, postgresAdmin, app } = deps;
  let busy = false;
  let schedulerTimer = null;

  /**
   * @param {string} requesterUsername
   * @returns {void}
   */
  function assertCanManage(requesterUsername) {
    if (!canManageDatabase(requesterUsername)) {
      const err = new Error("Droits insuffisants pour gérer les sauvegardes PostgreSQL.");
      err.code = "FORBIDDEN";
      throw err;
    }
  }

  /**
   * Écriture audit métier (choix du dossier / planning). Les dumps vont au journal technique.
   *
   * @param {object} entry
   * @returns {void}
   */
  function logAudit(entry) {
    const store = getUserStore();
    if (!store || typeof store.logAudit !== "function") return;
    try {
      store.logAudit(entry);
    } catch {
      // L'audit ne doit pas bloquer le dump.
    }
  }

  /**
   * @returns {object}
   */
  function getStatus() {
    const cfg = readPostgresBackupConfig();
    const pg = getPostgresConnectionConfig();
    const autoEligible = isLoopbackHost(pg.host);
    const files = listDumpFiles(cfg.folderPath);
    return {
      folderPath: cfg.folderPath || null,
      autoEnabled: Boolean(cfg.autoEnabled),
      autoEligible,
      host: pg.host,
      dailyHour: DAILY_HOUR,
      dailyKeep: DAILY_KEEP,
      monthlyKeep: MONTHLY_KEEP,
      lastRunAt: cfg.lastRunAt,
      lastRunKind: cfg.lastRunKind,
      lastRunStatus: cfg.lastRunStatus,
      lastRunError: cfg.lastRunError,
      lastRunFileName: cfg.lastRunFileName,
      cycleStarted: files.some((row) => row.kind === "daily"),
      files
    };
  }

  /**
   * @param {object} payload
   * @returns {Promise<{ canceled: boolean, folderPath: string|null, config: object }>}
   */
  async function pickFolder(payload = {}) {
    assertCanManage(payload.requesterUsername);
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: "Dossier des sauvegardes PostgreSQL",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, folderPath: null, config: getStatus() };
    }
    const folderPath = result.filePaths[0];
    const pg = getPostgresConnectionConfig();
    writePostgresBackupConfig({
      folderPath,
      autoEnabled: isLoopbackHost(pg.host)
    });
    logAudit({
      actorUsername: payload.requesterUsername,
      action: "POSTGRES_BACKUP_FOLDER_SET",
      status: "SUCCESS",
      details: { after: { folderPath } }
    });
    return { canceled: false, folderPath, config: getStatus() };
  }

  /**
   * @param {object} payload
   * @returns {object}
   */
  function saveSettings(payload = {}) {
    assertCanManage(payload.requesterUsername);
    const current = readPostgresBackupConfig();
    if (!current.folderPath) {
      throw new Error("Choisissez d'abord un dossier de sauvegarde.");
    }
    const pg = getPostgresConnectionConfig();
    const requested = Boolean(payload.autoEnabled);
    const autoEnabled = requested && isLoopbackHost(pg.host);
    writePostgresBackupConfig({ autoEnabled });
    logAudit({
      actorUsername: payload.requesterUsername,
      action: "POSTGRES_BACKUP_SETTINGS_SAVE",
      status: "SUCCESS",
      details: { after: { autoEnabled } }
    });
    return getStatus();
  }

  /**
   * @returns {Promise<{ success: boolean, path: string|null, error: string|null }>}
   */
  async function openFolder() {
    const folderPath = readPostgresBackupConfig().folderPath;
    if (!folderPath) {
      return { success: false, path: null, error: "Aucun dossier de sauvegarde n'est défini." };
    }
    const error = await shell.openPath(folderPath);
    return { success: !error, path: folderPath, error: error || null };
  }

  /**
   * @returns {Promise<{ canceled: boolean, filePath: string|null, fileName: string|null }>}
   */
  async function pickDumpFile() {
    const win = getMainWindow();
    const current = readPostgresBackupConfig();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: "Choisir une sauvegarde PostgreSQL",
      defaultPath: current.folderPath || undefined,
      properties: ["openFile"],
      filters: [{ name: "Sauvegarde PostgreSQL", extensions: ["dump"] }]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, filePath: null, fileName: null };
    }
    const filePath = result.filePaths[0];
    if (!isPgDumpCustomFormat(filePath)) {
      throw new Error("Ce fichier n'est pas une sauvegarde PostgreSQL valide (.dump).");
    }
    return { canceled: false, filePath, fileName: path.basename(filePath) };
  }

  /**
   * @param {object} options
   * @param {string} options.destPath
   * @param {"daily"|"manual"} options.kind
   * @param {string} options.actorUsername
   * @param {boolean} [options.updateRotation]
   * @returns {Promise<object>}
   */
  async function runDumpToDestination(options) {
    const destPath = path.resolve(String(options.destPath || "").trim());
    const kind = options.kind === "daily" ? "daily" : "manual";
    const actorUsername = String(options.actorUsername || SCHEDULER_ACTOR);
    const updateRotation = Boolean(options.updateRotation);
    if (busy) {
      throw new Error(BUSY_ERROR);
    }
    if (!destPath.toLowerCase().endsWith(DUMP_EXT)) {
      throw new Error("Le fichier de sauvegarde doit être au format .dump.");
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const probe = await probePostgresLab();
    if (!probe.reachable) {
      throw new Error("PostgreSQL est injoignable : impossible de créer une sauvegarde.");
    }

    const now = new Date();
    const fileName = path.basename(destPath);
    const pg = getPostgresConnectionConfig();
    const current = readPostgresBackupConfig();

    busy = true;
    try {
      await dumpDatabase(pg, destPath);
      let monthlyName = null;
      if (updateRotation && current.folderPath) {
        const monthKey = localMonthKey(now);
        if (current.lastMonthlyKey !== monthKey) {
          monthlyName = dumpFileNameForKind("monthly", now);
          fs.copyFileSync(destPath, resolveDumpPath(current.folderPath, monthlyName));
          current.lastMonthlyKey = monthKey;
        }
        applyRetention(current.folderPath);
      }
      writePostgresBackupConfig({
        lastDailyKey: updateRotation ? localDateKey(now) : current.lastDailyKey,
        lastMonthlyKey: current.lastMonthlyKey,
        lastRunAt: now.toISOString(),
        lastRunKind: kind,
        lastRunStatus: "ok",
        lastRunError: null,
        lastRunFileName: fileName
      });
      logBackupTechEvent(
        kind === "daily" ? "PG_BACKUP_AUTO_OK" : "PG_BACKUP_MANUAL_OK",
        kind === "daily"
          ? "Sauvegarde journalière PostgreSQL enregistrée."
          : "Sauvegarde manuelle PostgreSQL enregistrée.",
        {
          fileName,
          filePath: destPath,
          monthlyFileName: monthlyName,
          kind,
          actorLabel: reportActorLabel(actorUsername)
        }
      );
      return { success: true, fileName, filePath: destPath, config: getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Sauvegarde impossible.");
      writePostgresBackupConfig({
        lastRunAt: now.toISOString(),
        lastRunKind: kind,
        lastRunStatus: "error",
        lastRunError: message
      });
      logBackupTechEvent("PG_BACKUP_FAILED", "Sauvegarde PostgreSQL impossible.", {
        reason: message,
        kind,
        actorLabel: reportActorLabel(actorUsername)
      });
      throw new Error(message);
    } finally {
      busy = false;
    }
  }

  /**
   * @param {"daily"|"manual"} kind
   * @param {string} actorUsername
   * @returns {Promise<object>}
   */
  async function runDump(kind, actorUsername) {
    const current = readPostgresBackupConfig();
    if (!current.folderPath) {
      throw new Error("Choisissez d'abord un dossier de sauvegarde.");
    }
    const now = new Date();
    const fileName = dumpFileNameForKind(kind === "daily" ? "daily" : "manual", now);
    const destPath = resolveDumpPath(current.folderPath, fileName);
    return runDumpToDestination({
      destPath,
      kind,
      actorUsername,
      updateRotation: kind === "daily"
    });
  }

  /**
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function runManualDump(payload = {}) {
    assertCanManage(payload.requesterUsername);
    return runDump("manual", payload.requesterUsername);
  }

  /**
   * Première journalière + activation du cycle (puis tous les jours à 3 h).
   * Invisible côté UI dès qu'un dump journalier existe dans le dossier.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function startBackupCycle(payload = {}) {
    assertCanManage(payload.requesterUsername);
    const current = readPostgresBackupConfig();
    if (!current.folderPath) {
      throw new Error("Choisissez d'abord un dossier de sauvegarde.");
    }
    const pg = getPostgresConnectionConfig();
    if (!isLoopbackHost(pg.host)) {
      throw new Error("Le cycle automatique est réservé au poste qui héberge PostgreSQL (localhost).");
    }
    const files = listDumpFiles(current.folderPath);
    if (files.some((row) => row.kind === "daily")) {
      throw new Error("Le cycle de sauvegardes journalières est déjà lancé.");
    }
    if (!current.autoEnabled) {
      writePostgresBackupConfig({ autoEnabled: true });
    }
    return runDump("daily", payload.requesterUsername);
  }

  /**
   * Dump immédiat vers un chemin choisi (dialogue Enregistrer sous).
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function runManualDumpSaveAs(payload = {}) {
    assertCanManage(payload.requesterUsername);
    if (busy) {
      throw new Error(BUSY_ERROR);
    }
    const now = new Date();
    const defaultName = dumpFileNameForKind("manual", now);
    const current = readPostgresBackupConfig();
    let defaultPath = defaultName;
    try {
      if (current.folderPath) {
        defaultPath = path.join(current.folderPath, defaultName);
      } else if (app && typeof app.getPath === "function") {
        defaultPath = path.join(app.getPath("documents"), defaultName);
      }
    } catch {
      defaultPath = defaultName;
    }
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win || undefined, {
      title: "Enregistrer la sauvegarde PostgreSQL",
      defaultPath,
      filters: [{ name: "Sauvegarde PostgreSQL", extensions: ["dump"] }]
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true, fileName: null, filePath: null, config: getStatus() };
    }
    let destPath = result.filePath;
    if (!destPath.toLowerCase().endsWith(DUMP_EXT)) {
      destPath += DUMP_EXT;
    }
    const dumped = await runDumpToDestination({
      destPath,
      kind: "manual",
      actorUsername: payload.requesterUsername,
      updateRotation: false
    });
    return { canceled: false, ...dumped };
  }

  /**
   * @param {object} payload
   * @returns {string}
   */
  function resolveExistingDumpPath(payload = {}) {
    const current = readPostgresBackupConfig();
    let srcPath = String(payload.filePath || "").trim();
    const fileName = String(payload.fileName || "").trim();
    if (!srcPath && fileName) {
      if (!current.folderPath) {
        throw new Error("Aucun dossier de sauvegarde n'est défini.");
      }
      srcPath = resolveDumpPath(current.folderPath, fileName);
    }
    if (!srcPath || !fs.existsSync(srcPath)) {
      throw new Error("Fichier de sauvegarde introuvable.");
    }
    if (!isPgDumpCustomFormat(srcPath)) {
      throw new Error("Ce fichier n'est pas une sauvegarde PostgreSQL valide (.dump).");
    }
    return srcPath;
  }

  /**
   * Double confirmation : mot de passe du compte responsable / directeur et mot RESTAURER.
   * Le mot de passe n'est jamais journalisé.
   *
   * @param {object} payload
   * @param {string} requesterUsername
   * @returns {Promise<void>}
   */
  async function assertRestoreConfirmation(payload, requesterUsername) {
    const phrase = String(payload.confirmPhrase || "").trim().toLocaleUpperCase("fr-FR");
    const password = String(payload.accountPassword || "");
    payload.accountPassword = "";
    payload.confirmPhrase = "";
    if (phrase !== RESTORE_CONFIRM_PHRASE) {
      throw new Error(`Pour confirmer, saisissez le mot ${RESTORE_CONFIRM_PHRASE}.`);
    }
    if (!password) {
      throw new Error("Saisissez le mot de passe du compte responsable ou directeur.");
    }
    const store = getUserStore();
    if (!store || typeof store.confirmStationAdminPassword !== "function") {
      throw new Error("Impossible de vérifier le compte pour la restauration.");
    }
    const sessionUser =
      requesterUsername !== SCHEDULER_ACTOR && requesterUsername !== "system:pg-bootstrap"
        ? requesterUsername
        : "";
    const check = await store.confirmStationAdminPassword({
      username: sessionUser || undefined,
      fullName: sessionUser ? undefined : String(payload.managerFullName || "").trim(),
      password
    });
    if (check === "dev-code-unavailable") {
      throw new Error("Code administrateur indisponible sur ce poste.");
    }
    if (check === "forbidden") {
      throw new Error("Seul un responsable, un directeur ou un administrateur peut restaurer.");
    }
    if (check !== "ok") {
      throw new Error("Mot de passe incorrect.");
    }
  }

  /**
   * @param {object} payload
   * @returns {Promise<{ success: boolean, fileName: string }>}
   */
  async function restoreBackup(payload = {}) {
    const requesterUsername = String(payload.requesterUsername || SCHEDULER_ACTOR).trim() || SCHEDULER_ACTOR;
    if (requesterUsername !== SCHEDULER_ACTOR && requesterUsername !== "system:pg-bootstrap") {
      assertCanManage(requesterUsername);
    }
    await assertRestoreConfirmation(payload, requesterUsername);
    if (busy) {
      throw new Error(BUSY_ERROR);
    }

    const srcPath = resolveExistingDumpPath(payload);
    const probe = await probePostgresLab();
    if (!probe.reachable) {
      throw new Error("PostgreSQL est injoignable. Démarrez Docker / le serveur, puis relancez la restauration.");
    }

    const pg = getPostgresConnectionConfig();
    const store = getUserStore();
    busy = true;
    try {
      if (store && typeof store.close === "function") {
        await store.close().catch(() => {});
      }
      try {
        await terminateOtherBackends(pg);
      } catch {
        // Connexions déjà coupées après close().
      }
      await restoreDatabase(pg, srcPath);
      if (postgresAdmin && typeof postgresAdmin.reconnect === "function") {
        const reconnect = await postgresAdmin.reconnect();
        if (!reconnect.reachable) {
          throw new Error(reconnect.error || "Restauration terminée, mais la reconnexion applicative a échoué.");
        }
      }
      logBackupTechEvent("PG_BACKUP_RESTORE_OK", "Restauration PostgreSQL terminée.", {
        fileName: path.basename(srcPath),
        actorLabel: reportActorLabel(requesterUsername)
      });
      return {
        success: true,
        fileName: path.basename(srcPath)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Restauration impossible.");
      logBackupTechEvent("PG_BACKUP_RESTORE_FAILED", "Restauration PostgreSQL impossible.", {
        reason: message,
        actorLabel: reportActorLabel(requesterUsername)
      });
      try {
        if (postgresAdmin && typeof postgresAdmin.reconnect === "function") {
          await postgresAdmin.reconnect();
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    } finally {
      busy = false;
    }
  }

  /**
   * Compare le dump à la base actuelle via une base temporaire (live intacte).
   * Réservé à une session déjà autorisée à gérer la base (`comparePostgresBackupAuth`).
   *
   * @param {object} payload
   * @returns {Promise<{ success: boolean, fileName: string, reportHtmlPath: string, totals: object, schemaWarning: boolean, dumpFileName: string, generatedAt: string, tables: object[] }>}
   */
  async function compareBackup(payload = {}) {
    const requesterUsername = String(payload.requesterUsername || "").trim();
    assertCanManage(requesterUsername);
    if (busy) {
      throw new Error(BUSY_ERROR);
    }

    const srcPath = resolveExistingDumpPath(payload);
    const probe = await probePostgresLab();
    if (!probe.reachable) {
      throw new Error("PostgreSQL est injoignable. Démarrez Docker / le serveur, puis relancez la comparaison.");
    }

    const pg = getPostgresConnectionConfig();
    busy = true;
    try {
      const compared = await runDumpCompare({
        cfg: pg,
        dumpPath: srcPath,
        actorLabel: reportActorLabel(requesterUsername),
        restoreIntoDatabase: (database) => restoreDatabase(pg, srcPath, { database, clean: false })
      });
      logBackupTechEvent("PG_BACKUP_COMPARE_OK", "Comparaison dump / base actuelle terminée.", {
        fileName: path.basename(srcPath),
        reportHtmlPath: compared.htmlPath,
        lost: compared.totals.lost,
        recovered: compared.totals.recovered,
        changed: compared.totals.changed,
        actorLabel: reportActorLabel(requesterUsername)
      });
      return {
        success: true,
        fileName: path.basename(srcPath),
        reportHtmlPath: compared.htmlPath,
        totals: compared.totals,
        schemaWarning: Boolean(compared.schemaWarning),
        dumpFileName: compared.dumpFileName,
        generatedAt: compared.generatedAt,
        tables: compared.tables
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Comparaison impossible.");
      logBackupTechEvent("PG_BACKUP_COMPARE_FAILED", "Comparaison dump / base actuelle impossible.", {
        reason: message,
        actorLabel: reportActorLabel(requesterUsername)
      });
      throw new Error(message);
    } finally {
      busy = false;
    }
  }

  /**
   * Dump journalier à 3 h (rattrapage si la veille a été manquée). No-op hors localhost.
   *
   * @returns {Promise<void>}
   */
  async function tickScheduler() {
    if (busy) return;
    const current = readPostgresBackupConfig();
    if (!current.autoEnabled || !current.folderPath) return;
    const pg = getPostgresConnectionConfig();
    if (!isLoopbackHost(pg.host)) return;

    const now = new Date();
    const today = localDateKey(now);
    const yesterdayDate = new Date(now.getTime());
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = localDateKey(yesterdayDate);
    const missedDays = Boolean(current.lastDailyKey) && current.lastDailyKey < yesterday;
    const afterHour = now.getHours() >= DAILY_HOUR;
    if (current.lastDailyKey === today) return;
    if (!afterHour && !missedDays) return;

    try {
      await runDump("daily", SCHEDULER_ACTOR);
    } catch {
      // Déjà journalisé.
    }
  }

  /**
   * @returns {void}
   */
  function startScheduler() {
    stopScheduler();
    void tickScheduler();
    schedulerTimer = setInterval(() => {
      void tickScheduler();
    }, SCHEDULER_INTERVAL_MS);
  }

  /**
   * @returns {void}
   */
  function stopScheduler() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  return {
    getStatus,
    pickFolder,
    saveSettings,
    openFolder,
    pickDumpFile,
    runManualDump,
    runManualDumpSaveAs,
    startBackupCycle,
    restoreBackup,
    compareBackup,
    startScheduler,
    stopScheduler
  };
}

module.exports = {
  createPostgresBackupService
};
