/**
 * Enregistrement des canaux IPC métier authentifiés (`users:*`, `data:*`, `mainCourante:*`, etc.).
 *
 * Délègue au `UserStore`. Appelé depuis `main.js`.
 * Miroir renderer : `electron/preload.js` et `gtsApiClient`.
 *
 * @module electron/main/ipcDomainHandlers
 */

const os = require("os");

/** @type {Array<[string, string]>} Canal IPC → méthode `UserStore`. */
const STORE_PASSTHROUGH_CHANNELS = [
  ["users:list", "listUsers"],
  ["users:create", "createUser"],
  ["users:updateProfile", "updateUserProfile"],
  ["users:deactivate", "deactivateUser"],
  ["users:reactivate", "reactivateUser"],
  ["users:unlock", "unlockUser"],
  ["audit:list", "listAuditLogs"],
  ["audit:metadata", "getAuditMetadata"],
  ["techLogs:list", "listTechErrorLogs"],
  ["audit:bulkImport", "logBulkImportAudit"],
  ["preferences:get", "getUserPreferences"],
  ["preferences:set", "setUserPreferences"],
  ["data:sites:list", "listSites"],
  ["data:sites:create", "createSite"],
  ["data:sites:update", "updateSite"],
  ["data:sites:delete", "deleteSite"],
  ["data:intervenants:list", "listIntervenants"],
  ["data:intervenants:create", "createIntervenant"],
  ["data:intervenants:update", "updateIntervenant"],
  ["data:intervenants:delete", "deleteIntervenant"],
  ["data:pendingSites:list", "listPendingSites"],
  ["data:pendingSites:create", "createPendingSite"],
  ["data:pendingSites:resolve", "resolvePendingSite"],
  ["data:pendingSites:delete", "deletePendingSite"],
  ["data:pendingIntervenants:list", "listPendingIntervenants"],
  ["data:pendingIntervenants:create", "createPendingIntervenant"],
  ["data:pendingIntervenants:resolve", "resolvePendingIntervenant"],
  ["data:pendingIntervenants:delete", "deletePendingIntervenant"],
  ["data:types:list", "listAnomalyTypes"],
  ["data:types:create", "createAnomalyType"],
  ["data:types:update", "updateAnomalyType"],
  ["data:types:delete", "deleteAnomalyType"],
  ["data:holidays:list", "listHolidays"],
  ["data:holidays:create", "createHoliday"],
  ["data:holidays:update", "updateHoliday"],
  ["data:holidays:delete", "deleteHoliday"],
  ["data:rondeMotifs:list", "listRondeMotifTypes"],
  ["data:rondeMotifs:create", "createRondeMotifType"],
  ["data:rondeMotifs:update", "updateRondeMotifType"],
  ["data:rondeMotifs:delete", "deleteRondeMotifType"],
  ["data:rondePlannedProfiles:list", "listRondePlannedProfiles"],
  ["data:rondePlannedProfiles:upsert", "upsertRondePlannedProfile"],
  ["data:rondePlannedProfiles:delete", "deleteRondePlannedProfile"],
  ["data:rondePlannedProfiles:requestCancellation", "requestRondePlannedProfileCancellation"],
  ["data:rondePlannedProfiles:reviewCancellation", "reviewRondePlannedProfileCancellationRequest"],
  ["data:rondePlannedProfiles:setPlanningEnd", "setRondePlannedProfilePlanningEnd"],
  ["data:rondePlannedProfiles:setValidated", "setRondePlannedProfileValidated"],
  ["data:formVariables:list", "listFormVariables"],
  ["data:formVariables:save", "saveFormVariables"],
  ["fransor:responsables:list", "listFransorResponsables"],
  ["fransor:responsables:create", "createFransorResponsable"],
  ["fransor:responsables:update", "updateFransorResponsable"],
  ["fransor:responsables:delete", "deleteFransorResponsable"],
  ["fransor:closures:list", "listFransorClosures"],
  ["fransor:closures:upsert", "upsertFransorClosure"],
  ["fransor:closures:delete", "deleteFransorClosure"],
  ["fransor:entries:listByMonth", "listFransorEntriesByMonth"],
  ["fransor:entries:upsert", "upsertFransorEntry"],
  ["fransor:recap:listByMonth", "listFransorMonthlyRecap"],
  ["mainCourante:list", "listMainCouranteEntries"],
  ["mainCourante:getUnconsultedCount", "getMainCouranteUnconsultedCount"],
  ["mainCourante:getOperatorResponseCount", "getMainCouranteOperatorResponseCount"],
  ["mainCourante:markConsulted", "markMainCouranteEntryConsulted"],
  ["mainCourante:markOperatorConsulted", "markMainCouranteEntryConsultedByOperator"],
  ["mainCourante:create", "createMainCouranteEntry"],
  ["mainCourante:updateOperator", "updateMainCouranteEntryOperator"],
  ["mainCourante:applyManager", "applyMainCouranteManagerAction"],
  ["mainCourante:reopen", "reopenMainCouranteEntry"],
  ["intervention:list", "listInterventions"],
  ["intervention:getOpenCount", "getInterventionOpenCount"],
  ["intervention:create", "createIntervention"],
  ["intervention:update", "updateIntervention"],
  ["intervention:setStatus", "setInterventionStatus"],
  ["ronde:list", "listRondes"],
  ["ronde:getTodayInProgressCounts", "getRondeTodayInProgressCounts"],
  ["ronde:create", "createRondeEntry"],
  ["ronde:update", "updateRondeEntry"],
  ["ronde:setStatus", "setRondeStatus"],
  ["ronde:batchUpdate", "updateRondeBatchSharedFields"],
  ["ronde:batchCancel", "bulkCancelRondeBatch"],
  ["ronde:batchDelete", "bulkDeleteRondeBatch"],
  ["ronde:batchDeleteRequest", "requestRondeBatchDelete"],
  ["ronde:batchDeleteReview", "reviewRondeBatchDeleteRequest"],
  ["ronde:batchDeleteList", "listRondeBatchDeleteRequests"],
  ["gardiennage:list", "listGardiennages"],
  ["gardiennage:getTodayInProgressCount", "getGardiennageTodayInProgressCount"],
  ["gardiennage:create", "createGardiennage"],
  ["gardiennage:update", "updateGardiennage"],
  ["gardiennage:setStatus", "setGardiennageStatus"],
  ["gardiennage:requestCancellation", "requestGardiennageCancellation"],
  ["gardiennage:reviewCancellation", "reviewGardiennageCancellation"],
  ["gardiennage:delete", "deleteGardiennage"],
  ["gardiennage:close", "closeGardiennage"],
  ["gardiennage:reopen", "reopenGardiennage"],
  ["videoRemarks:get", "getVideoRemarkSnapshot"],
  ["videoRemarks:save", "saveVideoRemarkSnapshot"]
];

/**
 * Enregistre les handlers IPC domaine.
 *
 * @param {object} deps
 * @param {(channel: string, handler: Function) => void} deps.handleIpcAuth
 * @param {() => import('../userStore')} deps.getUserStore
 * @param {() => Set<string>|Iterable<string>} deps.getActiveUsernames
 * @returns {void}
 */
function registerDomainIpcHandlers(deps) {
  const { handleIpcAuth, getUserStore, getActiveUsernames } = deps;

  for (const [channel, methodName] of STORE_PASSTHROUGH_CHANNELS) {
    handleIpcAuth(channel, (payload) => getUserStore()[methodName](payload));
  }

  handleIpcAuth("users:getActiveSessions", async () => {
    const local = Array.from(getActiveUsernames() || []);
    try {
      const fromPg = await getUserStore().listActivePresenceUsernames();
      const merged = [
        ...new Set([
          ...fromPg.map((u) => String(u).toLowerCase()),
          ...local.map((u) => String(u).toLowerCase())
        ])
      ];
      return { activeUsernames: merged };
    } catch {
      return { activeUsernames: local };
    }
  });

  handleIpcAuth("users:touchPresence", async (payload) => {
    return getUserStore().touchUserPresence({
      requesterUsername: payload.requesterUsername,
      sessionToken: payload.sessionToken,
      hostname: os.hostname()
    });
  });
}

module.exports = {
  registerDomainIpcHandlers
};
