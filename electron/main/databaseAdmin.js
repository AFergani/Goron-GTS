/**
 * Administration locale des bases SQLite (active, archives trimestrielles, session archive).
 * Centralise la lecture de la config, l'inventaire des fichiers `.db` et le basculement de la base active.
 *
 * Instancié dans `main.js` ; exposé au renderer via `ipcSystemHandlers.js`
 * (`system:getDbConfig`, `system:listDatabases`, `system:switchDatabase`) et `gtsApiClient` / Paramètres.
 */

/**
 * Fabrique le service d'administration des bases de données du poste.
 *
 * @param {object} deps - Dépendances injectées par `main.js`.
 * @param {import('fs')} deps.fs - Accès disque (existence, copie, listing, dates de modification).
 * @param {import('path')} deps.path - Résolution et comparaison des chemins.
 * @param {boolean} deps.isDev - Indique si le profil développement est actif (retourné dans `getDbConfig`).
 * @param {() => object} deps.readAppConfig - Lecture de `app-config.json` (`dbPath`, `activeSourceDbPath`).
 * @param {(config: object) => void} deps.writeAppConfig - Persistance après bascule de base.
 * @param {() => string|null} deps.resolveDbPath - Chemin canonique de la base active (`gts-active.db`).
 * @param {(rawPath: string) => string} deps.normalizeNestedQuarterDbPath - Normalise les chemins archives imbriqués.
 * @param {(dbPath: string) => { activeDir: string, archivesDir: string }} deps.getDbStorageLayoutFromPath - Layout Activedb/Archives.
 * @param {(dbPath: string) => void} deps.setUserStoreByPath - Recharge le `UserStore` sur la nouvelle base.
 * @param {() => void} deps.refreshWriterRuntime - Recalcule le rôle writer après changement de base.
 * @param {(username: string) => boolean} deps.canManageDatabase - RBAC bascule de base (directeur / responsable / dev).
 * @param {(username: string) => boolean} deps.canManageArchiveSession - RBAC ouverture d'une archive en session.
 * @param {(username: string) => string|null} deps.getActiveUserRole - Rôle effectif (ex. `DEV` pour lever un verrou session).
 * @param {() => object} deps.getArchiveRuntime - État session archive (`archiveSession`, etc.).
 * @param {(next: object) => void} deps.setArchiveRuntime - Mise à jour de l'état session archive.
 * @param {() => import('../userStore')} deps.getUserStore - Store courant pour les audits d'écriture.
 * @returns {{
 *   getDbConfig: () => { configured: boolean, dbPath: string|null, isDev: boolean },
 *   listAvailableDatabases: () => object,
 *   switchActiveDatabase: (nextDbPath: string, opts?: object) => object
 * }}
 */
function createDatabaseAdminService(deps) {
  const {
    fs,
    path,
    isDev,
    readAppConfig,
    writeAppConfig,
    resolveDbPath,
    normalizeNestedQuarterDbPath,
    getDbStorageLayoutFromPath,
    setUserStoreByPath,
    refreshWriterRuntime,
    canManageDatabase,
    canManageArchiveSession,
    getActiveUserRole,
    getArchiveRuntime,
    setArchiveRuntime,
    getUserStore
  } = deps;

  /**
   * Retourne l'état de configuration de la base active pour l'écran Paramètres / session.
   *
   * Sans session authentifiée, `ipcSystemHandlers` masque le chemin (`dbPath: null`) tout en indiquant
   * si une base est configurée côté poste.
   *
   * @returns {{ configured: boolean, dbPath: string|null, isDev: boolean }}
   */
  function getDbConfig() {
    const dbPath = resolveDbPath();
    return {
      configured: Boolean(dbPath),
      dbPath,
      isDev
    };
  }

  /**
   * Liste les fichiers SQLite disponibles dans `Activedb` et `Archives`, avec indicateurs d'usage.
   *
   * Chaque entrée inclut `isActive` (fichier servi comme `gts-active`) et `isSourceActive`
   * (fichier source réel lors d'une session archive, via `activeSourceDbPath` dans la config).
   *
   * @returns {{
   *   activeDbPath: string|null,
   *   sourceDbPath: string|null,
   *   archiveSession: object|null,
   *   items: Array<{
   *     path: string,
   *     name: string,
   *     isActive: boolean,
   *     isSourceActive: boolean,
   *     lastModifiedAt: string
   *   }>
   * }}
   */
  function listAvailableDatabases() {
    const dbPath = resolveDbPath();
    if (!dbPath) return { activeDbPath: null, items: [] };
    const appCfg = readAppConfig();
    const sourceDbPath = String(appCfg.activeSourceDbPath || "").trim();
    const layout = getDbStorageLayoutFromPath(dbPath);
    const runtime = getArchiveRuntime();
    const items = [];
    const pushIfDb = (fullPath) => {
      if (!fullPath || !fs.existsSync(fullPath)) return;
      const ext = path.extname(fullPath).toLowerCase();
      if (![".db", ".sqlite", ".sqlite3"].includes(ext)) return;
      items.push({
        path: fullPath,
        name: path.basename(fullPath),
        isActive: path.resolve(fullPath) === path.resolve(dbPath),
        isSourceActive: Boolean(sourceDbPath) && path.resolve(fullPath) === path.resolve(sourceDbPath),
        lastModifiedAt: fs.statSync(fullPath).mtime.toISOString()
      });
    };
    if (fs.existsSync(layout.activeDir)) {
      const files = fs.readdirSync(layout.activeDir).sort((a, b) => a.localeCompare(b));
      for (const name of files) {
        pushIfDb(path.join(layout.activeDir, name));
      }
    } else {
      pushIfDb(dbPath);
    }
    if (fs.existsSync(layout.archivesDir)) {
      const files = fs.readdirSync(layout.archivesDir).sort((a, b) => a.localeCompare(b));
      for (const name of files) {
        pushIfDb(path.join(layout.archivesDir, name));
      }
    }
    return {
      activeDbPath: dbPath,
      sourceDbPath: sourceDbPath || null,
      archiveSession: runtime.archiveSession || null,
      items
    };
  }

  /**
   * Bascule la base SQLite active : copie vers `gts-active` si besoin, recharge le store et le writer.
   *
   * Règles métier :
   * - RBAC via `canManageDatabase` ; archives via `canManageArchiveSession` et verrou `archiveSession`.
   * - Un non-DEV ne peut pas remplacer une session archive ouverte par un autre utilisateur.
   * - Ouverture depuis `Archives` → session archive active + audit `DB_ARCHIVE_SESSION_ENTER`.
   * - Retour vers une base non-archive alors qu'une session était active → `DB_ARCHIVE_SESSION_EXIT`.
   * - Toute bascule réussie produit aussi `DB_ACTIVE_SWITCH` (acteur fixe `system:db-switch` dans l'audit).
   *
   * @param {string} nextDbPath - Chemin du fichier `.db` / `.sqlite` cible (actif ou archive).
   * @param {object} [opts]
   * @param {string|null} [opts.requesterRole=null] - Transmis par l'IPC pour compatibilité ; les contrôles passent par `requesterUsername`.
   * @param {string} [opts.requesterUsername="system:db-switch"] - Utilisateur demandeur (RBAC + audits session).
   * @returns {{
   *   success: true,
   *   activeDbPath: string,
   *   sourceDbPath: string,
   *   restoredFromArchive: boolean
   * }}
   * @throws {Error} Accès refusé, fichier introuvable, format non supporté, ou session archive verrouillée.
   */
  function switchActiveDatabase(nextDbPath, { requesterRole = null, requesterUsername = "system:db-switch" } = {}) {
    const requestedPath = normalizeNestedQuarterDbPath(String(nextDbPath || "").trim());
    const layout = getDbStorageLayoutFromPath(requestedPath);
    const ext = path.extname(requestedPath).toLowerCase();
    const canonicalActivePath = path.join(layout.activeDir, `gts-active${ext || ".db"}`);
    const targetPath = canonicalActivePath;
    if (!canManageDatabase(requesterUsername)) {
      throw new Error("Accès refusé: seuls le directeur de station, le responsable de station ou le dev peuvent changer la base de données.");
    }
    if (!requestedPath || !fs.existsSync(requestedPath)) {
      throw new Error("Base cible introuvable.");
    }
    const extCheck = path.extname(requestedPath).toLowerCase();
    if (![".db", ".sqlite", ".sqlite3"].includes(extCheck)) {
      throw new Error("Format de base non supporté.");
    }
    fs.mkdirSync(layout.activeDir, { recursive: true });
    if (path.resolve(requestedPath) !== path.resolve(canonicalActivePath)) {
      fs.copyFileSync(requestedPath, canonicalActivePath);
    }
    const requester = String(requesterUsername || "").trim().toLowerCase() || "system:db-switch";
    const requestedNormalized = path.resolve(requestedPath);
    const archiveDirNormalized = path.resolve(layout.archivesDir);
    const restoredFromArchive = requestedNormalized.startsWith(`${archiveDirNormalized}${path.sep}`);
    const runtime = getArchiveRuntime();
    const currentArchiveSession = runtime.archiveSession || {
      active: false,
      openedBy: null,
      openedAt: null,
      sourceDbPath: null,
      activeDbPath: null
    };
    if (restoredFromArchive && !canManageArchiveSession(requester)) {
      throw new Error(
        currentArchiveSession.active && currentArchiveSession.openedBy
          ? `Base de données ouverte sur : ${currentArchiveSession.openedBy}. Accès archive en lecture seule.`
          : "Accès archive en lecture seule. Seul un responsable/dev peut charger une archive."
      );
    }
    if (
      currentArchiveSession.active &&
      currentArchiveSession.openedBy &&
      currentArchiveSession.openedBy !== requester &&
      getActiveUserRole(requester) !== "DEV"
    ) {
      throw new Error(`Base de données ouverte sur : ${currentArchiveSession.openedBy}. Accès archive en lecture seule.`);
    }
    const previousPath = resolveDbPath();
    writeAppConfig({ ...readAppConfig(), dbPath: targetPath, activeSourceDbPath: requestedPath });
    setUserStoreByPath(targetPath);
    refreshWriterRuntime();
    const userStore = getUserStore();

    if (restoredFromArchive) {
      setArchiveRuntime({
        ...runtime,
        archiveSession: {
          active: true,
          openedBy: requester,
          openedAt: new Date().toISOString(),
          sourceDbPath: requestedPath,
          activeDbPath: targetPath
        }
      });
      userStore.logAudit({
        actorUsername: requester,
        action: "DB_ARCHIVE_SESSION_ENTER",
        details: { sourceDbPath: requestedPath, activeDbPath: targetPath }
      });
    } else if (currentArchiveSession.active) {
      setArchiveRuntime({
        ...runtime,
        archiveSession: {
          active: false,
          openedBy: null,
          openedAt: null,
          sourceDbPath: null,
          activeDbPath: targetPath
        }
      });
      userStore.logAudit({
        actorUsername: requester,
        action: "DB_ARCHIVE_SESSION_EXIT",
        details: {
          previousSourceDbPath: currentArchiveSession.sourceDbPath || null,
          activeDbPath: targetPath
        }
      });
    }
    userStore.logAudit({
      actorUsername: "system:db-switch",
      action: "DB_ACTIVE_SWITCH",
      details: { beforeDbPath: previousPath || null, afterDbPath: targetPath }
    });
    return {
      success: true,
      activeDbPath: targetPath,
      sourceDbPath: requestedPath,
      restoredFromArchive
    };
  }

  return {
    getDbConfig,
    listAvailableDatabases,
    switchActiveDatabase
  };
}

module.exports = {
  createDatabaseAdminService
};
