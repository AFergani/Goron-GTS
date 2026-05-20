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

  function stopWriterQueueWorker() {
    if (writerQueueTimer) {
      clearInterval(writerQueueTimer);
      writerQueueTimer = null;
    }
  }

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
