/**
 * Planification et exécution de l'archivage main courante (rotation trimestrielle + archivage logique).
 * Délègue la logique métier à `main.js` via injection ; gère le mode file SMB lorsque le poste est client writer.
 *
 * Appelé depuis `main.js` (`createArchiveRunnerService`) : démarrage/arrêt du scheduler au cycle de vie app,
 * IPC `system:runArchiveNow` via `ipcSystemHandlers.js`, et tick périodique automatique.
 */

/**
 * Fabrique le service d'archivage planifié et manuel.
 *
 * @param {object} deps - Dépendances injectées par `main.js` (chemins queue, store, runtime writer/archivage).
 * @param {import('path')} deps.path - Résolution des chemins de requêtes file d'attente.
 * @param {() => object|null} deps.ensureWriterQueueDirs - Prépare les répertoires SMB incoming ; `null` si indisponible.
 * @param {(filePath: string, data: object) => void} deps.safeWriteJson - Écriture atomique JSON des requêtes queue.
 * @param {() => object} deps.getLocalSourceContext - Contexte source (poste, rôle) embarqué dans la requête.
 * @param {(trigger: string) => object} deps.ensureQuarterRotationIfNeeded - Rotation trimestrielle si échue.
 * @param {(opts: object) => object} deps.runLogicalArchiveNow - Archivage logique des entrées éligibles.
 * @param {() => { eligible: boolean, reason?: string }} deps.getAutoArchiveEligibility - Filtre scheduler (fenêtre, délai).
 * @param {() => import('../userStore')|null} deps.getUserStore - Accès BDD / audit ; `null` si non configurée.
 * @param {() => object} deps.writerRuntimeRef - État writer courant (`enabled`, `role`, `transportMode`).
 * @param {number} deps.archiveLogicalDelayDays - Délai en jours transmis au writer pour l'archivage logique.
 * @param {number} deps.archiveSchedulerIntervalMs - Intervalle entre deux ticks du scheduler.
 * @param {() => object} deps.getArchiveRuntime - État runtime archivage (sessions, jobs en attente, dernière erreur).
 * @param {(next: object) => void} deps.setArchiveRuntime - Mise à jour de l'état runtime archivage.
 * @returns {{
 *   enqueueArchiveRun: (opts?: object) => { queued: boolean, requestId: string },
 *   runArchiveCycle: (opts?: object) => Promise<object>,
 *   stopArchiveScheduler: () => void,
 *   startArchiveScheduler: () => void
 * }}
 */
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

  /**
   * Met l'archivage en file d'attente SMB pour exécution par le writer (poste client).
   *
   * Crée une requête `archive_run` dans `incomingDir`, incrémente `pendingJobs` et journalise l'audit
   * (action `MAIN_COURANTE_ARCHIVE_SKIP_WRITER_UNAVAILABLE` en mode `queued`).
   *
   * @param {object} [opts]
   * @param {string} [opts.trigger="scheduler"] - Origine : `scheduler` ou déclenchement manuel IPC.
   * @param {string} [opts.requesterUsername="system:archive"] - Acteur pour l'audit.
   * @returns {{ queued: true, requestId: string }}
   * @throws {Error} Si la queue SMB n'est pas disponible (`ensureWriterQueueDirs` retourne falsy).
   */
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

  /**
   * Exécute un cycle d'archivage (manuel ou scheduler) : rotation trimestrielle puis archivage logique,
   * ou mise en file si le poste est client writer en mode SMB.
   *
   * Replis sans erreur :
   * - `{ skipped: true, reason: "db_not_configured" }` si pas de store.
   * - `{ skipped: true, reason: "archive_session_active" }` si une session archive UI est active.
   * - Pour `trigger === "scheduler"`, skip si `getAutoArchiveEligibility()` n'est pas éligible.
   * - Client SMB : délègue à `enqueueArchiveRun` (retour `{ queued: true, requestId }`).
   *
   * @param {object} [opts]
   * @param {string} [opts.trigger="scheduler"]
   * @param {string} [opts.requesterUsername="system:archive"]
   * @returns {Promise<object>} Résultat du cycle (skip, queue, ou `{ rotation, logical }`).
   */
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

  /**
   * Arrête le timer du scheduler d'archivage (idempotent).
   *
   * @returns {void}
   */
  function stopArchiveScheduler() {
    if (archiveSchedulerTimer) {
      clearInterval(archiveSchedulerTimer);
      archiveSchedulerTimer = null;
    }
  }

  /**
   * Démarre le scheduler : un tick immédiat puis un intervalle `archiveSchedulerIntervalMs`.
   * Les erreurs de tick sont capturées et stockées dans `archiveRuntime.lastError`.
   *
   * @returns {void}
   */
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
