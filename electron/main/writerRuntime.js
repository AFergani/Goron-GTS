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
