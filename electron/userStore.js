const { DatabaseSync } = require("node:sqlite");
const { resolveAdminAccess } = require("./store/core/bootstrap");
const { AppError, failWithLog } = require("./store/core/errors");
const { writeErrorLog } = require("./store/core/errorLogs");
const { writeAudit } = require("./store/core/audit");
const entityHistoryCore = require("./store/core/entityHistory");
const schemaBaseCore = require("./store/core/schemaBase");
const schemaBusinessDataCore = require("./store/core/schemaBusinessData");
const schemaGardiennageCore = require("./store/core/schemaGardiennage");
const schemaRondeCore = require("./store/core/schemaRonde");
const schemaUsersSitesCore = require("./store/core/schemaUsersSites");
const {
  ensureDataManagerRole: ensureDataManagerRoleRbac,
  ensureDataDeleteRole: ensureDataDeleteRoleRbac,
  ensureDataReaderRole: ensureDataReaderRoleRbac
} = require("./store/core/rbac");
const archiveDomain = require("./store/domains/archive");
const auditLogsDomain = require("./store/domains/auditLogs");
const authUsersDomain = require("./store/domains/authUsers");
const dbHealthDomain = require("./store/domains/dbHealth");
const formVariablesDomain = require("./store/domains/formVariables");
const fransorDomain = require("./store/domains/fransor");
const gardiennageDomain = require("./store/domains/gardiennage");
const holidaysDomain = require("./store/domains/holidays");
const importAuditDomain = require("./store/domains/importAudit");
const interventionDomain = require("./store/domains/intervention");
const interventionWordExtraFieldsDomain = require("./store/domains/interventionWordExtraFields");
const mainCouranteDomain = require("./store/domains/mainCourante");
const rondeDomain = require("./store/domains/ronde");
const rondeMotifTypesDomain = require("./store/domains/rondeMotifTypes");
const rondePlannedProfilesDomain = require("./store/domains/rondePlannedProfiles");
const referentialsDomain = require("./store/domains/referentials");
const templateAssignmentsDomain = require("./store/domains/templateAssignments");
const userPreferencesDomain = require("./store/domains/userPreferences");

const ROLE = {
  RESPONSABLE: "RESPONSABLE",
  OPERATEUR: "OPERATEUR",
  DEV: "DEV"
};


class UserStore {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    const adminAccess = resolveAdminAccess(options);
    this.devMasterCode = adminAccess.devMasterCode;
    this.adminAccessSourcePath = adminAccess.adminAccessSourcePath;
    this.adminAccessEnabled = adminAccess.adminAccessEnabled;
    this.db = new DatabaseSync(this.dbPath);
    this.ensureSchema();
    this.ensureDevUser();
  }

  ensureSchema() {
    schemaBaseCore.ensureBaseSchema(this);
    schemaRondeCore.ensureRondeSchema(this);
    schemaUsersSitesCore.ensureUsersSitesSchema(this, { roles: ROLE });
    schemaBusinessDataCore.ensureBusinessDataSchema(this);
    schemaGardiennageCore.ensureGardiennageSchema(this);
  }

  ensureDevUser() {
    authUsersDomain.ensureDevUser(this, { roles: ROLE });
  }

  logError({ source, code, messageFr, details }) {
    writeErrorLog(this, { source, code, messageFr, details });
  }

  fail(source, userMessage, code, details = {}) {
    failWithLog(this, source, userMessage, code, details);
  }

  logAudit({ actorUsername, action, targetUsername = null, status = "SUCCESS", details = null }) {
    writeAudit(this.db, { actorUsername, action, targetUsername, status, details });
  }

  getEntityChangeHistory(entityType, entityId, limit = 3) {
    return entityHistoryCore.getEntityChangeHistory(this, entityType, entityId, limit);
  }

  recordEntityChange({ entityType, entityId, changedBy, snapshot }) {
    return entityHistoryCore.recordEntityChange(this, { entityType, entityId, changedBy, snapshot });
  }

  logBulkImportAudit({
    requesterRole,
    requesterUsername,
    target,
    fileName,
    total,
    success,
    failed,
    errorEntries = []
  }) {
    return importAuditDomain.logBulkImportAudit(this, {
      requesterRole,
      requesterUsername,
      target,
      fileName,
      total,
      success,
      failed,
      errorEntries
    });
  }

  isFullNamePasswordPairUsedByAnotherUser(fullName, rawPassword, excludedUserId = null) {
    return authUsersDomain.isFullNamePasswordPairUsedByAnotherUser(this, fullName, rawPassword, excludedUserId);
  }

  assertFullNamePasswordPairUnique(fullName, rawPassword, source, excludedUserId = null) {
    return authUsersDomain.assertFullNamePasswordPairUnique(this, fullName, rawPassword, source, excludedUserId);
  }

  generateUniqueTemporaryPasswordForFullName(fullName, excludedUserId = null) {
    return authUsersDomain.generateUniqueTemporaryPasswordForFullName(this, fullName, excludedUserId);
  }

  generateUniqueUsername() {
    return authUsersDomain.generateUniqueUsername(this);
  }

  sanitizeUser(user) {
    return authUsersDomain.sanitizeUser(user);
  }

  login({ username, password }) {
    return authUsersDomain.login(this, { username, password, role: ROLE });
  }

  completeFirstLogin({ username, temporaryPassword, newPassword }) {
    return authUsersDomain.completeFirstLogin(this, { username, temporaryPassword, newPassword });
  }

  listUsers({ requesterRole, requesterUsername }) {
    return authUsersDomain.listUsers(this, { requesterRole, requesterUsername, role: ROLE });
  }

  createUser({ requesterRole, requesterUsername, username, fullName, role, managerProfile, pageAccess }) {
    return authUsersDomain.createUser(this, {
      requesterRole,
      requesterUsername,
      username,
      fullName,
      role,
      managerProfile,
      pageAccess,
      roles: ROLE
    });
  }

  updateUserProfile({ requesterRole, requesterUsername, username, fullName, newRole, managerProfile, pageAccess, mustResetPassword }) {
    return authUsersDomain.updateUserProfile(this, {
      requesterRole,
      requesterUsername,
      username,
      fullName,
      newRole,
      managerProfile,
      pageAccess,
      mustResetPassword,
      role: ROLE
    });
  }

  deactivateUser({ requesterRole, requesterUsername, username }) {
    return authUsersDomain.deactivateUser(this, { requesterRole, requesterUsername, username, role: ROLE });
  }

  unlockUser({ requesterRole, requesterUsername, username }) {
    return authUsersDomain.unlockUser(this, { requesterRole, requesterUsername, username, role: ROLE });
  }

  getDbHealth() {
    return dbHealthDomain.getDbHealth(this);
  }

  listAuditLogs({ requesterRole, requesterUsername, limit = 200 }) {
    return auditLogsDomain.listAuditLogs(this, { requesterRole, requesterUsername, limit, role: ROLE });
  }

  getAuditMetadata({ requesterRole, requesterUsername }) {
    return auditLogsDomain.getAuditMetadata(this, { requesterRole, requesterUsername, role: ROLE });
  }

  getUserPreferences({ requesterRole, requesterUsername }) {
    return userPreferencesDomain.getUserPreferences(this, { requesterRole, requesterUsername });
  }

  setUserPreferences({ requesterRole, requesterUsername, themeMode }) {
    return userPreferencesDomain.setUserPreferences(this, { requesterRole, requesterUsername, themeMode });
  }

  ensureDataManagerRole(requesterRole) {
    ensureDataManagerRoleRbac(requesterRole, this.fail.bind(this), ROLE);
  }

  ensureDataDeleteRole(requesterRole) {
    ensureDataDeleteRoleRbac(requesterRole, this.fail.bind(this), ROLE);
  }

  /** Lecture des référentiels (saisie opérateur, main courante, etc.) */
  ensureDataReaderRole(requesterRole) {
    ensureDataReaderRoleRbac(requesterRole, this.fail.bind(this), ROLE);
  }

  listSites({ requesterRole }) {
    return referentialsDomain.listSites(this, { requesterRole });
  }

  createSite({ requesterRole, requesterUsername, code, name, address, parc, famille, auditMode = "single" }) {
    return referentialsDomain.createSite(this, {
      requesterRole,
      requesterUsername,
      code,
      name,
      address,
      parc,
      famille,
      auditMode
    });
  }

  updateSite({ requesterRole, requesterUsername, id, code, name, address, parc, famille, auditMode = "single" }) {
    return referentialsDomain.updateSite(this, {
      requesterRole,
      requesterUsername,
      id,
      code,
      name,
      address,
      parc,
      famille,
      auditMode
    });
  }

  deleteSite({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteSite(this, { requesterRole, requesterUsername, id, reason });
  }

  listIntervenants({ requesterRole }) {
    return referentialsDomain.listIntervenants(this, { requesterRole });
  }

  createIntervenant({ requesterRole, requesterUsername, name, auditMode = "single" }) {
    return referentialsDomain.createIntervenant(this, { requesterRole, requesterUsername, name, auditMode });
  }

  updateIntervenant({ requesterRole, requesterUsername, id, name, auditMode = "single" }) {
    return referentialsDomain.updateIntervenant(this, { requesterRole, requesterUsername, id, name, auditMode });
  }

  deleteIntervenant({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteIntervenant(this, { requesterRole, requesterUsername, id, reason });
  }

  listAnomalyTypes({ requesterRole }) {
    return referentialsDomain.listAnomalyTypes(this, { requesterRole });
  }

  createAnomalyType({ requesterRole, requesterUsername, label, colorHex, auditMode = "single" }) {
    return referentialsDomain.createAnomalyType(this, { requesterRole, requesterUsername, label, colorHex, auditMode });
  }

  updateAnomalyType({ requesterRole, requesterUsername, id, label, colorHex, auditMode = "single" }) {
    return referentialsDomain.updateAnomalyType(this, { requesterRole, requesterUsername, id, label, colorHex, auditMode });
  }

  deleteAnomalyType({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteAnomalyType(this, { requesterRole, requesterUsername, id, reason });
  }

  listFransorResponsables({ requesterRole }) {
    return fransorDomain.listFransorResponsables(this, { requesterRole });
  }

  createFransorResponsable({ requesterRole, requesterUsername, name }) {
    return fransorDomain.createFransorResponsable(this, { requesterRole, requesterUsername, name });
  }

  updateFransorResponsable({ requesterRole, requesterUsername, id, name }) {
    return fransorDomain.updateFransorResponsable(this, { requesterRole, requesterUsername, id, name });
  }

  deleteFransorResponsable({ requesterRole, requesterUsername, id, reason }) {
    return fransorDomain.deleteFransorResponsable(this, { requesterRole, requesterUsername, id, reason });
  }

  listFransorClosures({ requesterRole, month }) {
    return fransorDomain.listFransorClosures(this, { requesterRole, month });
  }

  upsertFransorClosure({ id, requesterRole, requesterUsername, startDate, endDate, label, mode = "CLOSED" }) {
    return fransorDomain.upsertFransorClosure(this, { id, requesterRole, requesterUsername, startDate, endDate, label, mode });
  }

  deleteFransorClosure({ requesterRole, requesterUsername, id, reason }) {
    return fransorDomain.deleteFransorClosure(this, { requesterRole, requesterUsername, id, reason });
  }

  listFransorEntriesByMonth({ requesterRole, month }) {
    return fransorDomain.listFransorEntriesByMonth(this, { requesterRole, month });
  }

  upsertFransorEntry({ requesterRole, requesterUsername, date, responsableId, ouvertureDone, fermetureDone }) {
    return fransorDomain.upsertFransorEntry(this, { requesterRole, requesterUsername, date, responsableId, ouvertureDone, fermetureDone });
  }

  listFransorMonthlyRecap({ requesterRole, month }) {
    return fransorDomain.listFransorMonthlyRecap(this, { requesterRole, month });
  }

  mapMainCouranteRow(row) {
    return mainCouranteDomain.mapMainCouranteRow(row);
  }

  listMainCouranteEntries({ requesterRole }) {
    return mainCouranteDomain.listMainCouranteEntries(this, { requesterRole });
  }

  listInterventions({ requesterRole }) {
    return interventionDomain.listInterventions(this, { requesterRole });
  }

  getInterventionOpenCount({ requesterRole }) {
    return interventionDomain.getInterventionOpenCount(this, { requesterRole });
  }

  createInterventionEntry(payload) {
    return interventionDomain.createInterventionEntry(this, payload);
  }

  updateInterventionEntry(payload) {
    return interventionDomain.updateInterventionEntry(this, payload);
  }

  setInterventionStatus(payload) {
    return interventionDomain.setInterventionStatus(this, payload);
  }

  setInterventionBillingStatus(payload) {
    return interventionDomain.setInterventionBillingStatus(this, { ...payload, role: ROLE });
  }

  listPendingInterventionSites({ requesterRole }) {
    return interventionDomain.listPendingInterventionSites(this, { requesterRole });
  }

  createPendingInterventionSite(payload) {
    return interventionDomain.createPendingInterventionSite(this, payload);
  }

  listPendingInterventionIntervenants({ requesterRole }) {
    return interventionDomain.listPendingInterventionIntervenants(this, { requesterRole });
  }

  createPendingInterventionIntervenant(payload) {
    return interventionDomain.createPendingInterventionIntervenant(this, payload);
  }

  resolvePendingInterventionSite(payload) {
    return interventionDomain.resolvePendingInterventionSite(this, payload);
  }

  resolvePendingInterventionIntervenant(payload) {
    return interventionDomain.resolvePendingInterventionIntervenant(this, payload);
  }

  deletePendingInterventionSite(payload) {
    return interventionDomain.deletePendingInterventionSite(this, payload);
  }

  deletePendingInterventionIntervenant(payload) {
    return interventionDomain.deletePendingInterventionIntervenant(this, payload);
  }

  listRondes({ requesterRole }) {
    return rondeDomain.listRondes(this, { requesterRole });
  }

  autoCloseExpiredExceptionalRondes(options) {
    return rondeDomain.autoCloseExpiredExceptionalRondes(this, options);
  }

  createRondeEntry(payload) {
    return rondeDomain.createRonde(this, payload);
  }

  updateRondeEntry(payload) {
    return rondeDomain.updateRonde(this, payload);
  }

  setRondeStatus(payload) {
    return rondeDomain.setRondeStatus(this, payload);
  }

  updateRondeBatchSharedFields(payload) {
    return rondeDomain.updateRondeBatchSharedFields(this, payload);
  }

  bulkCancelRondeBatch(payload) {
    return rondeDomain.bulkCancelRondeBatch(this, payload);
  }

  bulkDeleteRondeBatch(payload) {
    return rondeDomain.bulkDeleteRondeBatch(this, payload);
  }

  listRondeMotifTypes({ requesterRole }) {
    return rondeMotifTypesDomain.listRondeMotifTypes(this, { requesterRole });
  }

  createRondeMotifType(payload) {
    return rondeMotifTypesDomain.createRondeMotifType(this, payload);
  }

  updateRondeMotifType(payload) {
    return rondeMotifTypesDomain.updateRondeMotifType(this, payload);
  }

  deleteRondeMotifType(payload) {
    return rondeMotifTypesDomain.deleteRondeMotifType(this, payload);
  }

  listRondePlannedProfiles(payload) {
    return rondePlannedProfilesDomain.listRondePlannedProfiles(this, payload);
  }

  upsertRondePlannedProfile(payload) {
    return rondePlannedProfilesDomain.upsertRondePlannedProfile(this, payload);
  }

  deleteRondePlannedProfile(payload) {
    return rondePlannedProfilesDomain.deleteRondePlannedProfile(this, payload);
  }

  setRondePlannedProfilePlanningEnd(payload) {
    return rondePlannedProfilesDomain.setRondePlannedProfilePlanningEnd(this, payload);
  }

  setRondePlannedProfileValidated(payload) {
    return rondePlannedProfilesDomain.setRondePlannedProfileValidated(this, payload);
  }

  listHolidays(payload) {
    return holidaysDomain.listHolidays(this, payload);
  }

  createHoliday(payload) {
    return holidaysDomain.createHoliday(this, payload);
  }

  updateHoliday(payload) {
    return holidaysDomain.updateHoliday(this, payload);
  }

  deleteHoliday(payload) {
    return holidaysDomain.deleteHoliday(this, payload);
  }

  listInterventionWordExtraFields(payload) {
    return interventionWordExtraFieldsDomain.listInterventionWordExtraFields(this, payload);
  }

  listFormVariables(payload) {
    return formVariablesDomain.listFormVariables(this, payload);
  }

  saveFormVariables(payload) {
    return formVariablesDomain.saveFormVariables(this, payload);
  }

  listTemplateAssignments(payload) {
    return templateAssignmentsDomain.listTemplateAssignments(this, payload);
  }

  upsertTemplateAssignment(payload) {
    return templateAssignmentsDomain.upsertTemplateAssignment(this, payload);
  }

  deleteTemplateAssignment(payload) {
    return templateAssignmentsDomain.deleteTemplateAssignment(this, payload);
  }

  resolveTemplateFileForContext(payload) {
    return templateAssignmentsDomain.resolveTemplateFileForContext(this, payload);
  }

  createMainCouranteEntry({
    requesterRole,
    requesterUsername,
    id,
    operatorName,
    siteId,
    siteDisplay,
    anomalyTypeId,
    anomalyTypeLabel,
    information
  }) {
    return mainCouranteDomain.createMainCouranteEntry(this, {
      requesterRole,
      requesterUsername,
      id,
      operatorName,
      siteId,
      siteDisplay,
      anomalyTypeId,
      anomalyTypeLabel,
      information
    });
  }

  updateMainCouranteEntryOperator({
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    siteId,
    siteDisplay,
    anomalyTypeId,
    anomalyTypeLabel,
    information,
    requesterFullName
  }) {
    return mainCouranteDomain.updateMainCouranteEntryOperator(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      siteId,
      siteDisplay,
      anomalyTypeId,
      anomalyTypeLabel,
      information,
      requesterFullName
    });
  }

  applyMainCouranteManagerAction({ requesterRole, requesterUsername, id, expectedUpdatedAt, managerName, managerObservation, decision }) {
    return mainCouranteDomain.applyMainCouranteManagerAction(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      managerName,
      managerObservation,
      decision,
      role: ROLE
    });
  }

  reopenMainCouranteEntry({ requesterRole, requesterUsername, id, expectedUpdatedAt, managerName }) {
    return mainCouranteDomain.reopenMainCouranteEntry(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      managerName,
      role: ROLE
    });
  }

  getMainCouranteUnconsultedCount({ requesterRole }) {
    return mainCouranteDomain.getMainCouranteUnconsultedCount(this, { requesterRole, role: ROLE });
  }

  markMainCouranteEntryConsulted({ requesterRole, requesterUsername, id }) {
    return mainCouranteDomain.markMainCouranteEntryConsulted(this, {
      requesterRole,
      requesterUsername,
      id,
      role: ROLE
    });
  }

  hasMainCouranteEntry(id) {
    return mainCouranteDomain.hasMainCouranteEntry(this, id);
  }

  archiveMainCouranteClosedEntries({ requesterUsername, delayDays = 10 }) {
    return archiveDomain.archiveMainCouranteClosedEntries(this, { requesterUsername, delayDays });
  }

  listGardiennages({ requesterRole }) {
    return gardiennageDomain.listGardiennages(this, { requesterRole });
  }

  autoCloseExpiredGardiennages(options) {
    return gardiennageDomain.autoCloseExpiredGardiennageEntries(this, options);
  }

  createGardiennage(payload) {
    return gardiennageDomain.createGardiennage(this, payload);
  }

  updateGardiennage(payload) {
    return gardiennageDomain.updateGardiennage(this, payload);
  }

  setGardiennageStatus(payload) {
    return gardiennageDomain.setGardiennageStatus(this, payload);
  }

  closeGardiennage(payload) {
    return gardiennageDomain.closeGardiennage(this, payload);
  }

  reopenGardiennage(payload) {
    return gardiennageDomain.reopenGardiennage(this, payload);
  }

  deleteGardiennage(payload) {
    return gardiennageDomain.deleteGardiennage(this, payload);
  }
}

module.exports = { UserStore, ROLE, AppError };
