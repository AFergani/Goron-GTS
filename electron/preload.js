/**
 * Script preload Electron : pont sécurisé renderer ↔ processus principal.
 *
 * Expose `window.gtsApi` via `contextBridge` (aucun accès direct à Node depuis React).
 * Chaque méthode délègue à `ipcRenderer.invoke` vers un canal enregistré dans `main.js`
 * (`ipcSystemHandlers`, `ipcAuthHandlers`, `ipcDomainHandlers`).
 *
 * Le client TypeScript `src/infrastructure/api/gtsApiClient.ts` enveloppe ces appels
 * (jeton de session, typage). Les signatures détaillées sont dans `src/vite-env.d.ts`.
 *
 * @module electron/preload
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gtsApi", {
  // --- Système : boot PG / mode dev, modèles Word, fenêtre ---
  getDbConfig: (payload) => ipcRenderer.invoke("system:getDbConfig", payload),
  setDevToolsEnabled: (payload) => ipcRenderer.invoke("system:setDevToolsEnabled", payload),
  getDocumentTemplate: (payload) => ipcRenderer.invoke("system:getDocumentTemplate", payload),
  listDocumentTemplates: (payload) => ipcRenderer.invoke("system:listDocumentTemplates", payload),
  installDocumentTemplateCopy: (payload) => ipcRenderer.invoke("system:installDocumentTemplateCopy", payload),
  listTemplateAssignments: (payload) => ipcRenderer.invoke("system:listTemplateAssignments", payload),
  upsertScopedDocumentTemplate: (payload) => ipcRenderer.invoke("system:upsertScopedDocumentTemplate", payload),
  deleteTemplateAssignment: (payload) => ipcRenderer.invoke("system:deleteTemplateAssignment", payload),
  resolveTemplateFileForContext: (payload) => ipcRenderer.invoke("system:resolveTemplateFileForContext", payload),
  openTemplatesFolder: (payload) => ipcRenderer.invoke("system:openTemplatesFolder", payload),
  getDbHealth: (payload) => ipcRenderer.invoke("system:getDbHealth", payload),
  getPostgresLabHealth: (payload) => ipcRenderer.invoke("system:getPostgresLabHealth", payload),
  getPostgresBootstrapStatus: (payload) => ipcRenderer.invoke("system:getPostgresBootstrapStatus", payload),
  savePostgresBootstrapConfig: (payload) => ipcRenderer.invoke("system:savePostgresBootstrapConfig", payload),
  testPostgresBootstrapConfig: (payload) => ipcRenderer.invoke("system:testPostgresBootstrapConfig", payload),
  getPostgresConfig: (payload) => ipcRenderer.invoke("system:getPostgresConfig", payload),
  savePostgresConfig: (payload) => ipcRenderer.invoke("system:savePostgresConfig", payload),
  testPostgresConfig: (payload) => ipcRenderer.invoke("system:testPostgresConfig", payload),
  reconnectPostgres: (payload) => ipcRenderer.invoke("system:reconnectPostgres", payload),
  quitApp: (payload) => ipcRenderer.invoke("system:quitApp", payload),
  minimizeApp: (payload) => ipcRenderer.invoke("system:minimizeApp", payload),

  /**
   * Abonnement : la croix de la fenêtre demande d'ouvrir la modale de sortie (main → renderer).
   *
   * @param {() => void} callback
   * @returns {() => void} Désabonnement (à appeler au démontage React).
   */
  subscribeAppExitChoiceRequest: (callback) => {
    const channel = "app:requestExitChoice";
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // --- Authentification et comptes ---
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  getAdminAccessStatus: () => ipcRenderer.invoke("auth:getAdminAccessStatus"),
  firstLogin: (payload) => ipcRenderer.invoke("auth:firstLogin", payload),
  logout: (payload) => ipcRenderer.invoke("auth:logout", payload),
  listUsers: (payload) => ipcRenderer.invoke("users:list", payload),
  createUser: (payload) => ipcRenderer.invoke("users:create", payload),
  updateUserProfile: (payload) => ipcRenderer.invoke("users:updateProfile", payload),
  deactivateUser: (payload) => ipcRenderer.invoke("users:deactivate", payload),
  reactivateUser: (payload) => ipcRenderer.invoke("users:reactivate", payload),
  unlockUser: (payload) => ipcRenderer.invoke("users:unlock", payload),
  getActiveSessions: (payload) => ipcRenderer.invoke("users:getActiveSessions", payload),
  touchPresence: (payload) => ipcRenderer.invoke("users:touchPresence", payload),
  setAdminCode: (payload) => ipcRenderer.invoke("auth:setAdminCode", payload),

  // --- Audit et préférences ---
  listAuditLogs: (payload) => ipcRenderer.invoke("audit:list", payload),
  getAuditMetadata: (payload) => ipcRenderer.invoke("audit:metadata", payload),
  listTechErrorLogs: (payload) => ipcRenderer.invoke("techLogs:list", payload),
  logBulkImportAudit: (payload) => ipcRenderer.invoke("audit:bulkImport", payload),
  getUserPreferences: (payload) => ipcRenderer.invoke("preferences:get", payload),
  setUserPreferences: (payload) => ipcRenderer.invoke("preferences:set", payload),

  // --- Référentiels (sites, intervenants, types, jours fériés, rondes planifiées) ---
  listSites: (payload) => ipcRenderer.invoke("data:sites:list", payload),
  createSite: (payload) => ipcRenderer.invoke("data:sites:create", payload),
  updateSite: (payload) => ipcRenderer.invoke("data:sites:update", payload),
  deleteSite: (payload) => ipcRenderer.invoke("data:sites:delete", payload),
  listIntervenants: (payload) => ipcRenderer.invoke("data:intervenants:list", payload),
  createIntervenant: (payload) => ipcRenderer.invoke("data:intervenants:create", payload),
  updateIntervenant: (payload) => ipcRenderer.invoke("data:intervenants:update", payload),
  deleteIntervenant: (payload) => ipcRenderer.invoke("data:intervenants:delete", payload),
  listPendingSites: (payload) => ipcRenderer.invoke("data:pendingSites:list", payload),
  createPendingSite: (payload) => ipcRenderer.invoke("data:pendingSites:create", payload),
  resolvePendingSite: (payload) => ipcRenderer.invoke("data:pendingSites:resolve", payload),
  deletePendingSite: (payload) => ipcRenderer.invoke("data:pendingSites:delete", payload),
  listPendingIntervenants: (payload) => ipcRenderer.invoke("data:pendingIntervenants:list", payload),
  createPendingIntervenant: (payload) => ipcRenderer.invoke("data:pendingIntervenants:create", payload),
  resolvePendingIntervenant: (payload) => ipcRenderer.invoke("data:pendingIntervenants:resolve", payload),
  deletePendingIntervenant: (payload) => ipcRenderer.invoke("data:pendingIntervenants:delete", payload),
  listAnomalyTypes: (payload) => ipcRenderer.invoke("data:types:list", payload),
  createAnomalyType: (payload) => ipcRenderer.invoke("data:types:create", payload),
  updateAnomalyType: (payload) => ipcRenderer.invoke("data:types:update", payload),
  deleteAnomalyType: (payload) => ipcRenderer.invoke("data:types:delete", payload),
  listHolidays: (payload) => ipcRenderer.invoke("data:holidays:list", payload),
  createHoliday: (payload) => ipcRenderer.invoke("data:holidays:create", payload),
  updateHoliday: (payload) => ipcRenderer.invoke("data:holidays:update", payload),
  deleteHoliday: (payload) => ipcRenderer.invoke("data:holidays:delete", payload),
  listRondeMotifTypes: (payload) => ipcRenderer.invoke("data:rondeMotifs:list", payload),
  createRondeMotifType: (payload) => ipcRenderer.invoke("data:rondeMotifs:create", payload),
  updateRondeMotifType: (payload) => ipcRenderer.invoke("data:rondeMotifs:update", payload),
  deleteRondeMotifType: (payload) => ipcRenderer.invoke("data:rondeMotifs:delete", payload),
  listRondePlannedProfiles: (payload) => ipcRenderer.invoke("data:rondePlannedProfiles:list", payload),
  upsertRondePlannedProfile: (payload) => ipcRenderer.invoke("data:rondePlannedProfiles:upsert", payload),
  deleteRondePlannedProfile: (payload) => ipcRenderer.invoke("data:rondePlannedProfiles:delete", payload),
  requestRondePlannedProfileCancellation: (payload) =>
    ipcRenderer.invoke("data:rondePlannedProfiles:requestCancellation", payload),
  reviewRondePlannedProfileCancellationRequest: (payload) =>
    ipcRenderer.invoke("data:rondePlannedProfiles:reviewCancellation", payload),
  setRondePlannedProfilePlanningEnd: (payload) =>
    ipcRenderer.invoke("data:rondePlannedProfiles:setPlanningEnd", payload),
  setRondePlannedProfileValidated: (payload) =>
    ipcRenderer.invoke("data:rondePlannedProfiles:setValidated", payload),
  listInterventionWordExtraFields: (payload) => ipcRenderer.invoke("data:interventionWordExtraFields:list", payload),
  listFormVariables: (payload) => ipcRenderer.invoke("data:formVariables:list", payload),
  saveFormVariables: (payload) => ipcRenderer.invoke("data:formVariables:save", payload),

  // --- Fransor ---
  listFransorResponsables: (payload) => ipcRenderer.invoke("fransor:responsables:list", payload),
  createFransorResponsable: (payload) => ipcRenderer.invoke("fransor:responsables:create", payload),
  updateFransorResponsable: (payload) => ipcRenderer.invoke("fransor:responsables:update", payload),
  deleteFransorResponsable: (payload) => ipcRenderer.invoke("fransor:responsables:delete", payload),
  listFransorClosures: (payload) => ipcRenderer.invoke("fransor:closures:list", payload),
  upsertFransorClosure: (payload) => ipcRenderer.invoke("fransor:closures:upsert", payload),
  deleteFransorClosure: (payload) => ipcRenderer.invoke("fransor:closures:delete", payload),
  listFransorEntriesByMonth: (payload) => ipcRenderer.invoke("fransor:entries:listByMonth", payload),
  upsertFransorEntry: (payload) => ipcRenderer.invoke("fransor:entries:upsert", payload),
  listFransorMonthlyRecap: (payload) => ipcRenderer.invoke("fransor:recap:listByMonth", payload),

  // --- Main courante ---
  listMainCouranteEntries: (payload) => ipcRenderer.invoke("mainCourante:list", payload),
  getMainCouranteUnconsultedCount: (payload) => ipcRenderer.invoke("mainCourante:getUnconsultedCount", payload),
  getMainCouranteOperatorResponseCount: (payload) => ipcRenderer.invoke("mainCourante:getOperatorResponseCount", payload),
  markMainCouranteEntryConsulted: (payload) => ipcRenderer.invoke("mainCourante:markConsulted", payload),
  markMainCouranteEntryConsultedByOperator: (payload) => ipcRenderer.invoke("mainCourante:markOperatorConsulted", payload),
  createMainCouranteEntry: (payload) => ipcRenderer.invoke("mainCourante:create", payload),
  updateMainCouranteEntryOperator: (payload) => ipcRenderer.invoke("mainCourante:updateOperator", payload),
  applyMainCouranteManagerAction: (payload) => ipcRenderer.invoke("mainCourante:applyManager", payload),
  reopenMainCouranteEntry: (payload) => ipcRenderer.invoke("mainCourante:reopen", payload),

  // --- Interventions ---
  listInterventions: (payload) => ipcRenderer.invoke("intervention:list", payload),
  getInterventionOpenCount: (payload) => ipcRenderer.invoke("intervention:getOpenCount", payload),
  createIntervention: (payload) => ipcRenderer.invoke("intervention:create", payload),
  updateIntervention: (payload) => ipcRenderer.invoke("intervention:update", payload),
  setInterventionStatus: (payload) => ipcRenderer.invoke("intervention:setStatus", payload),
  setInterventionBillingStatus: (payload) => ipcRenderer.invoke("intervention:setBillingStatus", payload),

  // --- Rondes ---
  listRondes: (payload) => ipcRenderer.invoke("ronde:list", payload),
  getRondeTodayInProgressCounts: (payload) => ipcRenderer.invoke("ronde:getTodayInProgressCounts", payload),
  createRondeEntry: (payload) => ipcRenderer.invoke("ronde:create", payload),
  updateRondeEntry: (payload) => ipcRenderer.invoke("ronde:update", payload),
  setRondeStatus: (payload) => ipcRenderer.invoke("ronde:setStatus", payload),
  updateRondeBatchSharedFields: (payload) => ipcRenderer.invoke("ronde:batchUpdate", payload),
  bulkCancelRondeBatch: (payload) => ipcRenderer.invoke("ronde:batchCancel", payload),
  bulkDeleteRondeBatch: (payload) => ipcRenderer.invoke("ronde:batchDelete", payload),

  // --- Gardiennage ---
  listGardiennages: (payload) => ipcRenderer.invoke("gardiennage:list", payload),
  getGardiennageTodayInProgressCount: (payload) => ipcRenderer.invoke("gardiennage:getTodayInProgressCount", payload),
  createGardiennage: (payload) => ipcRenderer.invoke("gardiennage:create", payload),
  updateGardiennage: (payload) => ipcRenderer.invoke("gardiennage:update", payload),
  setGardiennageStatus: (payload) => ipcRenderer.invoke("gardiennage:setStatus", payload),
  deleteGardiennage: (payload) => ipcRenderer.invoke("gardiennage:delete", payload),
  closeGardiennage: (payload) => ipcRenderer.invoke("gardiennage:close", payload),
  reopenGardiennage: (payload) => ipcRenderer.invoke("gardiennage:reopen", payload)
});
