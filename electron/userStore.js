/**
 * Orchestrateur d'accès données pour Goron-GTS (PostgreSQL only).
 *
 * Persistance métier exclusive via le pool PostgreSQL
 * (`attachPostgresAuditLab` / `referentialsPersistence`).
 * Chaque méthode publique délègue vers `store/domains/*` ou `store/core/*` —
 * pas de règle métier volumineuse ici. Appelants principaux : IPC (`main.js`).
 * Noyau PG / auth : `store/userStoreCore.js`.
 *
 * @module electron/userStore
 */

const { UserStoreCore, ROLE, AppError } = require("./store/userStoreCore");
const {
  referentials: referentialsDomain,
  holidays: holidaysDomain,
  rondeMotifTypes: rondeMotifTypesDomain,
  formVariables: formVariablesDomain,
  templateAssignments: templateAssignmentsDomain,
  pendingSites: pendingSitesDomain,
  pendingIntervenants: pendingIntervenantsDomain
} = require("./store/domains/data");
const fransorDomain = require("./store/domains/fransor");
const mainCouranteDomain = require("./store/domains/mainCourante");
const gardiennageDomain = require("./store/domains/gardiennage");
const interventionDomain = require("./store/domains/intervention");
const rondeDomain = require("./store/domains/ronde");
const rondePlannedProfilesDomain = require("./store/domains/ronde/plannedProfiles");

/**
 * Façade publique : noyau PG + délégations domaines.
 */
class UserStore extends UserStoreCore {
  // --- Référentiels (async via PostgreSQL / referentialsPersistence) ---

  async listSites({ requesterRole }) {
    return referentialsDomain.listSites(this, { requesterRole });
  }

  async createSite({ requesterRole, requesterUsername, code, name, address, parc, famille, auditMode = "single" }) {
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

  async updateSite({
    requesterRole,
    requesterUsername,
    id,
    code,
    name,
    address,
    parc,
    famille,
    expectedUpdatedAt,
    auditMode = "single"
  }) {
    return referentialsDomain.updateSite(this, {
      requesterRole,
      requesterUsername,
      id,
      code,
      name,
      address,
      parc,
      famille,
      expectedUpdatedAt,
      auditMode
    });
  }

  async deleteSite({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteSite(this, { requesterRole, requesterUsername, id, reason });
  }

  async listIntervenants({ requesterRole }) {
    return referentialsDomain.listIntervenants(this, { requesterRole });
  }

  async createIntervenant({ requesterRole, requesterUsername, name, auditMode = "single" }) {
    return referentialsDomain.createIntervenant(this, { requesterRole, requesterUsername, name, auditMode });
  }

  async updateIntervenant({ requesterRole, requesterUsername, id, name, expectedUpdatedAt, auditMode = "single" }) {
    return referentialsDomain.updateIntervenant(this, {
      requesterRole,
      requesterUsername,
      id,
      name,
      expectedUpdatedAt,
      auditMode
    });
  }

  async deleteIntervenant({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteIntervenant(this, { requesterRole, requesterUsername, id, reason });
  }

  async listPendingSites({ requesterRole }) {
    await this.whenPostgresReady();
    return pendingSitesDomain.listPendingSites(this, { requesterRole });
  }

  async createPendingSite(payload) {
    await this.whenPostgresReady();
    return pendingSitesDomain.createPendingSite(this, payload);
  }

  async resolvePendingSite(payload) {
    await this.whenPostgresReady();
    return pendingSitesDomain.resolvePendingSite(this, payload);
  }

  async deletePendingSite(payload) {
    await this.whenPostgresReady();
    return pendingSitesDomain.deletePendingSite(this, payload);
  }

  async listPendingIntervenants({ requesterRole }) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.listPendingIntervenants(this, { requesterRole });
  }

  async createPendingIntervenant(payload) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.createPendingIntervenant(this, payload);
  }

  async resolvePendingIntervenant(payload) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.resolvePendingIntervenant(this, payload);
  }

  async deletePendingIntervenant(payload) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.deletePendingIntervenant(this, payload);
  }

  async listAnomalyTypes({ requesterRole }) {
    return referentialsDomain.listAnomalyTypes(this, { requesterRole });
  }

  async createAnomalyType({ requesterRole, requesterUsername, label, colorHex, auditMode = "single" }) {
    return referentialsDomain.createAnomalyType(this, { requesterRole, requesterUsername, label, colorHex, auditMode });
  }

  async updateAnomalyType({
    requesterRole,
    requesterUsername,
    id,
    label,
    colorHex,
    expectedUpdatedAt,
    auditMode = "single"
  }) {
    return referentialsDomain.updateAnomalyType(this, {
      requesterRole,
      requesterUsername,
      id,
      label,
      colorHex,
      expectedUpdatedAt,
      auditMode
    });
  }

  async deleteAnomalyType({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteAnomalyType(this, { requesterRole, requesterUsername, id, reason });
  }

  // --- Fransor (PostgreSQL only, dossier domains/fransor) ---

  async listFransorResponsables({ requesterRole }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorResponsables(this, { requesterRole });
  }

  async createFransorResponsable({ requesterRole, requesterUsername, name }) {
    await this.whenPostgresReady();
    return fransorDomain.createFransorResponsable(this, { requesterRole, requesterUsername, name });
  }

  async updateFransorResponsable({ requesterRole, requesterUsername, id, name }) {
    await this.whenPostgresReady();
    return fransorDomain.updateFransorResponsable(this, {
      requesterRole,
      requesterUsername,
      id,
      name
    });
  }

  async deleteFransorResponsable({ requesterRole, requesterUsername, id, reason }) {
    await this.whenPostgresReady();
    return fransorDomain.deleteFransorResponsable(this, {
      requesterRole,
      requesterUsername,
      id,
      reason
    });
  }

  async listFransorClosures({ requesterRole, month }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorClosures(this, { requesterRole, month });
  }

  async upsertFransorClosure({ id, requesterRole, requesterUsername, startDate, endDate, label, mode = "CLOSED" }) {
    await this.whenPostgresReady();
    return fransorDomain.upsertFransorClosure(this, {
      id,
      requesterRole,
      requesterUsername,
      startDate,
      endDate,
      label,
      mode
    });
  }

  async deleteFransorClosure({ requesterRole, requesterUsername, id, reason }) {
    await this.whenPostgresReady();
    return fransorDomain.deleteFransorClosure(this, { requesterRole, requesterUsername, id, reason });
  }

  async listFransorEntriesByMonth({ requesterRole, month }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorEntriesByMonth(this, { requesterRole, month });
  }

  async upsertFransorEntry({ requesterRole, requesterUsername, date, responsableId, ouvertureDone, fermetureDone }) {
    await this.whenPostgresReady();
    return fransorDomain.upsertFransorEntry(this, {
      requesterRole,
      requesterUsername,
      date,
      responsableId,
      ouvertureDone,
      fermetureDone
    });
  }

  async listFransorMonthlyRecap({ requesterRole, month }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorMonthlyRecap(this, { requesterRole, month });
  }

  // --- Main courante (PostgreSQL only, dossier domains/mainCourante) ---

  async listMainCouranteEntries({ requesterRole }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.listMainCouranteEntries(this, { requesterRole });
  }

  async createMainCouranteEntry({
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
    await this.whenPostgresReady();
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

  async updateMainCouranteEntryOperator({
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
    await this.whenPostgresReady();
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

  async applyMainCouranteManagerAction({
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    managerName,
    managerObservation,
    decision
  }) {
    await this.whenPostgresReady();
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

  async reopenMainCouranteEntry({ requesterRole, requesterUsername, id, expectedUpdatedAt, managerName }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.reopenMainCouranteEntry(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      managerName,
      role: ROLE
    });
  }

  async getMainCouranteUnconsultedCount({ requesterRole }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.getMainCouranteUnconsultedCount(this, { requesterRole, role: ROLE });
  }

  async getMainCouranteOperatorResponseCount({ requesterRole, requesterUsername }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.getMainCouranteOperatorResponseCount(this, {
      requesterRole,
      requesterUsername,
      role: ROLE
    });
  }

  async markMainCouranteEntryConsulted({ requesterRole, requesterUsername, id }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.markMainCouranteEntryConsulted(this, {
      requesterRole,
      requesterUsername,
      id,
      role: ROLE
    });
  }

  async markMainCouranteEntryConsultedByOperator({ requesterRole, requesterUsername, id }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.markMainCouranteEntryConsultedByOperator(this, {
      requesterRole,
      requesterUsername,
      id,
      role: ROLE
    });
  }

  // --- Interventions (PostgreSQL only, dossier domains/intervention) ---

  async listInterventions({ requesterRole }) {
    await this.whenPostgresReady();
    return interventionDomain.listInterventions(this, { requesterRole });
  }

  async getInterventionOpenCount({ requesterRole }) {
    await this.whenPostgresReady();
    return interventionDomain.getInterventionOpenCount(this, { requesterRole });
  }

  async createIntervention(payload) {
    await this.whenPostgresReady();
    return interventionDomain.createIntervention(this, payload);
  }

  async updateIntervention(payload) {
    await this.whenPostgresReady();
    return interventionDomain.updateIntervention(this, payload);
  }

  async setInterventionStatus(payload) {
    await this.whenPostgresReady();
    return interventionDomain.setInterventionStatus(this, payload);
  }

  // --- Rondes (PostgreSQL only, dossier domains/ronde) ---

  async listRondes({ requesterRole }) {
    await this.whenPostgresReady();
    return rondeDomain.listRondes(this, { requesterRole });
  }

  async getRondeTodayInProgressCounts({ requesterRole, todayIso }) {
    await this.whenPostgresReady();
    return rondeDomain.getRondeTodayInProgressCounts(this, { requesterRole, todayIso });
  }

  async autoCloseExpiredExceptionalRondes(options) {
    await this.whenPostgresReady();
    return rondeDomain.autoCloseExpiredExceptionalRondes(this, options);
  }

  async createRondeEntry(payload) {
    await this.whenPostgresReady();
    return rondeDomain.createRonde(this, payload);
  }

  async updateRondeEntry(payload) {
    await this.whenPostgresReady();
    return rondeDomain.updateRonde(this, payload);
  }

  async setRondeStatus(payload) {
    await this.whenPostgresReady();
    return rondeDomain.setRondeStatus(this, payload);
  }

  async updateRondeBatchSharedFields(payload) {
    await this.whenPostgresReady();
    return rondeDomain.updateRondeBatchSharedFields(this, payload);
  }

  async bulkCancelRondeBatch(payload) {
    await this.whenPostgresReady();
    return rondeDomain.bulkCancelRondeBatch(this, payload);
  }

  async bulkDeleteRondeBatch(payload) {
    await this.whenPostgresReady();
    return rondeDomain.bulkDeleteRondeBatch(this, payload);
  }

  async requestRondeBatchDelete(payload) {
    await this.whenPostgresReady();
    return rondeDomain.requestRondeBatchDelete(this, payload);
  }

  async reviewRondeBatchDeleteRequest(payload) {
    await this.whenPostgresReady();
    return rondeDomain.reviewRondeBatchDeleteRequest(this, payload);
  }

  async listRondeBatchDeleteRequests(payload) {
    await this.whenPostgresReady();
    return rondeDomain.listRondeBatchDeleteRequests(this, payload);
  }

  listRondeMotifTypes({ requesterRole }) {
    return rondeMotifTypesDomain.listRondeMotifTypes(this, { requesterRole });
  }

  async createRondeMotifType(payload) {
    await this.whenPostgresReady();
    return rondeMotifTypesDomain.createRondeMotifType(this, payload);
  }

  async updateRondeMotifType(payload) {
    await this.whenPostgresReady();
    return rondeMotifTypesDomain.updateRondeMotifType(this, payload);
  }

  async deleteRondeMotifType(payload) {
    await this.whenPostgresReady();
    return rondeMotifTypesDomain.deleteRondeMotifType(this, payload);
  }

  async listRondePlannedProfiles(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.listRondePlannedProfiles(this, payload);
  }

  async upsertRondePlannedProfile(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.upsertRondePlannedProfile(this, payload);
  }

  async deleteRondePlannedProfile(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.deleteRondePlannedProfile(this, payload);
  }

  async requestRondePlannedProfileCancellation(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.requestRondePlannedProfileCancellation(this, {
      ...payload,
      role: ROLE
    });
  }

  async reviewRondePlannedProfileCancellationRequest(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.reviewRondePlannedProfileCancellationRequest(this, {
      ...payload,
      role: ROLE
    });
  }

  async setRondePlannedProfilePlanningEnd(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.setRondePlannedProfilePlanningEnd(this, {
      ...payload,
      role: ROLE
    });
  }

  async setRondePlannedProfileValidated(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.setRondePlannedProfileValidated(this, payload);
  }

  listHolidays(payload) {
    return holidaysDomain.listHolidays(this, payload);
  }

  async createHoliday(payload) {
    await this.whenPostgresReady();
    return holidaysDomain.createHoliday(this, payload);
  }

  async updateHoliday(payload) {
    await this.whenPostgresReady();
    return holidaysDomain.updateHoliday(this, payload);
  }

  async deleteHoliday(payload) {
    await this.whenPostgresReady();
    return holidaysDomain.deleteHoliday(this, payload);
  }

  async listFormVariables(payload) {
    await this.whenPostgresReady();
    return formVariablesDomain.listFormVariables(this, payload);
  }

  async saveFormVariables(payload) {
    await this.whenPostgresReady();
    return formVariablesDomain.saveFormVariables(this, payload);
  }

  async listTemplateAssignments(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.listTemplateAssignments(this, payload);
  }

  async upsertTemplateAssignment(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.upsertTemplateAssignment(this, payload);
  }

  async deleteTemplateAssignment(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.deleteTemplateAssignment(this, payload);
  }

  async resolveTemplateFileForContext(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.resolveTemplateFileForContext(this, payload);
  }

  // --- Gardiennage (PostgreSQL only, dossier domains/gardiennage) ---

  async listGardiennages({ requesterRole }) {
    await this.whenPostgresReady();
    return gardiennageDomain.listGardiennages(this, { requesterRole });
  }

  async getGardiennageTodayInProgressCount({ requesterRole, todayIso }) {
    await this.whenPostgresReady();
    return gardiennageDomain.getGardiennageTodayInProgressCount(this, { requesterRole, todayIso });
  }

  async extendOpenEndedGardiennageHorizons(options) {
    await this.whenPostgresReady();
    return gardiennageDomain.extendOpenEndedGardiennageHorizons(this, options);
  }

  async autoCloseExpiredGardiennages(options) {
    await this.whenPostgresReady();
    return gardiennageDomain.autoCloseExpiredGardiennageEntries(this, options);
  }

  async createGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.createGardiennage(this, payload);
  }

  async updateGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.updateGardiennage(this, payload);
  }

  async setGardiennageStatus(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.setGardiennageStatus(this, payload);
  }

  async closeGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.closeGardiennage(this, payload);
  }

  async reopenGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.reopenGardiennage(this, payload);
  }

  async deleteGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.deleteGardiennage(this, payload);
  }
}


/** @typedef {import('./store/core/errors').AppError} AppError */


module.exports = { UserStore, ROLE, AppError };
