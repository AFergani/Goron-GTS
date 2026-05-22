/**
 * Worker périodique de la file SMB writer : heartbeats, nettoyage, traitement des requêtes `incoming/`.
 * Seul le Master traite en continu ; le Backup ne traite que si le heartbeat Master est périmé (failover file).
 *
 * Instancié en lazy dans `main.js` ; démarré / arrêté par `writerRuntime.js` en `transportMode === "smb_queue"`.
 * Délègue l'exécution métier à `writerQueueActions.executeQueuedAction`.
 */

/**
 * Fabrique le worker de file d'attente SMB.
 *
 * @param {object} deps - Injections depuis `main.js` (`getWriterQueueWorkerService`).
 * @param {import('fs')} deps.fs - Listing, rename, unlink des fichiers queue.
 * @param {import('path')} deps.path
 * @param {(filePath: string) => object|null} deps.readJsonIfExists
 * @param {() => void} deps.ensureStore
 * @param {(filePath: string, data: object) => void} deps.safeWriteJson - Écriture ACK dans `ack/`.
 * @param {() => object} deps.getLocalSourceContext
 * @param {(entry: object) => void} deps.appendWriterTransitLog
 * @param {Function} deps.executeQueuedAction - Routeur `writerQueueActions` (+ `userStore` injecté par main).
 * @param {(trigger: string) => object} deps.ensureQuarterRotationIfNeeded
 * @param {(opts: object) => object} deps.runLogicalArchiveNow
 * @param {() => object} deps.getArchiveRuntime
 * @param {(next: object) => void} deps.setArchiveRuntime - Décrément `pendingJobs` après `archive_run`.
 * @param {() => object|null} deps.ensureWriterQueueDirs
 * @param {(queueCtx: object) => void} deps.cleanupQueueArtifacts
 * @param {(queueCtx: object) => void} deps.updateSmbConnectivity - Heartbeats → `connectivity` UI.
 * @param {(filePath: string, windowMs: number) => boolean} deps.isHeartbeatFresh
 * @param {() => object} deps.getWriterRuntime
 * @returns {{ startWriterQueueWorker: () => void, stopWriterQueueWorker: () => void }}
 */
function createWriterQueueWorkerService(deps) {
  const {
    fs,
    path,
    readJsonIfExists,
    ensureStore,
    safeWriteJson,
    getLocalSourceContext,
    appendWriterTransitLog,
    executeQueuedAction,
    ensureQuarterRotationIfNeeded,
    runLogicalArchiveNow,
    getArchiveRuntime,
    setArchiveRuntime,
    ensureWriterQueueDirs,
    cleanupQueueArtifacts,
    updateSmbConnectivity,
    isHeartbeatFresh,
    getWriterRuntime
  } = deps;

  let writerQueueTimer = null;
  let writerQueueBusy = false;

  /**
   * Traite la plus ancienne requête JSON de `incoming/` (une par appel).
   *
   * Déplace vers `processing/`, exécute l'action, écrit l'ACK (`ok` / erreur), journalise, supprime le fichier processing.
   *
   * @param {object} queueCtx - Répertoires `incomingDir`, `processingDir`, `ackDir`, heartbeats.
   * @returns {Promise<void>}
   */
  async function processOneQueuedRequest(queueCtx) {
    const files = fs
      .readdirSync(queueCtx.incomingDir)
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
    if (!files.length) return;
    const nextFile = files[0];
    const incomingPath = path.join(queueCtx.incomingDir, nextFile);
    const processingPath = path.join(queueCtx.processingDir, nextFile);
    try {
      fs.renameSync(incomingPath, processingPath);
    } catch {
      return;
    }

    let request = null;
    let action = "create";
    try {
      request = readJsonIfExists(processingPath) || {};
      ensureStore();
      const requestId = request?.requestId || path.basename(nextFile, ".json");
      action = request?.action || "create";
      const payload = request?.payload || {};
      const source = request?.source || {};
      const result = await executeQueuedAction(action, payload, {
        ensureQuarterRotationIfNeeded,
        runLogicalArchiveNow,
        onArchiveRunProcessed: () => {
          const runtime = getArchiveRuntime();
          setArchiveRuntime({ ...runtime, pendingJobs: Math.max(0, runtime.pendingJobs - 1) });
        }
      });
      safeWriteJson(path.join(queueCtx.ackDir, `${requestId}.json`), {
        ok: true,
        requestId,
        result,
        writerNode: getLocalSourceContext(),
        processedAt: new Date().toISOString()
      });
      appendWriterTransitLog({
        event: action === "create" ? "writer_received_create" : "writer_received_update",
        requestId,
        action,
        source,
        writerNode: getLocalSourceContext(),
        mode: "smb_queue",
        result: "SUCCESS",
        entryId: result?.id || payload?.id || null
      });
    } catch (error) {
      const requestId = request?.requestId || path.basename(nextFile, ".json");
      safeWriteJson(path.join(queueCtx.ackDir, `${requestId}.json`), {
        ok: false,
        requestId,
        error: error?.message || "Writer queue error",
        writerNode: getLocalSourceContext(),
        processedAt: new Date().toISOString()
      });
      appendWriterTransitLog({
        event: action === "create" ? "writer_received_create" : "writer_received_update",
        requestId,
        action,
        writerNode: getLocalSourceContext(),
        mode: "smb_queue",
        result: "ERROR",
        error: error?.message || "Writer queue error"
      });
    } finally {
      try {
        fs.unlinkSync(processingPath);
      } catch {}
    }
  }

  /**
   * Arrête le timer du worker (idempotent).
   *
   * @returns {void}
   */
  function stopWriterQueueWorker() {
    if (writerQueueTimer) {
      clearInterval(writerQueueTimer);
      writerQueueTimer = null;
    }
  }

  /**
   * Démarre le worker SMB : tick ≈ moitié de `heartbeatIntervalMs`, mutex `writerQueueBusy`.
   *
   * Chaque tick : heartbeat local, cleanup, connectivité SMB, puis au plus une requête traitée
   * (master toujours ; backup si master heartbeat expiré).
   *
   * @returns {void} No-op si writer désactivé ou hors mode `smb_queue`.
   */
  function startWriterQueueWorker() {
    stopWriterQueueWorker();
    const writerRuntime = getWriterRuntime();
    if (!writerRuntime.enabled || writerRuntime.transportMode !== "smb_queue") return;
    const tickMs = Math.max(1000, Math.floor((writerRuntime.heartbeatIntervalMs || 3000) / 2));
    const runTick = async () => {
      if (writerQueueBusy) return;
      writerQueueBusy = true;
      try {
        const queueCtx = ensureWriterQueueDirs();
        if (!queueCtx) return;
        const currentRuntime = getWriterRuntime();
        const heartbeatFile =
          currentRuntime.role === "master"
            ? queueCtx.heartbeatMasterFile
            : currentRuntime.role === "backup"
              ? queueCtx.heartbeatBackupFile
              : null;
        if (heartbeatFile) {
          safeWriteJson(heartbeatFile, {
            role: currentRuntime.role,
            updatedAt: new Date().toISOString(),
            node: getLocalSourceContext()
          });
        }
        cleanupQueueArtifacts(queueCtx);
        updateSmbConnectivity(queueCtx);
        if (currentRuntime.role === "master") {
          await processOneQueuedRequest(queueCtx);
        } else if (currentRuntime.role === "backup") {
          const freshnessWindowMs = Math.max((currentRuntime.heartbeatIntervalMs || 3000) * 3, 6000);
          const masterFresh = isHeartbeatFresh(queueCtx.heartbeatMasterFile, freshnessWindowMs);
          if (!masterFresh) {
            await processOneQueuedRequest(queueCtx);
          }
        }
      } finally {
        writerQueueBusy = false;
      }
    };
    void runTick();
    writerQueueTimer = setInterval(() => {
      void runTick();
    }, tickMs);
  }

  return {
    startWriterQueueWorker,
    stopWriterQueueWorker
  };
}

module.exports = {
  createWriterQueueWorkerService
};
