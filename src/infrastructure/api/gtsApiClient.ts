/**
 * Client TypeScript des appels `window.gtsApi` (preload Electron).
 *
 * Point d'entrée unique des features vers le backend : jeton de session, typage,
 * déconnexion automatique sur `SESSION_EXPIRED` / `SESSION_INVALID`.
 * Types : `gtsApi.types.ts` ; jeton / garde : `gtsApiSession.ts` ;
 * canaux rondes : `gtsApiRonde.ts`.
 */

import type {
  AnomalyTypeRef,
  AuditLog,
  FransorClosure,
  FransorEntry,
  FransorMonthlyRecap,
  FransorResponsableRef,
  HolidayRef,
  IntervenantRef,
  LoginPayload,
  BusinessProfile,
  PageAccess,
  Role,
  SiteRef,
  User
} from "../../types";
import type { MainCouranteEntry, MainCouranteSavePayload } from "../../features/mainCourante/model/mainCourante.types";
import type { InterventionEntry, InterventionSavePayload } from "../../features/intervention/model/intervention.types";
import type { PendingIntervenant, PendingSite } from "../../features/common/model/pendingRefs.types";
import type { FormVariableDef, FormVariableDeletion, FormVariablePayload } from "../../features/settings/model/formVariables.types";
import type { VideoRemarkDocument } from "../../features/videoRemarks/model/videoRemarkTypes";
import type { PvVideoForm, PvVideoImage } from "../../features/pvVideo/model/pvVideoForm";
import type { TemplateFlowKind } from "../../features/settings/model/documentTemplates.types";
import type {
  GardiennageClosePayload,
  GardiennageEntry,
  GardiennageSavePayload,
  GardiennageStatus
} from "../../features/gardiennage/model/gardiennage.types";
import type {
  DbConfig,
  DbHealth,
  GardiennageStatusResult,
  OpenExportFileResult,
  PostgresBackupFile,
  PostgresBackupStatus,
  PostgresLabHealth,
  PostgresReconnectResult,
  PostgresTestResult,
  PublicPostgresConfig,
  SaveExportFileResult,
  TechErrorLog,
  TemplateAssignmentRow
} from "./gtsApi.types";
import { gtsApiRondeMethods } from "./gtsApiRonde";
import {
  getGtsApiSessionToken,
  guardSession,
  sessionCall,
  sessionOnlyCall,
  setGtsApiSessionToken
} from "./gtsApiSession";

export type {
  DbConfig,
  DbHealth,
  GardiennageStatusResult,
  OpenExportFileResult,
  PostgresBackupFile,
  PostgresBackupStatus,
  PostgresLabHealth,
  PostgresReconnectResult,
  PostgresRestoreResult,
  PostgresCompareResult,
  PostgresTestResult,
  PublicPostgresConfig,
  SaveExportFileResult,
  TechErrorLog,
  TemplateAssignmentRow
} from "./gtsApi.types";
export { setGtsApiSessionToken, setOnSessionExpired, isSessionError, isSessionUserFacingMessage } from "./gtsApiSession";

/** Façade métier : une méthode par canal `gtsApi` / IPC. */
export const gtsApiClient = {
  ...gtsApiRondeMethods,
  getDbConfig(): Promise<DbConfig> {
    const token = getGtsApiSessionToken();
    return guardSession(() => window.gtsApi.getDbConfig(token ? { sessionToken: token } : undefined));
  },
  setDevToolsEnabled(enabled: boolean): Promise<{ success: boolean; enabled: boolean }> {
    const token = getGtsApiSessionToken();
    return guardSession(() =>
      window.gtsApi.setDevToolsEnabled(token ? { enabled, sessionToken: token } : { enabled })
    );
  },
  getDocumentTemplate(templateName: string) {
    return sessionCall(window.gtsApi.getDocumentTemplate, { templateName });
  },
  listDocumentTemplates() {
    return sessionOnlyCall(window.gtsApi.listDocumentTemplates);
  },
  installDocumentTemplateCopy(targetFileName: string) {
    return sessionCall(window.gtsApi.installDocumentTemplateCopy, { targetFileName });
  },
  deleteCustomDocumentTemplate(payload: { requesterRole: Role; requesterUsername: string; targetFileName: string }) {
    return sessionCall(window.gtsApi.deleteCustomDocumentTemplate, payload);
  },
  restoreBuiltinDocumentTemplate(payload: { requesterRole: Role; requesterUsername: string; targetFileName: string }) {
    return sessionCall(window.gtsApi.restoreBuiltinDocumentTemplate, payload);
  },
  listTemplateAssignments(payload: { requesterRole: Role }): Promise<TemplateAssignmentRow[]> {
    return sessionCall(window.gtsApi.listTemplateAssignments, payload);
  },
  upsertScopedDocumentTemplate(payload: {
    requesterRole: Role;
    requesterUsername: string;
    flowKind: TemplateFlowKind;
    scopeKind: "SITE" | "FAMILLE";
    scopeValue: string;
    scopeLabel: string;
  }) {
    return sessionCall(window.gtsApi.upsertScopedDocumentTemplate, payload);
  },
  deleteTemplateAssignment(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteTemplateAssignment, payload);
  },
  resolveTemplateFileForContext(payload: {
    requesterRole: Role;
    flowKind: TemplateFlowKind;
    siteId?: string | null;
    famille?: string | null;
  }) {
    return sessionCall(window.gtsApi.resolveTemplateFileForContext, payload);
  },
  openTemplatesFolder() {
    return sessionOnlyCall(window.gtsApi.openTemplatesFolder);
  },
  /**
   * Enregistre un export Word/Excel via le dialogue natif (mémorise le dernier dossier).
   *
   * @param payload.defaultFileName - Nom proposé (sans chemin).
   * @param payload.kind - Extension attendue.
   * @param payload.bytes - Contenu binaire du fichier.
   */
  saveExportFile(payload: {
    defaultFileName: string;
    kind: "docx" | "xlsx";
    bytes: ArrayBuffer | Uint8Array;
  }): Promise<SaveExportFileResult> {
    return sessionCall(window.gtsApi.saveExportFile, payload);
  },
  /**
   * Ouvre un fichier d’export déjà enregistré sur ce poste (Word / Excel).
   *
   * @param filePath - Chemin absolu mémorisé après un enregistrement.
   */
  openExportFile(filePath: string): Promise<OpenExportFileResult> {
    return sessionCall(window.gtsApi.openExportFile, { filePath });
  },
  getDbHealth(): Promise<DbHealth> {
    const token = getGtsApiSessionToken();
    return guardSession(() => window.gtsApi.getDbHealth(token ? { sessionToken: token } : undefined));
  },
  /** Badge : PostgreSQL joignable ? */
  getPostgresLabHealth(): Promise<PostgresLabHealth> {
    return sessionOnlyCall(window.gtsApi.getPostgresLabHealth);
  },
  /** Premier paramétrage PG (sans session) — avant login si aucune config connue. */
  getPostgresBootstrapStatus(): Promise<{
    needsSetup: boolean;
    reachable: boolean;
    config: PublicPostgresConfig;
  }> {
    return window.gtsApi.getPostgresBootstrapStatus();
  },
  savePostgresBootstrapConfig(payload: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    /** Secret technique déjà enregistré sur le poste (récupération seulement). */
    currentPassword?: string;
  }): Promise<{ success: boolean; config: PublicPostgresConfig; reconnect: PostgresReconnectResult }> {
    return window.gtsApi.savePostgresBootstrapConfig(payload);
  },
  testPostgresBootstrapConfig(payload: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  }): Promise<PostgresTestResult> {
    return window.gtsApi.testPostgresBootstrapConfig(payload);
  },
  getPostgresBackupStatus(): Promise<PostgresBackupStatus> {
    return sessionOnlyCall(window.gtsApi.getPostgresBackupStatus);
  },
  pickPostgresBackupFolder(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.pickPostgresBackupFolder, payload);
  },
  savePostgresBackupSettings(payload: { requesterRole: Role; requesterUsername: string; autoEnabled: boolean }) {
    return sessionCall(window.gtsApi.savePostgresBackupSettings, payload);
  },
  openPostgresBackupFolder() {
    return sessionOnlyCall(window.gtsApi.openPostgresBackupFolder);
  },
  runPostgresBackup(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.runPostgresBackup, payload);
  },
  runPostgresBackupSaveAs(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.runPostgresBackupSaveAs, payload);
  },
  startPostgresBackupCycle(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.startPostgresBackupCycle, payload);
  },
  pickPostgresBackupFile() {
    return sessionOnlyCall(window.gtsApi.pickPostgresBackupFile);
  },
  restorePostgresBackupAuth(payload: {
    requesterRole: Role;
    requesterUsername: string;
    filePath?: string;
    fileName?: string;
    accountPassword?: string;
    confirmPhrase?: string;
    managerFullName?: string;
  }) {
    return sessionCall(window.gtsApi.restorePostgresBackupAuth, payload);
  },
  comparePostgresBackupAuth(payload: {
    requesterRole: Role;
    requesterUsername: string;
    filePath?: string;
    fileName?: string;
  }) {
    return sessionCall(window.gtsApi.comparePostgresBackupAuth, payload);
  },
  quitApp(): Promise<{ success: boolean }> {
    const token = getGtsApiSessionToken();
    return window.gtsApi.quitApp(token ? { sessionToken: token } : undefined);
  },
  minimizeApp(): Promise<{ success: boolean }> {
    const token = getGtsApiSessionToken();
    return window.gtsApi.minimizeApp(token ? { sessionToken: token } : undefined);
  },
  /** Croix de fenêtre : le main demande à l'UI d'ouvrir le choix déconnexion / minimiser / quitter. */
  subscribeAppExitChoiceRequest(callback: () => void): () => void {
    if (!window.gtsApi.subscribeAppExitChoiceRequest) {
      return () => {};
    }
    return window.gtsApi.subscribeAppExitChoiceRequest(callback);
  },
  login(payload: LoginPayload): Promise<{ user: User; sessionToken: string }> {
    return window.gtsApi.login(payload);
  },
  firstLogin(payload: { username: string; temporaryPassword: string; newPassword: string }) {
    return window.gtsApi.firstLogin(payload);
  },
  /** Réinitialisation d'un mot de passe oublié, validée par un collègue présent (hors session). */
  resetPasswordWithPeer(payload: {
    fullName: string;
    validatorFullName: string;
    validatorPassword: string;
    reason: string;
  }) {
    return window.gtsApi.resetPasswordWithPeer(payload);
  },
  unlockUser(payload: { requesterRole: Role; requesterUsername: string; username: string; reason: string }) {
    return sessionCall(window.gtsApi.unlockUser, payload);
  },
  getActiveSessions() {
    return sessionOnlyCall(window.gtsApi.getActiveSessions);
  },
  /** Heartbeat présence multi-postes (PostgreSQL). */
  touchPresence() {
    return sessionOnlyCall(window.gtsApi.touchPresence);
  },
  listUsers(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.listUsers, payload);
  },
  createUser(payload: {
    requesterRole: Role;
    requesterUsername: string;
    username: string;
    fullName: string;
    role: Exclude<Role, "DEV">;
    managerProfile: BusinessProfile | null;
    pageAccess: PageAccess;
  }) {
    return sessionCall(window.gtsApi.createUser, payload);
  },
  updateUserProfile(payload: {
    requesterRole: Role;
    requesterUsername: string;
    username: string;
    fullName: string;
    newRole: Exclude<Role, "DEV">;
    managerProfile: BusinessProfile | null;
    pageAccess: PageAccess;
    mustResetPassword: boolean;
    /** Motif obligatoire tracé dans le journal des actions. */
    reason: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.updateUserProfile, payload);
  },
  deactivateUser(payload: { requesterRole: Role; requesterUsername: string; username: string; reason: string }) {
    return sessionCall(window.gtsApi.deactivateUser, payload);
  },
  reactivateUser(payload: {
    requesterRole: Role;
    requesterUsername: string;
    username: string;
    reason: string;
    fullName?: string;
  }) {
    return sessionCall(window.gtsApi.reactivateUser, payload);
  },
  listAuditLogs(payload: { requesterRole: Role; requesterUsername: string; limit?: number }): Promise<AuditLog[]> {
    return sessionCall(window.gtsApi.listAuditLogs, payload);
  },
  getAuditMetadata(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.getAuditMetadata, payload);
  },
  listTechErrorLogs(payload: { requesterRole: Role; requesterUsername: string; limit?: number }): Promise<TechErrorLog[]> {
    return sessionCall(window.gtsApi.listTechErrorLogs, payload);
  },
  logBulkImportAudit(payload: {
    requesterRole: Role;
    requesterUsername: string;
    target: "sites" | "intervenants" | "types";
    fileName: string;
    total: number;
    success: number;
    failed: number;
    errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
  }) {
    return sessionCall(window.gtsApi.logBulkImportAudit, payload);
  },
  getUserPreferences(payload: { requesterRole: Role; requesterUsername: string }) {
    return sessionCall(window.gtsApi.getUserPreferences, payload);
  },
  setUserPreferences(payload: { requesterRole: Role; requesterUsername: string; themeMode: "dark" | "light" }) {
    return sessionCall(window.gtsApi.setUserPreferences, payload);
  },
  listSites(payload: { requesterRole: Role }): Promise<SiteRef[]> {
    return sessionCall(window.gtsApi.listSites, payload);
  },
  getVideoRemarkSnapshot(payload: {
    requesterRole: Role;
    siteId: string;
  }): Promise<{ updatedAt: string; payload: VideoRemarkDocument } | null> {
    return sessionCall(window.gtsApi.getVideoRemarkSnapshot, payload);
  },
  saveVideoRemarkSnapshot(payload: {
    requesterRole: Role;
    requesterUsername: string;
    siteId: string;
    expectedUpdatedAt: string | null;
    document: VideoRemarkDocument;
  }): Promise<{ updatedAt: string }> {
    return sessionCall(window.gtsApi.saveVideoRemarkSnapshot, payload);
  },
  getPvVideoReport(payload: {
    requesterRole: Role;
    siteId: string;
  }): Promise<{
    updatedAt: string | null;
    archiveConfigured: boolean;
    form: PvVideoForm | null;
    image: PvVideoImage | null;
  }> {
    return sessionCall(window.gtsApi.getPvVideoReport, payload);
  },
  savePvVideoReport(payload: {
    requesterRole: Role;
    requesterUsername: string;
    siteId: string;
    expectedUpdatedAt: string | null;
    form: PvVideoForm;
    image: PvVideoImage | null;
    imageChanged: boolean;
  }): Promise<{ updatedAt: string; snapshotSaved: boolean }> {
    return sessionCall(window.gtsApi.savePvVideoReport, payload);
  },
  setPvVideoArchiveFolder(payload: {
    requesterRole: Role;
    requesterUsername: string;
  }): Promise<{ canceled: boolean; archiveConfigured: boolean }> {
    return sessionCall(window.gtsApi.setPvVideoArchiveFolder, payload);
  },
  archivePvVideoExport(payload: {
    requesterRole: Role;
    siteId: string;
    sourcePath: string;
  }): Promise<{ backedUp: boolean; reason: string }> {
    return sessionCall(window.gtsApi.archivePvVideoExport, payload);
  },
  listPvVideoSnapshots(payload: {
    requesterRole: Role;
    siteId: string;
  }): Promise<{ snapshots: { version: number; savedAt: string; savedBy: string }[] }> {
    return sessionCall(window.gtsApi.listPvVideoSnapshots, payload);
  },
  loadPvVideoSnapshot(payload: {
    requesterRole: Role;
    siteId: string;
    savedAt: string;
  }): Promise<{
    version: number;
    savedAt: string;
    form: PvVideoForm;
    image: PvVideoImage | null;
  }> {
    return sessionCall(window.gtsApi.loadPvVideoSnapshot, payload);
  },
  createSite(payload: {
    requesterRole: Role;
    requesterUsername: string;
    code: string;
    name: string;
    address?: string;
    parc?: string;
    famille?: string;
    auditMode?: "single" | "batch";
  }) {
    return sessionCall(window.gtsApi.createSite, payload);
  },
  updateSite(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    code: string;
    name: string;
    address?: string;
    parc?: string;
    famille?: string;
    expectedUpdatedAt?: string | null;
    auditMode?: "single" | "batch";
  }) {
    return sessionCall(window.gtsApi.updateSite, payload);
  },
  deleteSite(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteSite, payload);
  },
  listIntervenants(payload: { requesterRole: Role }): Promise<IntervenantRef[]> {
    return sessionCall(window.gtsApi.listIntervenants, payload);
  },
  createIntervenant(payload: { requesterRole: Role; requesterUsername: string; name: string; auditMode?: "single" | "batch" }) {
    return sessionCall(window.gtsApi.createIntervenant, payload);
  },
  updateIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    name: string;
    expectedUpdatedAt?: string | null;
    auditMode?: "single" | "batch";
  }) {
    return sessionCall(window.gtsApi.updateIntervenant, payload);
  },
  deleteIntervenant(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteIntervenant, payload);
  },
  listPendingSites(payload: { requesterRole: Role }): Promise<PendingSite[]> {
    return sessionCall(window.gtsApi.listPendingSites, payload);
  },
  createPendingSite(payload: { requesterRole: Role; requesterUsername: string; code: string; name: string }) {
    return sessionCall(window.gtsApi.createPendingSite, payload);
  },
  resolvePendingSite(payload: {
    requesterRole: Role;
    requesterUsername: string;
    pendingId: string;
    parc: string;
    famille: string;
    address?: string;
  }) {
    return sessionCall(window.gtsApi.resolvePendingSite, payload);
  },
  deletePendingSite(payload: { requesterRole: Role; requesterUsername: string; pendingId: string; reason: string }) {
    return sessionCall(window.gtsApi.deletePendingSite, payload);
  },
  listPendingIntervenants(payload: { requesterRole: Role }): Promise<PendingIntervenant[]> {
    return sessionCall(window.gtsApi.listPendingIntervenants, payload);
  },
  createPendingIntervenant(payload: { requesterRole: Role; requesterUsername: string; name: string }) {
    return sessionCall(window.gtsApi.createPendingIntervenant, payload);
  },
  resolvePendingIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    pendingId: string;
    name?: string;
  }) {
    return sessionCall(window.gtsApi.resolvePendingIntervenant, payload);
  },
  deletePendingIntervenant(payload: { requesterRole: Role; requesterUsername: string; pendingId: string; reason: string }) {
    return sessionCall(window.gtsApi.deletePendingIntervenant, payload);
  },
  listAnomalyTypes(payload: { requesterRole: Role }): Promise<AnomalyTypeRef[]> {
    return sessionCall(window.gtsApi.listAnomalyTypes, payload);
  },
  createAnomalyType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    label: string;
    colorHex?: string;
    auditMode?: "single" | "batch";
  }) {
    return sessionCall(window.gtsApi.createAnomalyType, payload);
  },
  updateAnomalyType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    label: string;
    colorHex?: string;
    expectedUpdatedAt?: string | null;
    auditMode?: "single" | "batch";
  }) {
    return sessionCall(window.gtsApi.updateAnomalyType, payload);
  },
  deleteAnomalyType(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteAnomalyType, payload);
  },
  listHolidays(payload: { requesterRole: Role }): Promise<HolidayRef[]> {
    return sessionCall(window.gtsApi.listHolidays, payload);
  },
  createHoliday(payload: { requesterRole: Role; requesterUsername: string; dateIso: string; label: string }) {
    return sessionCall(window.gtsApi.createHoliday, payload);
  },
  updateHoliday(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    dateIso: string;
    label: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.updateHoliday, payload);
  },
  deleteHoliday(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteHoliday, payload);
  },
  listFransorResponsables(payload: { requesterRole: Role }): Promise<FransorResponsableRef[]> {
    return sessionCall(window.gtsApi.listFransorResponsables, payload);
  },
  createFransorResponsable(payload: { requesterRole: Role; requesterUsername: string; name: string }) {
    return sessionCall(window.gtsApi.createFransorResponsable, payload);
  },
  updateFransorResponsable(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    name: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.updateFransorResponsable, payload);
  },
  deleteFransorResponsable(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteFransorResponsable, payload);
  },
  listFransorClosures(payload: { requesterRole: Role; month: string }): Promise<FransorClosure[]> {
    return sessionCall(window.gtsApi.listFransorClosures, payload);
  },
  upsertFransorClosure(payload: {
    id?: string;
    requesterRole: Role;
    requesterUsername: string;
    startDate: string;
    endDate?: string;
    label: string;
    mode: "CLOSED" | "OPEN";
  }) {
    return sessionCall(window.gtsApi.upsertFransorClosure, payload);
  },
  deleteFransorClosure(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteFransorClosure, payload);
  },
  listFransorEntriesByMonth(payload: { requesterRole: Role; month: string }): Promise<FransorEntry[]> {
    return sessionCall(window.gtsApi.listFransorEntriesByMonth, payload);
  },
  upsertFransorEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    date: string;
    responsableId: string;
    ouvertureDone: boolean;
    fermetureDone: boolean;
  }) {
    return sessionCall(window.gtsApi.upsertFransorEntry, payload);
  },
  listFransorMonthlyRecap(payload: { requesterRole: Role; month: string }): Promise<FransorMonthlyRecap[]> {
    return sessionCall(window.gtsApi.listFransorMonthlyRecap, payload);
  },
  listMainCouranteEntries(payload: { requesterRole: Role }): Promise<MainCouranteEntry[]> {
    return sessionCall(window.gtsApi.listMainCouranteEntries, payload);
  },
  getMainCouranteUnconsultedCount(payload: { requesterRole: Role }) {
    return sessionCall(window.gtsApi.getMainCouranteUnconsultedCount, payload);
  },
  getMainCouranteOperatorResponseCount(payload: { requesterRole: Role }) {
    return sessionCall(window.gtsApi.getMainCouranteOperatorResponseCount, payload);
  },
  markMainCouranteEntryConsulted(payload: { requesterRole: Role; requesterUsername: string; id: string }) {
    return sessionCall(window.gtsApi.markMainCouranteEntryConsulted, payload);
  },
  markMainCouranteEntryConsultedByOperator(payload: { requesterRole: Role; requesterUsername: string; id: string }) {
    return sessionCall(window.gtsApi.markMainCouranteEntryConsultedByOperator, payload);
  },
  createMainCouranteEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    operatorName: string;
    siteId: string | null;
    siteDisplay: string;
    anomalyTypeId: string;
    anomalyTypeLabel: string;
    information: string;
    exportExtraValues?: Record<string, string>;
  }) {
    return sessionCall(window.gtsApi.createMainCouranteEntry, payload);
  },
  updateMainCouranteEntryOperator(
    payload: {
      requesterRole: Role;
      requesterUsername: string;
      id: string;
      expectedUpdatedAt: string;
      requesterFullName: string;
    } & MainCouranteSavePayload
  ) {
    return sessionCall(window.gtsApi.updateMainCouranteEntryOperator, payload);
  },
  applyMainCouranteManagerAction(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    managerName: string;
    managerObservation: string;
    decision: "suivre" | "cloture";
    exportExtraValues?: Record<string, string>;
  }) {
    return sessionCall(window.gtsApi.applyMainCouranteManagerAction, payload);
  },
  reopenMainCouranteEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    managerName: string;
  }) {
    return sessionCall(window.gtsApi.reopenMainCouranteEntry, payload);
  },
  listInterventions(payload: { requesterRole: Role }): Promise<InterventionEntry[]> {
    return sessionCall(window.gtsApi.listInterventions, payload);
  },
  getInterventionOpenCount(payload: { requesterRole: Role }) {
    return sessionCall(window.gtsApi.getInterventionOpenCount, payload);
  },
  createIntervention(payload: { requesterRole: Role; requesterUsername: string; id: string } & InterventionSavePayload) {
    return sessionCall(window.gtsApi.createIntervention, payload);
  },
  updateIntervention(
    payload: { requesterRole: Role; requesterUsername: string; id: string; expectedUpdatedAt: string } & InterventionSavePayload
  ) {
    return sessionCall(window.gtsApi.updateIntervention, payload);
  },
  setInterventionStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    status: "EN_COURS" | "CLOTURE" | "ANNULE";
    cancellationReason?: string;
  }) {
    return sessionCall(window.gtsApi.setInterventionStatus, payload);
  },
  listFormVariables(payload: { requesterRole: Role }): Promise<FormVariableDef[]> {
    return sessionCall(window.gtsApi.listFormVariables, payload);
  },
  saveFormVariables(payload: {
    requesterRole: Role;
    requesterUsername: string;
    variables: FormVariablePayload[];
    deletions?: FormVariableDeletion[];
  }) {
    return sessionCall(window.gtsApi.saveFormVariables, payload);
  },
  listGardiennages(payload: { requesterRole: Role }): Promise<GardiennageEntry[]> {
    return sessionCall(window.gtsApi.listGardiennages, payload);
  },
  getGardiennageTodayInProgressCount(payload: { requesterRole: Role; todayIso: string }) {
    return sessionCall(window.gtsApi.getGardiennageTodayInProgressCount, payload);
  },
  createGardiennage(payload: { requesterRole: Role; requesterUsername: string; id: string } & GardiennageSavePayload) {
    return sessionCall(window.gtsApi.createGardiennage, payload);
  },
  updateGardiennage(
    payload: { requesterRole: Role; requesterUsername: string; id: string; expectedUpdatedAt: string } & GardiennageSavePayload
  ) {
    return sessionCall(window.gtsApi.updateGardiennage, payload);
  },
  setGardiennageStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    requesterDisplayName?: string;
    id: string;
    expectedUpdatedAt: string;
    status: GardiennageStatus;
    cancellationReason?: string;
  }): Promise<GardiennageStatusResult> {
    return sessionCall(window.gtsApi.setGardiennageStatus, payload) as Promise<GardiennageStatusResult>;
  },
  requestGardiennageCancellation(payload: {
    requesterRole: Role;
    requesterUsername: string;
    requesterDisplayName?: string;
    id: string;
    reason: string;
  }) {
    return sessionCall(window.gtsApi.requestGardiennageCancellation, payload);
  },
  reviewGardiennageCancellation(payload: {
    requesterRole: Role;
    requesterUsername: string;
    requesterDisplayName?: string;
    id: string;
    decision: "approve" | "reject";
  }): Promise<GardiennageStatusResult> {
    return sessionCall(window.gtsApi.reviewGardiennageCancellation, payload) as Promise<GardiennageStatusResult>;
  },
  deleteGardiennage(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteGardiennage, payload);
  },
  closeGardiennage(
    payload: {
      requesterRole: Role;
      requesterUsername: string;
      id: string;
      expectedUpdatedAt: string;
    } & GardiennageClosePayload
  ) {
    return sessionCall(window.gtsApi.closeGardiennage, payload);
  },
  reopenGardiennage(payload: { requesterRole: Role; requesterUsername: string; id: string; expectedUpdatedAt: string }) {
    return sessionCall(window.gtsApi.reopenGardiennage, payload);
  },
  async logout(): Promise<{ success: boolean }> {
    const prev = getGtsApiSessionToken();
    setGtsApiSessionToken(null);
    if (!prev) return { success: true };
    try {
      return await window.gtsApi.logout({ sessionToken: prev });
    } catch {
      return { success: true };
    }
  }
};
