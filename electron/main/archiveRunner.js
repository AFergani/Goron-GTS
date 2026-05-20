function createArchiveRunnerService(deps) {
  const {
    path,
    ensureWriterQueueDirs,
    safeWriteJson,
    getLocalSourceContext,
    ensureQuarterRotationIfNeeded,
    runLogicalArchiveNow,
    getAutoArchiveEligibility,
    getUserStore,
    writerRuntimeRef,
    archiveLogicalDelayDays,
    archiveSchedulerIntervalMs,
    getArchiveRuntime,
    setArchiveRuntime
  } = deps;

  let archiveSchedulerTimer = null;

  function enqueueArchiveRun({ trigger = "scheduler", requesterUsername = "system:archive" } = {}) {
    const queueCtx = ensureWriterQueueDirs();
    if (!queueCtx) throw new Error("Queue SMB indisponible.");
    const requestId = `archive-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const requestPath = path.join(queueCtx.incomingDir, `${requestId}.json`);
    safeWriteJson(requestPath, {
      requestId,
      action: "archive_run",
      createdAt: new Date().toISOString(),
      source: getLocalSourceContext(),
      payload: {
        trigger,
        requesterUsername,
        delayDays: archiveLogicalDelayDays
      }
    });
    const runtime = getArchiveRuntime();
    setArchiveRuntime({ ...runtime, pendingJobs: runtime.pendingJobs + 1 });
    const userStore = getUserStore();
    userStore?.logAudit({
      actorUsername: requesterUsername,
      action: "MAIN_COURANTE_ARCHIVE_SKIP_WRITER_UNAVAILABLE",
      details: {
        trigger,
        mode: "queued",
        requestId
      }
    });
    return { queued: true, requestId };
  }

  async function runArchiveCycle({ trigger = "scheduler", requesterUsername = "system:archive" } = {}) {
    const userStore = getUserStore();
    if (!userStore) {
      return { skipped: true, reason: "db_not_configured" };
    }
    if (getArchiveRuntime().archiveSession?.active) {
      return { skipped: true, reason: "archive_session_active" };
    }
    if (trigger === "scheduler") {
      const autoEligibility = getAutoArchiveEligibility();
      if (!autoEligibility.eligible) {
        return {
          skipped: true,
          reason: autoEligibility.reason,
          autoEligibility
        };
      }
    }
    const writerRuntime = writerRuntimeRef();
    if (writerRuntime.enabled && writerRuntime.role === "client" && writerRuntime.transportMode === "smb_queue") {
      return enqueueArchiveRun({ trigger, requesterUsername });
    }
    const rotation = ensureQuarterRotationIfNeeded(trigger);
    const logical = runLogicalArchiveNow({ trigger, requesterUsername });
    return { rotation, logical };
  }

  function stopArchiveScheduler() {
    if (archiveSchedulerTimer) {
      clearInterval(archiveSchedulerTimer);
      archiveSchedulerTimer = null;
    }
  }

  function startArchiveScheduler() {
    stopArchiveScheduler();
    const tick = async () => {
      try {
        await runArchiveCycle({ trigger: "scheduler", requesterUsername: "system:archive" });
      } catch (error) {
        const runtime = getArchiveRuntime();
        setArchiveRuntime({
          ...runtime,
          lastError: error?.message || "archive_scheduler_error"
        });
      }
    };
    void tick();
    archiveSchedulerTimer = setInterval(() => {
      void tick();
    }, archiveSchedulerIntervalMs);
  }

  return {
    enqueueArchiveRun,
    runArchiveCycle,
    stopArchiveScheduler,
    startArchiveScheduler
  };
}

module.exports = {
  createArchiveRunnerService
};
