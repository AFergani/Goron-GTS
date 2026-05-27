/**
 * Enregistrement des canaux IPC métier authentifiés (`users:*`, `data:*`, `mainCourante:*`, etc.).
 * Délègue la logique au `UserStore` ; bascule vers la file SMB writer pour les écritures client
 * (interventions, rondes, gardiennage, parties main courante opérateur/manager).
 *
 * Appelé au démarrage via `registerDomainIpcHandlers` dans `main.js`.
 * Exception : `mainCourante:create` reste dans `main.js` (writer HTTP / queue / logs transit).
 * Miroir côté renderer : `electron/preload.js` et `gtsApiClient`.
 */

/**
 * Enregistre l'ensemble des handlers IPC domaine.
 *
 * @param {object} deps - Injections depuis `main.js`.
 * @param {(channel: string, handler: Function) => void} deps.handleIpcAuth - Wrapper IPC avec session valide.
 * @param {() => void} deps.ensureStore - Vérifie que `userStore` est initialisé.
 * @param {() => import('../userStore')} deps.getUserStore - Store métier SQLite.
 * @param {() => object} deps.getWriterRuntime - État writer (`enabled`, `role`, `transportMode`).
 * @param {(payload: object) => Promise<object>} deps.enqueueUpdateOperatorAndWaitAck - File main courante opérateur.
 * @param {(payload: object) => Promise<object>} deps.enqueueManagerActionAndWaitAck - File action manager main courante.
 * @param {(payload: object) => Promise<object>} deps.enqueueManagerReopenAndWaitAck - File réouverture main courante.
 * @param {(action: string, payload: object) => Promise<object>} deps.enqueueInterventionActionAndWaitAck - File générique intervention/ronde/gardiennage.
 * @param {() => Set<string>|Iterable<string>} deps.getActiveUsernames - Sessions actives (canal `users:getActiveSessions`).
 * @returns {void}
 */
function registerDomainIpcHandlers(deps) {
  const {
    handleIpcAuth,
    ensureStore,
    getUserStore,
    getWriterRuntime,
    enqueueUpdateOperatorAndWaitAck,
    enqueueManagerActionAndWaitAck,
    enqueueManagerReopenAndWaitAck,
    enqueueInterventionActionAndWaitAck,
    getActiveUsernames
  } = deps;

  /**
   * Enregistre un canal qui appelle directement une méthode homonyme du `UserStore`.
   *
   * @param {string} channel - Nom du canal IPC (ex. `data:sites:list`).
   * @param {string} methodName - Méthode `getUserStore()[methodName](payload)`.
   */
  const registerStorePassthrough = (channel, methodName) => {
    handleIpcAuth(channel, (payload) => {
      ensureStore();
      return getUserStore()[methodName](payload);
    });
  };

  /**
   * Enregistre un canal d'écriture : exécution locale ou mise en file SMB si poste client writer.
   *
   * @param {string} channel - Canal IPC.
   * @param {string} storeMethodName - Méthode store en mode master/backup ou client hors queue.
   * @param {string} queueActionName - Action transmise à `enqueueInterventionActionAndWaitAck`.
   */
  const registerQueueAware = (channel, storeMethodName, queueActionName) => {
    handleIpcAuth(channel, (payload) => {
      ensureStore();
      const writerRuntime = getWriterRuntime();
      if (writerRuntime.enabled && writerRuntime.role === "client" && writerRuntime.transportMode === "smb_queue") {
        return enqueueInterventionActionAndWaitAck(queueActionName, payload);
      }
      return getUserStore()[storeMethodName](payload);
    });
  };

  // Users / audit / preferences
  registerStorePassthrough("users:list", "listUsers");
  registerStorePassthrough("users:create", "createUser");
  registerStorePassthrough("users:updateProfile", "updateUserProfile");
  registerStorePassthrough("users:deactivate", "deactivateUser");
  registerStorePassthrough("users:reactivate", "reactivateUser");
  registerStorePassthrough("users:unlock", "unlockUser");

  /**
   * Canal `users:getActiveSessions` — noms d'utilisateurs ayant une session ouverte sur ce poste.
   */
  handleIpcAuth("users:getActiveSessions", () => {
    const activeUsernames = getActiveUsernames();
    return { activeUsernames: Array.from(activeUsernames) };
  });

  registerStorePassthrough("audit:list", "listAuditLogs");
  registerStorePassthrough("audit:metadata", "getAuditMetadata");
  registerStorePassthrough("audit:bulkImport", "logBulkImportAudit");
  registerStorePassthrough("preferences:get", "getUserPreferences");
  registerStorePassthrough("preferences:set", "setUserPreferences");

  // Data referentials
  registerStorePassthrough("data:sites:list", "listSites");
  registerStorePassthrough("data:sites:create", "createSite");
  registerStorePassthrough("data:sites:update", "updateSite");
  registerStorePassthrough("data:sites:delete", "deleteSite");
  registerStorePassthrough("data:intervenants:list", "listIntervenants");
  registerStorePassthrough("data:intervenants:create", "createIntervenant");
  registerStorePassthrough("data:intervenants:update", "updateIntervenant");
  registerStorePassthrough("data:intervenants:delete", "deleteIntervenant");
  registerStorePassthrough("data:types:list", "listAnomalyTypes");
  registerStorePassthrough("data:types:create", "createAnomalyType");
  registerStorePassthrough("data:types:update", "updateAnomalyType");
  registerStorePassthrough("data:types:delete", "deleteAnomalyType");
  registerStorePassthrough("data:holidays:list", "listHolidays");
  registerStorePassthrough("data:holidays:create", "createHoliday");
  registerStorePassthrough("data:holidays:update", "updateHoliday");
  registerStorePassthrough("data:holidays:delete", "deleteHoliday");
  registerStorePassthrough("data:rondeMotifs:list", "listRondeMotifTypes");
  registerStorePassthrough("data:rondeMotifs:create", "createRondeMotifType");
  registerStorePassthrough("data:rondeMotifs:update", "updateRondeMotifType");
  registerStorePassthrough("data:rondeMotifs:delete", "deleteRondeMotifType");
  registerStorePassthrough("data:rondePlannedProfiles:list", "listRondePlannedProfiles");
  registerStorePassthrough("data:rondePlannedProfiles:upsert", "upsertRondePlannedProfile");
  registerStorePassthrough("data:rondePlannedProfiles:delete", "deleteRondePlannedProfile");
  registerStorePassthrough("data:rondePlannedProfiles:setPlanningEnd", "setRondePlannedProfilePlanningEnd");
  registerStorePassthrough("data:rondePlannedProfiles:setValidated", "setRondePlannedProfileValidated");
  registerStorePassthrough("data:interventionWordExtraFields:list", "listInterventionWordExtraFields");
  registerStorePassthrough("data:formVariables:list", "listFormVariables");
  registerStorePassthrough("data:formVariables:save", "saveFormVariables");

  // Fransor
  registerStorePassthrough("fransor:responsables:list", "listFransorResponsables");
  registerStorePassthrough("fransor:responsables:create", "createFransorResponsable");
  registerStorePassthrough("fransor:responsables:update", "updateFransorResponsable");
  registerStorePassthrough("fransor:responsables:delete", "deleteFransorResponsable");
  registerStorePassthrough("fransor:closures:list", "listFransorClosures");
  registerStorePassthrough("fransor:closures:upsert", "upsertFransorClosure");
  registerStorePassthrough("fransor:closures:delete", "deleteFransorClosure");
  registerStorePassthrough("fransor:entries:listByMonth", "listFransorEntriesByMonth");
  registerStorePassthrough("fransor:entries:upsert", "upsertFransorEntry");
  registerStorePassthrough("fransor:recap:listByMonth", "listFransorMonthlyRecap");

  // Main courante (hors create, traité dans main.js)
  registerStorePassthrough("mainCourante:list", "listMainCouranteEntries");
  registerStorePassthrough("mainCourante:getUnconsultedCount", "getMainCouranteUnconsultedCount");
  registerStorePassthrough("mainCourante:markConsulted", "markMainCouranteEntryConsulted");

  /** Canal `mainCourante:updateOperator` — file SMB client ou `updateMainCouranteEntryOperator` local. */
  handleIpcAuth("mainCourante:updateOperator", (payload) => {
    ensureStore();
    const writerRuntime = getWriterRuntime();
    if (writerRuntime.enabled && writerRuntime.role === "client" && writerRuntime.transportMode === "smb_queue") {
      return enqueueUpdateOperatorAndWaitAck(payload);
    }
    return getUserStore().updateMainCouranteEntryOperator(payload);
  });

  /** Canal `mainCourante:applyManager` — file SMB ou action manager locale. */
  handleIpcAuth("mainCourante:applyManager", (payload) => {
    ensureStore();
    const writerRuntime = getWriterRuntime();
    if (writerRuntime.enabled && writerRuntime.role === "client" && writerRuntime.transportMode === "smb_queue") {
      return enqueueManagerActionAndWaitAck(payload);
    }
    return getUserStore().applyMainCouranteManagerAction(payload);
  });

  /** Canal `mainCourante:reopen` — file SMB ou réouverture locale. */
  handleIpcAuth("mainCourante:reopen", (payload) => {
    ensureStore();
    const writerRuntime = getWriterRuntime();
    if (writerRuntime.enabled && writerRuntime.role === "client" && writerRuntime.transportMode === "smb_queue") {
      return enqueueManagerReopenAndWaitAck(payload);
    }
    return getUserStore().reopenMainCouranteEntry(payload);
  });

  // Intervention
  registerStorePassthrough("intervention:list", "listInterventions");
  registerStorePassthrough("intervention:getOpenCount", "getInterventionOpenCount");
  registerQueueAware("intervention:create", "createInterventionEntry", "intervention_create");
  registerQueueAware("intervention:update", "updateInterventionEntry", "intervention_update");
  registerQueueAware("intervention:setStatus", "setInterventionStatus", "intervention_status");
  registerQueueAware("intervention:setBillingStatus", "setInterventionBillingStatus", "intervention_billing");
  registerStorePassthrough("intervention:pendingSites:list", "listPendingInterventionSites");
  registerQueueAware("intervention:pendingSites:create", "createPendingInterventionSite", "intervention_pending_site");
  registerQueueAware("intervention:pendingSites:resolve", "resolvePendingInterventionSite", "intervention_pending_site_resolve");
  registerQueueAware("intervention:pendingSites:delete", "deletePendingInterventionSite", "intervention_pending_site_delete");
  registerStorePassthrough("intervention:pendingIntervenants:list", "listPendingInterventionIntervenants");
  registerQueueAware(
    "intervention:pendingIntervenants:create",
    "createPendingInterventionIntervenant",
    "intervention_pending_intervenant"
  );
  registerQueueAware(
    "intervention:pendingIntervenants:resolve",
    "resolvePendingInterventionIntervenant",
    "intervention_pending_intervenant_resolve"
  );
  registerQueueAware(
    "intervention:pendingIntervenants:delete",
    "deletePendingInterventionIntervenant",
    "intervention_pending_intervenant_delete"
  );

  // Rondes
  registerStorePassthrough("ronde:list", "listRondes");
  registerQueueAware("ronde:create", "createRondeEntry", "ronde_create");
  registerQueueAware("ronde:update", "updateRondeEntry", "ronde_update");
  registerQueueAware("ronde:setStatus", "setRondeStatus", "ronde_status");
  registerQueueAware("ronde:batchUpdate", "updateRondeBatchSharedFields", "ronde_batch_update");
  registerQueueAware("ronde:batchCancel", "bulkCancelRondeBatch", "ronde_batch_cancel");
  registerQueueAware("ronde:batchDelete", "bulkDeleteRondeBatch", "ronde_batch_delete");

  // Gardiennage
  registerStorePassthrough("gardiennage:list", "listGardiennages");
  registerQueueAware("gardiennage:create", "createGardiennage", "gardiennage_create");
  registerQueueAware("gardiennage:update", "updateGardiennage", "gardiennage_update");
  registerQueueAware("gardiennage:setStatus", "setGardiennageStatus", "gardiennage_status");
  registerQueueAware("gardiennage:delete", "deleteGardiennage", "gardiennage_delete");
  registerQueueAware("gardiennage:close", "closeGardiennage", "gardiennage_close");
  registerQueueAware("gardiennage:reopen", "reopenGardiennage", "gardiennage_reopen");
}

module.exports = {
  registerDomainIpcHandlers
};
