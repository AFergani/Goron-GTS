/**
 * Sonde périodique de disponibilité des pairs writer (GET `/writer/health`) en mode HTTP.
 * Met à jour `writerRuntime.connectivity` et journalise les changements d'état (`writer_peer_status_changed`).
 *
 * Désactivé en `transportMode === "smb_queue"` (connectivité dérivée des heartbeats SMB dans `main.js`).
 * Piloté par `writerRuntime.js` via `startWriterMonitor` / `stopWriterMonitor`.
 */

/**
 * Fabrique le moniteur de connectivité inter-nœuds writer.
 *
 * @param {object} deps
 * @param {(entry: object) => void} deps.appendWriterTransitLog - Log transit lors d'un changement de reachability.
 * @param {() => object} deps.getLocalSourceContext - Contexte poste local pour les entrées de log.
 * @param {(host: string, port: number, path: string, timeoutMs: number) => Promise<object>} deps.getJson - Requête HTTP health.
 * @param {() => object} deps.getWriterRuntime - État writer (`role`, hôtes, ports, `connectivity`, `heartbeatIntervalMs`).
 * @param {(next: object) => void} deps.setWriterRuntime - Mise à jour de `connectivity`.
 * @returns {{
 *   updateConnectivityAndLog: (key: string, reachable: boolean, details?: object) => void,
 *   stopWriterMonitor: () => void,
 *   startWriterMonitor: () => void
 * }}
 */
function createWriterMonitorService(deps) {
  const {
    appendWriterTransitLog,
    getLocalSourceContext,
    getJson,
    getWriterRuntime,
    setWriterRuntime
  } = deps;

  let writerMonitorTimer = null;

  /**
   * Met à jour un indicateur de connectivité et logue uniquement si la valeur a changé.
   *
   * @param {"masterReachable"|"backupReachable"} key - Clé dans `writerRuntime.connectivity`.
   * @param {boolean} reachable - Pair joignable ou non.
   * @param {object} [details] - Contexte diagnostic (host, port, erreur, mode smb_queue, etc.).
   * @returns {void}
   */
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

  /**
   * Arrête l'intervalle de sonde HTTP (idempotent).
   *
   * @returns {void}
   */
  function stopWriterMonitor() {
    if (writerMonitorTimer) {
      clearInterval(writerMonitorTimer);
      writerMonitorTimer = null;
    }
  }

  /**
   * Démarre la sonde selon le rôle writer : master → backup, backup → master, client → les deux.
   *
   * No-op si writer désactivé ou mode `smb_queue`. Intervalle : `heartbeatIntervalMs` (défaut 3000 ms).
   * Premier tick immédiat puis `setInterval`.
   *
   * @returns {void}
   */
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
