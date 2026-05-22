/**
 * Orchestration du runtime writer : lecture de `gts_writer-config.json`, résolution du profil actif,
 * rôle local (master / backup / client / disabled) et démarrage des services associés (HTTP, monitor, queue SMB, tray).
 *
 * Point d'entrée principal : `refreshWriterRuntime()` (démarrage app, changement de base, choix config, génération writer).
 * État mutable tenu dans `main.js` via `getWriterRuntime` / `setWriterRuntime`.
 */

/**
 * Fabrique le service de cycle de vie du runtime writer.
 *
 * @param {object} deps - Injections depuis `main.js`.
 * @param {boolean} deps.isDev - Priorité des profils `development` vs `production` dans `resolveActiveWriterProfile`.
 * @param {() => object} deps.readAppConfig
 * @param {(config: object) => void} deps.writeAppConfig - Mémorise `writerConfigPath` découvert.
 * @param {() => { config: object|null, configPath: string|null }} deps.resolveWriterConfigPath
 * @param {() => void} deps.stopWriterServer
 * @param {() => void} deps.stopWriterMonitor
 * @param {() => void} deps.stopWriterQueueWorker
 * @param {() => void} deps.startWriterServer - Mode `http` sur master/backup uniquement.
 * @param {() => void} deps.startWriterMonitor
 * @param {() => void} deps.startWriterQueueWorker - Mode `smb_queue`.
 * @param {() => void} deps.setupTrayIfNeeded
 * @param {() => void} deps.refreshTrayMenu
 * @param {(entry: object) => void} deps.appendWriterTransitLog
 * @param {() => object} deps.getLocalSourceContext
 * @param {(nodeCfg: object) => boolean} deps.isLocalNodeMatch - Matching super master / nœuds config.
 * @param {(config: object) => boolean} deps.isMasterByConfig
 * @param {(config: object) => boolean} deps.isBackupByConfig
 * @param {() => object} deps.getWriterRuntime
 * @param {(next: object) => void} deps.setWriterRuntime
 * @param {import('path')} deps.path
 * @param {string} deps.processCwd
 * @param {import('electron').App} deps.app
 * @param {string|null} deps.portableExecutableDir
 * @returns {{
 *   resolveActiveWriterProfile: (config: object) => { key: string, policy: string, profile: object|null },
 *   refreshWriterRuntime: () => void
 * }}
 */
function createWriterRuntimeService(deps) {
  const {
    isDev,
    readAppConfig,
    writeAppConfig,
    resolveWriterConfigPath,
    stopWriterServer,
    stopWriterMonitor,
    stopWriterQueueWorker,
    startWriterServer,
    startWriterMonitor,
    startWriterQueueWorker,
    setupTrayIfNeeded,
    refreshTrayMenu,
    appendWriterTransitLog,
    getLocalSourceContext,
    isLocalNodeMatch,
    isMasterByConfig,
    isBackupByConfig,
    getWriterRuntime,
    setWriterRuntime,
    path,
    processCwd,
    app,
    portableExecutableDir
  } = deps;

  /**
   * Détermine le profil d'environnement actif et sa politique writer (`activeWriterPolicy`).
   *
   * Cherche par alias selon `isDev` (development/dev/test/production) puis retombe sur le premier profil.
   *
   * @param {object} config - Contenu JSON `gts_writer-config.json` (`environmentProfiles`, `defaultProfile`).
   * @returns {{ key: string, policy: string, profile: object|null }}
   */
  function resolveActiveWriterProfile(config) {
    const profiles = config?.environmentProfiles;
    if (!profiles || typeof profiles !== "object") {
      return { key: "unknown", policy: "unknown", profile: null };
    }
    const profileEntries = Object.entries(profiles);
    if (!profileEntries.length) {
      return { key: "unknown", policy: "unknown", profile: null };
    }
    const normalize = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
    const byKey = new Map(profileEntries.map(([key, profile]) => [normalize(key), profile]));
    const defaultProfile = normalize(config?.defaultProfile || "");
    const aliases = isDev
      ? ["development", "dev", "rundev", defaultProfile, "test", "production", "prod"].filter(Boolean)
      : [defaultProfile, "production", "prod", "test", "development", "dev", "rundev"].filter(Boolean);
    for (const alias of aliases) {
      const match = byKey.get(alias);
      if (match?.activeWriterPolicy) {
        return { key: alias, policy: match.activeWriterPolicy, profile: match };
      }
    }
    const firstProfile = profileEntries[0]?.[1];
    return {
      key: normalize(profileEntries[0]?.[0] || "unknown"),
      policy: firstProfile?.activeWriterPolicy || "unknown",
      profile: firstProfile || null
    };
  }

  /**
   * Recharge intégralement le runtime writer depuis la config disque.
   *
   * Séquence :
   * 1. Arrêt serveur HTTP, monitor et worker queue.
   * 2. Si config absente → `role: disabled`, log `writer_runtime_disabled`.
   * 3. Sinon résolution profil, rôle (super master local, master, backup, client), secret, ports, `sharedRoot`.
   * 4. Redémarrage des sous-services selon `transportMode` (`http` / `smb_queue`) et rôle.
   *
   * @returns {void}
   */
  function refreshWriterRuntime() {
    stopWriterServer();
    stopWriterMonitor();
    stopWriterQueueWorker();
    const { config, configPath } = resolveWriterConfigPath();
    if (!config) {
      const currentRuntime = getWriterRuntime();
      setWriterRuntime({
        ...currentRuntime,
        enabled: false,
        role: "disabled",
        configPath: null,
        policy: null,
        masterHost: null,
        masterPort: null,
        backupHost: null,
        backupPort: null,
        failoverEnabled: false,
        writerTimeoutMs: 15000,
        connectivity: { masterReachable: null, backupReachable: null },
        secret: null,
        server: null
      });
      appendWriterTransitLog({
        event: "writer_runtime_disabled",
        reason: "writer_config_not_found",
        searchedFrom: {
          cwd: processCwd,
          exeDir: path.dirname(app.getPath("exe")),
          portableExeDir: portableExecutableDir || null,
          appConfigDbPath: readAppConfig().dbPath || null
        },
        local: getLocalSourceContext()
      });
      return;
    }
    const currentAppConfig = readAppConfig();
    if (configPath && currentAppConfig.writerConfigPath !== configPath) {
      writeAppConfig({ ...currentAppConfig, writerConfigPath: configPath });
    }
    const activeProfile = resolveActiveWriterProfile(config);
    const policy = activeProfile.policy;
    const transportMode = config?.writer?.transport?.mode || "smb_queue";
    const masterHost = config?.writer?.master?.host || "127.0.0.1";
    const masterPort = Number(config?.writer?.master?.port || 4711);
    const backupHost = config?.writer?.backup?.host || null;
    const backupPort = Number(config?.writer?.backup?.port || 4811);
    const failoverEnabled = Boolean(config?.writer?.failover?.enabled);
    const heartbeatIntervalMs = Number(config?.writer?.failover?.heartbeatIntervalMs || 3000);
    const writerTimeoutMs = Number(config?.writer?.failover?.writerTimeoutMs || 15000);
    const sharedRoot = configPath ? path.dirname(path.dirname(configPath)) : null;
    const writerSecret = String(config?.writer?.secret || "").trim() || null;
    const superMaster = activeProfile.profile?.superMaster || null;
    const superMasterEnabled = policy === "super_master_local_only" && Boolean(superMaster);
    const isMaster = superMasterEnabled ? isLocalNodeMatch(superMaster) : isMasterByConfig(config);
    const isBackup = !isMaster && !superMasterEnabled && isBackupByConfig(config);
    const effectiveMasterHost = superMasterEnabled ? superMaster.host || masterHost : masterHost;
    const effectiveMasterPort = superMasterEnabled ? Number(superMaster.port || masterPort) : masterPort;
    const effectiveFailoverEnabled = superMasterEnabled ? false : failoverEnabled;
    const currentRuntime = getWriterRuntime();
    const nextRuntime = {
      ...currentRuntime,
      enabled: true,
      role: isMaster ? "master" : isBackup ? "backup" : "client",
      transportMode,
      configPath,
      sharedRoot,
      policy,
      masterHost: effectiveMasterHost,
      masterPort: effectiveMasterPort,
      backupHost,
      backupPort,
      failoverEnabled: effectiveFailoverEnabled,
      writerTimeoutMs,
      heartbeatIntervalMs,
      connectivity: { masterReachable: null, backupReachable: null },
      secret: writerSecret,
      server: null
    };
    setWriterRuntime(nextRuntime);
    appendWriterTransitLog({
      event: "writer_runtime_refreshed",
      role: nextRuntime.role,
      profile: activeProfile.key,
      policy,
      transportMode,
      configPath,
      masterHost: effectiveMasterHost,
      masterPort: effectiveMasterPort,
      local: getLocalSourceContext()
    });
    if (nextRuntime.transportMode === "http" && (nextRuntime.role === "master" || nextRuntime.role === "backup")) {
      startWriterServer();
    }
    startWriterMonitor();
    startWriterQueueWorker();
    setupTrayIfNeeded();
    refreshTrayMenu();
  }

  return {
    resolveActiveWriterProfile,
    refreshWriterRuntime
  };
}

module.exports = {
  createWriterRuntimeService
};
