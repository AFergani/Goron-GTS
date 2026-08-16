/**
 * Enregistrement des canaux IPC métier authentifiés (`users:*`, `data:*`, `mainCourante:*`, etc.).
 * Délègue la logique au `UserStore`. Les domaines métier migrés PostgreSQL passent
 * en passthrough direct (plus de file SMB writer pour ces canaux).
 *
 * Appelé au démarrage via `registerDomainIpcHandlers` dans `main.js`.
 * Miroir côté renderer : `electron/preload.js` et `gtsApiClient`.
 */

const os = require("os");

/**
 * Enregistre l'ensemble des handlers IPC domaine.
 *
 * @param {object} deps - Injections depuis `main.js`.
 * @param {(channel: string, handler: Function) => void} deps.handleIpcAuth - Wrapper IPC avec session valide.
 * @param {() => void} deps.ensureStore - Vérifie que `userStore` est initialisé.
 * @param {() => import('../userStore')} deps.getUserStore - Store métier.
 * @param {() => Set<string>|Iterable<string>} deps.getActiveUsernames - Sessions actives (canal `users:getActiveSessions`).
 * @returns {void}
 */
function registerDomainIpcHandlers(deps) {
  const {
    handleIpcAuth,
    ensureStore,
    getUserStore,
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

  // Users / audit / preferences
  registerStorePassthrough("users:list", "listUsers");
  registerStorePassthrough("users:create", "createUser");
  registerStorePassthrough("users:updateProfile", "updateUserProfile");
  registerStorePassthrough("users:deactivate", "deactivateUser");
  registerStorePassthrough("users:reactivate", "reactivateUser");
  registerStorePassthrough("users:unlock", "unlockUser");

  /**
   * Canal `users:getActiveSessions` — usernames techniques présents via PostgreSQL (multi-postes).
   * Repli : sessions locales de ce process si PG indisponible.
   */
  handleIpcAuth("users:getActiveSessions", async () => {
    ensureStore();
    const local = Array.from(getActiveUsernames() || []);
    try {
      const fromPg = await getUserStore().listActivePresenceUsernames();
      const merged = [...new Set([...fromPg.map((u) => String(u).toLowerCase()), ...local.map((u) => String(u).toLowerCase())])];
      return { activeUsernames: merged };
    } catch {
      return { activeUsernames: local };
    }
  });

  /**
   * Canal `users:touchPresence` — heartbeat présence multi-postes (TTL ~90 s).
   */
  handleIpcAuth("users:touchPresence", async (payload) => {
    ensureStore();
    return getUserStore().touchUserPresence({
      requesterUsername: payload.requesterUsername,
      sessionToken: payload.sessionToken,
      hostname: os.hostname()
    });
  });

  registerStorePassthrough("audit:list", "listAuditLogs");
  registerStorePassthrough("audit:metadata", "getAuditMetadata");
  registerStorePassthrough("techLogs:list", "listTechErrorLogs");
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

  // Main courante (PostgreSQL only — create inclus, plus de cas spécial dans main.js)
  registerStorePassthrough("mainCourante:list", "listMainCouranteEntries");
  registerStorePassthrough("mainCourante:getUnconsultedCount", "getMainCouranteUnconsultedCount");
  registerStorePassthrough("mainCourante:markConsulted", "markMainCouranteEntryConsulted");
  registerStorePassthrough("mainCourante:create", "createMainCouranteEntry");
  registerStorePassthrough("mainCourante:updateOperator", "updateMainCouranteEntryOperator");
  registerStorePassthrough("mainCourante:applyManager", "applyMainCouranteManagerAction");
  registerStorePassthrough("mainCourante:reopen", "reopenMainCouranteEntry");

  // Interventions (PostgreSQL only — create inclus, plus de file writer dédiée)
  registerStorePassthrough("intervention:list", "listInterventions");
  registerStorePassthrough("intervention:getOpenCount", "getInterventionOpenCount");
  registerStorePassthrough("intervention:create", "createInterventionEntry");
  registerStorePassthrough("intervention:update", "updateInterventionEntry");
  registerStorePassthrough("intervention:setStatus", "setInterventionStatus");
  registerStorePassthrough("intervention:setBillingStatus", "setInterventionBillingStatus");
  registerStorePassthrough("intervention:pendingSites:list", "listPendingInterventionSites");
  registerStorePassthrough("intervention:pendingSites:create", "createPendingInterventionSite");
  registerStorePassthrough("intervention:pendingSites:resolve", "resolvePendingInterventionSite");
  registerStorePassthrough("intervention:pendingSites:delete", "deletePendingInterventionSite");
  registerStorePassthrough("intervention:pendingIntervenants:list", "listPendingInterventionIntervenants");
  registerStorePassthrough("intervention:pendingIntervenants:create", "createPendingInterventionIntervenant");
  registerStorePassthrough("intervention:pendingIntervenants:resolve", "resolvePendingInterventionIntervenant");
  registerStorePassthrough("intervention:pendingIntervenants:delete", "deletePendingInterventionIntervenant");

  // Rondes (PostgreSQL only)
  registerStorePassthrough("ronde:list", "listRondes");
  registerStorePassthrough("ronde:create", "createRondeEntry");
  registerStorePassthrough("ronde:update", "updateRondeEntry");
  registerStorePassthrough("ronde:setStatus", "setRondeStatus");
  registerStorePassthrough("ronde:batchUpdate", "updateRondeBatchSharedFields");
  registerStorePassthrough("ronde:batchCancel", "bulkCancelRondeBatch");
  registerStorePassthrough("ronde:batchDelete", "bulkDeleteRondeBatch");

  // Gardiennage (PostgreSQL only)
  registerStorePassthrough("gardiennage:list", "listGardiennages");
  registerStorePassthrough("gardiennage:create", "createGardiennage");
  registerStorePassthrough("gardiennage:update", "updateGardiennage");
  registerStorePassthrough("gardiennage:setStatus", "setGardiennageStatus");
  registerStorePassthrough("gardiennage:delete", "deleteGardiennage");
  registerStorePassthrough("gardiennage:close", "closeGardiennage");
  registerStorePassthrough("gardiennage:reopen", "reopenGardiennage");
}

module.exports = {
  registerDomainIpcHandlers
};
