function createWriterMonitorService(deps) {
  const {
    appendWriterTransitLog,
    getLocalSourceContext,
    getJson,
    getWriterRuntime,
    setWriterRuntime
  } = deps;

  let writerMonitorTimer = null;

  function updateConnectivityAndLog(key, reachable, details) {
    const writerRuntime = getWriterRuntime();
    const previous = writerRuntime.connectivity[key];
    setWriterRuntime({
      ...writerRuntime,
      connectivity: {
        ...writerRuntime.connectivity,
        [key]: reachable
      }
    });
    if (previous === reachable) return;
    appendWriterTransitLog({
      event: "writer_peer_status_changed",
      peer: key === "masterReachable" ? "master" : "backup",
      reachable,
      previous,
      local: getLocalSourceContext(),
      details
    });
  }

  function stopWriterMonitor() {
    if (writerMonitorTimer) {
      clearInterval(writerMonitorTimer);
      writerMonitorTimer = null;
    }
  }

  function startWriterMonitor() {
    stopWriterMonitor();
    const writerRuntime = getWriterRuntime();
    if (!writerRuntime.enabled) return;
    if (writerRuntime.transportMode === "smb_queue") {
      return;
    }
    const intervalMs = writerRuntime.heartbeatIntervalMs || 3000;
    const runProbe = async () => {
      const runtime = getWriterRuntime();
      if (runtime.role === "master" && runtime.backupHost && runtime.backupPort) {
        try {
          await getJson(runtime.backupHost, runtime.backupPort, "/writer/health", 3000);
          updateConnectivityAndLog("backupReachable", true, { host: runtime.backupHost, port: runtime.backupPort });
        } catch (error) {
          updateConnectivityAndLog("backupReachable", false, {
            host: runtime.backupHost,
            port: runtime.backupPort,
            error: error?.message || "backup_unreachable"
          });
        }
        return;
      }
      if (runtime.role === "backup" && runtime.masterHost && runtime.masterPort) {
        try {
          await getJson(runtime.masterHost, runtime.masterPort, "/writer/health", 3000);
          updateConnectivityAndLog("masterReachable", true, { host: runtime.masterHost, port: runtime.masterPort });
        } catch (error) {
          updateConnectivityAndLog("masterReachable", false, {
            host: runtime.masterHost,
            port: runtime.masterPort,
            error: error?.message || "master_unreachable"
          });
        }
        return;
      }
      if (runtime.role === "client") {
        if (runtime.masterHost && runtime.masterPort) {
          try {
            await getJson(runtime.masterHost, runtime.masterPort, "/writer/health", 3000);
            updateConnectivityAndLog("masterReachable", true, { host: runtime.masterHost, port: runtime.masterPort });
          } catch (error) {
            updateConnectivityAndLog("masterReachable", false, {
              host: runtime.masterHost,
              port: runtime.masterPort,
              error: error?.message || "master_unreachable"
            });
          }
        }
        if (runtime.backupHost && runtime.backupPort) {
          try {
            await getJson(runtime.backupHost, runtime.backupPort, "/writer/health", 3000);
            updateConnectivityAndLog("backupReachable", true, { host: runtime.backupHost, port: runtime.backupPort });
          } catch (error) {
            updateConnectivityAndLog("backupReachable", false, {
              host: runtime.backupHost,
              port: runtime.backupPort,
              error: error?.message || "backup_unreachable"
            });
          }
        }
      }
    };
    void runProbe();
    writerMonitorTimer = setInterval(() => {
      void runProbe();
    }, intervalMs);
  }

  return {
    updateConnectivityAndLog,
    stopWriterMonitor,
    startWriterMonitor
  };
}

module.exports = {
  createWriterMonitorService
};
