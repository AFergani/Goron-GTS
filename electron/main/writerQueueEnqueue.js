/**
 * Mise en file SMB des écritures côté client writer et attente courte de l'ACK (`ack/`).
 * Si l'ACK n'arrive pas en ~1,5 s, retourne un résultat optimiste `PENDING_QUEUE` et nettoie l'ACK en différé.
 *
 * Instancié dans `main.js` ; appelé depuis `ipcDomainHandlers` (main courante, intervention, rondes, gardiennage)
 * et `mainCourante:create` forward queue.
 */

/**
 * Fabrique le service d'enqueue SMB avec attente d'accusé de réception.
 *
 * @param {object} deps
 * @param {import('fs')} deps.fs - Détection fichier ACK, suppression après lecture.
 * @param {import('path')} deps.path - Chemins `incoming` / `ack`.
 * @param {() => object|null} deps.ensureWriterQueueDirs - Contexte queue SMB ou `null` si indisponible.
 * @param {() => object} deps.getLocalSourceContext - Métadonnées source dans le JSON requête.
 * @param {(filePath: string, data: object) => void} deps.safeWriteJson - Écriture atomique de la requête.
 * @param {(filePath: string) => object|null} deps.readJsonIfExists - Lecture ACK.
 * @param {(entry: object) => void} deps.appendWriterTransitLog - Journal transit (événements optionnels).
 * @param {(opts: object) => void} deps.startDeferredAckCleanup - Surveillance ACK tardif (`main.js`).
 * @param {(ms: number) => Promise<void>} deps.sleep - Pause entre polls ACK.
 * @param {(payload: object) => object} deps.omitSessionToken - Retire le jeton session du payload persisté.
 * @returns {{
 *   enqueueCreateAndWaitAck: (payload: object) => Promise<object>,
 *   enqueueUpdateOperatorAndWaitAck: (payload: object) => Promise<object>,
 *   enqueueManagerActionAndWaitAck: (payload: object) => Promise<object>,
 *   enqueueManagerReopenAndWaitAck: (payload: object) => Promise<object>,
 *   enqueueInterventionActionAndWaitAck: (action: string, payload: object) => Promise<object>
 * }}
 */
function createWriterQueueEnqueueService(deps) {
  const {
    fs,
    path,
    ensureWriterQueueDirs,
    getLocalSourceContext,
    safeWriteJson,
    readJsonIfExists,
    appendWriterTransitLog,
    startDeferredAckCleanup,
    sleep,
    omitSessionToken
  } = deps;

  /**
   * Génère ou réutilise un identifiant de corrélation requête / ACK.
   *
   * @param {object} payload
   * @returns {string}
   */
  function buildRequestId(payload) {
    return payload?.requestId || `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  /**
   * Écrit une requête JSON dans `incoming/`, attend l'ACK jusqu'à `immediateAckTimeoutMs` (1,5 s).
   *
   * @param {object} opts
   * @param {string} opts.action - Code exécuté par `writerQueueActions.executeQueuedAction`.
   * @param {object} opts.payload - Données métier (sans `sessionToken`).
   * @param {string|null} opts.enqueueEvent - Log à l'enqueue ; `null` pour ignorer.
   * @param {string|null} opts.ackEvent - Log ACK immédiat réussi.
   * @param {string|null} opts.deferredEvent - Log si passage en mode différé.
   * @param {string|null} opts.lateAckEvent - Log ACK tardif (cleanup différé).
   * @param {(payload: object) => object} opts.pendingResultFactory - Résultat optimiste si pas d'ACK à temps.
   * @returns {Promise<object>} `ack.result` ou retour du factory.
   * @throws {Error} Queue indisponible ou ACK avec `ok: false`.
   */
  async function enqueueAndWaitAck({
    action,
    payload,
    enqueueEvent,
    ackEvent,
    deferredEvent,
    lateAckEvent,
    pendingResultFactory
  }) {
    const queueCtx = ensureWriterQueueDirs();
    if (!queueCtx) throw new Error("Queue SMB indisponible.");
    const requestId = buildRequestId(payload);
    const requestPath = path.join(queueCtx.incomingDir, `${requestId}.json`);
    const ackPath = path.join(queueCtx.ackDir, `${requestId}.json`);
    const source = getLocalSourceContext();

    safeWriteJson(requestPath, {
      requestId,
      action,
      createdAt: new Date().toISOString(),
      source,
      payload: { ...omitSessionToken(payload), requestId }
    });

    if (enqueueEvent) {
      appendWriterTransitLog({ event: enqueueEvent, requestId, source, mode: "smb_queue" });
    }

    const immediateAckTimeoutMs = 1500;
    const startedAt = Date.now();
    while (Date.now() - startedAt <= immediateAckTimeoutMs) {
      if (fs.existsSync(ackPath)) {
        const ack = readJsonIfExists(ackPath) || {};
        try {
          fs.unlinkSync(ackPath);
        } catch {}
        if (!ack.ok) throw new Error(ack.error || "Erreur de traitement writer.");
        if (ackEvent) {
          appendWriterTransitLog({
            event: ackEvent,
            requestId,
            source,
            writerNode: ack.writerNode || null,
            mode: "smb_queue",
            result: "SUCCESS"
          });
        }
        return ack.result;
      }
      await sleep(400);
    }

    if (deferredEvent) {
      appendWriterTransitLog({
        event: deferredEvent,
        requestId,
        source,
        mode: "smb_queue",
        reason: "ack_not_received_immediately"
      });
    }
    startDeferredAckCleanup({
      ackPath,
      requestId,
      source,
      lateAckEvent
    });
    return pendingResultFactory(payload);
  }

  /**
   * Enqueue création main courante (`action: create`) avec événements de log dédiés.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function enqueueCreateAndWaitAck(payload) {
    return enqueueAndWaitAck({
      action: "create",
      payload,
      enqueueEvent: "mainCourante_create_queue_enqueue",
      ackEvent: "mainCourante_create_queue_ack",
      deferredEvent: "mainCourante_create_queue_deferred",
      lateAckEvent: "mainCourante_create_queue_late_ack",
      pendingResultFactory: (currentPayload) => {
        const nowIso = new Date().toISOString();
        return {
          id: currentPayload.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          operatorName: String(currentPayload.operatorName || "").trim() || "Inconnu",
          siteId: currentPayload.siteId || null,
          siteDisplay: String(currentPayload.siteDisplay || "").trim(),
          anomalyTypeId: String(currentPayload.anomalyTypeId || "").trim(),
          anomalyTypeLabel: String(currentPayload.anomalyTypeLabel || "").trim(),
          information: String(currentPayload.information || "").trim(),
          status: "EN_ATTENTE",
          syncState: "PENDING_QUEUE"
        };
      }
    });
  }

  /**
   * Enqueue mise à jour opérateur main courante.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function enqueueUpdateOperatorAndWaitAck(payload) {
    return enqueueAndWaitAck({
      action: "update_operator",
      payload,
      enqueueEvent: "mainCourante_update_queue_enqueue",
      ackEvent: "mainCourante_update_queue_ack",
      deferredEvent: "mainCourante_update_queue_deferred",
      lateAckEvent: "mainCourante_update_queue_late_ack",
      pendingResultFactory: (currentPayload) => ({
        id: currentPayload.id,
        updatedAt: new Date().toISOString(),
        siteId: currentPayload.siteId || null,
        siteDisplay: String(currentPayload.siteDisplay || "").trim(),
        anomalyTypeId: String(currentPayload.anomalyTypeId || "").trim(),
        anomalyTypeLabel: String(currentPayload.anomalyTypeLabel || "").trim(),
        information: String(currentPayload.information || "").trim(),
        syncState: "PENDING_QUEUE"
      })
    });
  }

  /**
   * Enqueue action manager (clôture / décision) main courante.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function enqueueManagerActionAndWaitAck(payload) {
    return enqueueAndWaitAck({
      action: "manager_action",
      payload,
      enqueueEvent: "mainCourante_manager_queue_enqueue",
      ackEvent: "mainCourante_manager_queue_ack",
      deferredEvent: "mainCourante_manager_queue_deferred",
      lateAckEvent: "mainCourante_manager_queue_late_ack",
      pendingResultFactory: (currentPayload) => ({
        id: currentPayload.id,
        updatedAt: new Date().toISOString(),
        managerName: String(currentPayload.managerName || "").trim() || null,
        managerObservation: String(currentPayload.managerObservation || "").trim(),
        decision: currentPayload.decision,
        syncState: "PENDING_QUEUE"
      })
    });
  }

  /**
   * Enqueue réouverture manager main courante.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function enqueueManagerReopenAndWaitAck(payload) {
    return enqueueAndWaitAck({
      action: "manager_reopen",
      payload,
      enqueueEvent: "mainCourante_reopen_queue_enqueue",
      ackEvent: "mainCourante_reopen_queue_ack",
      deferredEvent: "mainCourante_reopen_queue_deferred",
      lateAckEvent: "mainCourante_reopen_queue_late_ack",
      pendingResultFactory: (currentPayload) => ({
        id: currentPayload.id,
        updatedAt: new Date().toISOString(),
        status: "EN_COURS",
        managerName: String(currentPayload.managerName || "").trim() || null,
        closedAt: null,
        syncState: "PENDING_QUEUE"
      })
    });
  }

  /**
   * Enqueue générique intervention / rondes / gardiennage (codes alignés `writerQueueActions`).
   *
   * Logs enqueue/ack/deferred désactivés (`null`) ; seul `intervention_queue_late_ack` en différé.
   * Factory enrichi pour `intervention_create`, `ronde_create`, `gardiennage_create`.
   *
   * @param {string} action - Ex. `intervention_update`, `ronde_status`, `gardiennage_close`.
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function enqueueInterventionActionAndWaitAck(action, payload) {
    const buildPendingInterventionResult = (currentPayload) => {
      const nowIso = new Date().toISOString();
      if (action === "intervention_create") {
        const requestDate = String(currentPayload.requestDate || "").trim();
        const requestTime = String(currentPayload.requestTime || "").trim();
        return {
          id: currentPayload.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          siteId: currentPayload.siteId || null,
          siteDisplay: String(currentPayload.siteDisplay || "").trim(),
          requestReason: String(currentPayload.requestReason || "").trim(),
          requestDate,
          requestTime,
          arrivalDate: String(currentPayload.arrivalDate || "").trim() || null,
          arrivalTime: String(currentPayload.arrivalTime || "").trim(),
          departureTime: String(currentPayload.departureTime || "").trim(),
          departureDate: String(currentPayload.departureDate || "").trim() || requestDate || null,
          delayMinutes: null,
          workOrderNumber: String(currentPayload.workOrderNumber || "").trim(),
          report: String(currentPayload.report || "").trim(),
          intervenantId: currentPayload.intervenantId || null,
          intervenantName: String(currentPayload.intervenantName || "").trim(),
          status: "EN_COURS",
          billingStatus: "FACTURABLE",
          billingReason: "",
          cancellationReason: "",
          closedAt: null,
          archivedAt: null,
          exportExtraValues: currentPayload.exportExtraValues && typeof currentPayload.exportExtraValues === "object"
            ? currentPayload.exportExtraValues
            : {},
          syncState: "PENDING_QUEUE"
        };
      }
      if (action === "ronde_create") {
        return {
          id: currentPayload.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          source: currentPayload.source || "URGENCE",
          originInterventionId: currentPayload.originInterventionId || null,
          siteId: currentPayload.siteId || null,
          siteDisplay: String(currentPayload.siteDisplay || "").trim(),
          requestDate: String(currentPayload.requestDate || "").trim(),
          motifTypeId: String(currentPayload.motifTypeId || "").trim() || null,
          motifTypeLabel: "",
          motifRequiresFreeText: false,
          motifDetail: String(currentPayload.motifDetail || "").trim(),
          horairesDemandeObs: String(currentPayload.horairesDemandeObs || "").trim(),
          originKind: currentPayload.originKind || "AUTRE",
          originDetail: String(currentPayload.originDetail || "").trim(),
          intervenantId: currentPayload.intervenantId || null,
          intervenantName: String(currentPayload.intervenantName || "").trim(),
          arrivalTime: String(currentPayload.arrivalTime || "").trim(),
          departureTime: String(currentPayload.departureTime || "").trim(),
          durationMinutes: null,
          workOrderNumber: String(currentPayload.workOrderNumber || "").trim(),
          report: String(currentPayload.report || "").trim(),
          status: currentPayload.initialStatus || "EN_COURS",
          cancellationReason: String(currentPayload.cancellationReason || "").trim(),
          closedAt: null,
          plannedProfileId: currentPayload.plannedProfileId || null,
          plannedRoundKind: currentPayload.plannedRoundKind || null,
          plannedSlotKey: currentPayload.plannedSlotKey || null,
          closureCustomValues: currentPayload.closureCustomValues && typeof currentPayload.closureCustomValues === "object"
            ? currentPayload.closureCustomValues
            : {},
          requestPlanningSnapshot: null,
          requestBatchId: currentPayload.requestBatchId || null,
          requestPlanningSnapshotJson: currentPayload.requestPlanningSnapshotJson || null,
          syncState: "PENDING_QUEUE"
        };
      }
      if (action === "gardiennage_create") {
        return {
          id: currentPayload.id,
          createdAt: nowIso,
          updatedAt: nowIso,
          siteId: currentPayload.siteId || null,
          siteDisplay: String(currentPayload.siteDisplay || "").trim(),
          startTime: String(currentPayload.startTime || "").trim(),
          endTime: String(currentPayload.endTime || "").trim(),
          crossesMidnight: Boolean(currentPayload.crossesMidnight),
          recurrenceStartDate: String(currentPayload.recurrenceStartDate || "").trim(),
          recurrenceEndDate: String(currentPayload.recurrenceEndDate || "").trim(),
          isPonctuel: Boolean(currentPayload.isPonctuel),
          intervenantId: currentPayload.intervenantId || null,
          intervenantName: String(currentPayload.intervenantName || "").trim(),
          notes: String(currentPayload.notes || "").trim(),
          status: "PLANIFIE",
          linkedInterventionId: currentPayload.linkedInterventionId || null,
          linkedRondeId: currentPayload.linkedRondeId || null,
          closureReport: "",
          actualStartTime: "",
          actualEndTime: "",
          workOrderNumber: "",
          cancellationReason: "",
          planningBatchId: null,
          planningSnapshot: currentPayload.planningSnapshot || null,
          planningSlotStart: "",
          planningSlotEnd: "",
          syncState: "PENDING_QUEUE"
        };
      }
      return {
        id: currentPayload.id,
        updatedAt: new Date().toISOString(),
        syncState: "PENDING_QUEUE"
      };
    };

    return enqueueAndWaitAck({
      action,
      payload,
      enqueueEvent: null,
      ackEvent: null,
      deferredEvent: null,
      lateAckEvent: "intervention_queue_late_ack",
      pendingResultFactory: buildPendingInterventionResult
    });
  }

  return {
    enqueueCreateAndWaitAck,
    enqueueUpdateOperatorAndWaitAck,
    enqueueManagerActionAndWaitAck,
    enqueueManagerReopenAndWaitAck,
    enqueueInterventionActionAndWaitAck
  };
}

module.exports = {
  createWriterQueueEnqueueService
};
