/**
 * Client TypeScript des appels `window.gtsApi` (preload Electron).
 *
 * Ajoute le jeton de session, typage des payloads/réponses et déconnexion automatique
 * sur erreurs `SESSION_EXPIRED` / `SESSION_INVALID`. Point d'entrée unique des features vers le backend.
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
  ManagerProfile,
  PageAccess,
  Role,
  SiteRef,
  User
} from "../../types";
import type { MainCouranteEntry, MainCouranteSavePayload } from "../../features/mainCourante/model/mainCourante.types";
import type {
  InterventionEntry,
  PendingInterventionIntervenant,
  InterventionSavePayload,
  PendingInterventionSite
} from "../../features/intervention/model/intervention.types";
import type {
  RondeEntry,
  RondeMotifTypeRef,
  RondeOriginKind,
  RondeSavePayload,
  RondeSource,
  RondeStatus
} from "../../features/rondes/model/ronde.types";
import type {
  RondeClosureFieldType,
  RondePlannedProfilePayload,
  RondePlannedProfileRef
} from "../../features/rondes/model/rondePlanned.types";
import type { FormVariableDef, FormVariablePayload } from "../../features/settings/model/formVariables.types";
import type { GardiennageEntry, GardiennageSavePayload } from "../../features/gardiennage/model/gardiennage.types";

export type DbConfig = { configured: boolean; dbPath: string | null; isDev?: boolean };
export type DbHealth = { configured: boolean; writable: boolean };
export type WriterQueueStats = { available: boolean; incoming: number; processing: number; ack: number };
export type WriterNodeIdentity = { hostname: string; host: string; whoami: string };
export type WriterStatus = {
  enabled: boolean;
  role: "master" | "backup" | "client" | "disabled";
  transportMode?: "http" | "smb_queue" | string;
  configPath: string | null;
  sharedRoot?: string | null;
  policy: string | null;
  masterHost: string | null;
  masterPort: number | null;
  backupHost: string | null;
  backupPort: number | null;
  failoverEnabled: boolean;
  connectivity: {
    masterReachable: boolean | null;
    backupReachable: boolean | null;
  };
  alertActive: boolean;
  localHostname: string;
  localWhoami: string;
  writerLogDir?: string;
  writerLogFile?: string;
};
export type ArchiveStatus = {
  lastLogicalRunAt: string | null;
  lastLogicalResult: unknown;
  lastQuarterRotationAt: string | null;
  lastQuarterFrom: string | null;
  lastQuarterTo: string | null;
  lastError: string | null;
  pendingJobs: number;
  lastArchiveBatchAt?: string | null;
  archiveSession?: {
    active: boolean;
    openedBy: string | null;
    openedAt: string | null;
    sourceDbPath: string | null;
    activeDbPath: string | null;
  } | null;
  delayDays: number;
  schedulerIntervalMs: number;
  quarterKey: string;
  dbPath: string | null;
};
export type DatabaseItem = {
  path: string;
  name: string;
  isActive: boolean;
  isSourceActive?: boolean;
  lastModifiedAt: string;
};

let gtsSessionToken: string | null = null;
let onSessionExpiredCallback: (() => void) | null = null;

/** Met à jour le jeton injecté dans chaque appel authentifié (`SessionProvider`). */
export function setGtsApiSessionToken(token: string | null) {
  gtsSessionToken = token;
}

/** Enregistre un callback appelé automatiquement quand une réponse IPC indique une session expirée. */
export function setOnSessionExpired(cb: () => void) {
  onSessionExpiredCallback = cb;
}

function isSessionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes("SESSION_EXPIRED:") || msg.includes("SESSION_INVALID:");
}

async function guardSession<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isSessionError(err) && onSessionExpiredCallback) {
      onSessionExpiredCallback();
    }
    throw err;
  }
}

function withSession<P extends object>(payload: P): P & { sessionToken: string } {
  if (!gtsSessionToken) {
    throw new Error("Session requise. Connectez-vous.");
  }
  return { ...payload, sessionToken: gtsSessionToken };
}

function withSessionOnly(): { sessionToken: string } {
  if (!gtsSessionToken) {
    throw new Error("Session requise. Connectez-vous.");
  }
  return { sessionToken: gtsSessionToken };
}

/** Enveloppe un appel IPC authentifié ; déclenche la déconnexion si la session est invalide ou expirée. */
function auth<T>(fn: () => Promise<T>): Promise<T> {
  return guardSession(fn);
}


/** Façade métier : une méthode par canal `gtsApi` / IPC. */
export const gtsApiClient = {
  getDbConfig(): Promise<DbConfig> {
    return window.gtsApi.getDbConfig(gtsSessionToken ? { sessionToken: gtsSessionToken } : undefined);
  },
  getArchiveStatus(): Promise<ArchiveStatus> {
    return window.gtsApi.getArchiveStatus(gtsSessionToken ? { sessionToken: gtsSessionToken } : undefined);
  },
  listDatabases(): Promise<{
    activeDbPath: string | null;
    sourceDbPath?: string | null;
    archiveSession?: ArchiveStatus["archiveSession"];
    items: DatabaseItem[];
  }> {
    return window.gtsApi.listDatabases(gtsSessionToken ? { sessionToken: gtsSessionToken } : undefined);
  },
  switchDatabase(payload: { dbPath: string; requesterRole: Role; requesterUsername: string }): Promise<{
    success: boolean;
    activeDbPath: string;
    sourceDbPath?: string;
    restoredFromArchive?: boolean;
  }> {
    return window.gtsApi.switchDatabase(withSession(payload));
  },
  runArchiveNow(payload: { requesterRole: Role; requesterUsername: string }): Promise<{
    rotation?: unknown;
    logical?: unknown;
    queued?: boolean;
    requestId?: string;
    skipped?: boolean;
    reason?: string;
  }> {
    return window.gtsApi.runArchiveNow(withSession(payload));
  },
  getWriterStatus(): Promise<WriterStatus> {
    return auth(() => window.gtsApi.getWriterStatus(withSessionOnly()));
  },
  getWriterQueueStats(): Promise<WriterQueueStats> {
    return auth(() => window.gtsApi.getWriterQueueStats(withSessionOnly()));
  },
  setDevToolsEnabled(enabled: boolean): Promise<{ success: boolean; enabled: boolean }> {
    return window.gtsApi.setDevToolsEnabled(
      gtsSessionToken ? { enabled, sessionToken: gtsSessionToken } : { enabled }
    );
  },
  getLocalNodeIdentity(): Promise<WriterNodeIdentity> {
    return window.gtsApi.getLocalNodeIdentity(withSessionOnly());
  },
  generateWriterConfig(payload: {
    defaultProfile?: "production" | "development";
    serviceSubnet?: string;
    forceIPv4?: boolean;
    failoverEnabled?: boolean;
    heartbeatIntervalMs?: number;
    writerTimeoutMs?: number;
    retryIntervalMs?: number;
    outputPath?: string;
    master: { hostname: string; host: string; port: number; whoami: string };
    backup: { hostname: string; host: string; port: number; whoami: string };
  }): Promise<{ success: boolean; canceled: boolean; filePath: string | null }> {
    return window.gtsApi.generateWriterConfig(withSession(payload));
  },
  getDocumentTemplate(templateName: string): Promise<{ found: boolean; dataBase64: string | null; sourcePath: string | null }> {
    return window.gtsApi.getDocumentTemplate(withSession({ templateName }));
  },
  listDocumentTemplates(): Promise<{
    templates: Array<{
      kind: "builtin" | "custom";
      templateKey: string;
      title: string;
      fileName: string;
      helpId: string;
      resolvedPath: string | null;
      exists: boolean;
      targetInstallPath: string | null;
    }>;
    writableTemplatesDir: string | null;
  }> {
    return window.gtsApi.listDocumentTemplates(withSessionOnly());
  },
  installDocumentTemplateCopy(targetFileName: string): Promise<{
    canceled: boolean;
    success: boolean;
    fileName?: string;
    resolvedPath?: string | null;
    templatesRelativePath?: string;
  }> {
    return window.gtsApi.installDocumentTemplateCopy(withSession({ targetFileName }));
  },
  listTemplateAssignments(payload: { requesterRole: Role }): Promise<
    Array<{
      id: string;
      flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
      scopeKind: "SITE" | "FAMILLE";
      scopeValue: string;
      scopeLabel: string;
      templateFileName: string;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    return window.gtsApi.listTemplateAssignments(withSession(payload));
  },
  upsertScopedDocumentTemplate(payload: {
    requesterRole: Role;
    requesterUsername: string;
    flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
    scopeKind: "SITE" | "FAMILLE";
    scopeValue: string;
    scopeLabel: string;
  }): Promise<{
    canceled: boolean;
    success: boolean;
    fileName?: string;
    templatesRelativePath?: string;
    assignment?: {
      id: string;
      flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
      scopeKind: "SITE" | "FAMILLE";
      scopeValue: string;
      scopeLabel: string;
      templateFileName: string;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return window.gtsApi.upsertScopedDocumentTemplate(withSession(payload));
  },
  deleteTemplateAssignment(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteTemplateAssignment(withSession(payload));
  },
  resolveTemplateFileForContext(payload: {
    requesterRole: Role;
    flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
    siteId?: string | null;
    famille?: string | null;
  }): Promise<{ templateFileName: string | null }> {
    return window.gtsApi.resolveTemplateFileForContext(withSession(payload));
  },
  openTemplatesFolder(): Promise<{ success: boolean; path: string | null; error: string | null }> {
    return window.gtsApi.openTemplatesFolder(withSessionOnly());
  },
  openWriterLogFolder(): Promise<{ success: boolean; path: string; error: string | null }> {
    return window.gtsApi.openWriterLogFolder(withSessionOnly());
  },
  getDbHealth(): Promise<DbHealth> {
    return window.gtsApi.getDbHealth(gtsSessionToken ? { sessionToken: gtsSessionToken } : undefined);
  },
  quitApp(): Promise<{ success: boolean }> {
    // Pas de session requise (écran de connexion, croix fenêtre) : action locale.
    return window.gtsApi.quitApp();
  },
  minimizeApp(): Promise<{ success: boolean }> {
    return window.gtsApi.minimizeApp();
  },
  /** Utilise le jeton IPC courant (mis à jour à la connexion) pour éviter une closure obsolète dans les presenters. */
  chooseDbPath(): Promise<{ configured: boolean; dbPath: string | null; canceled: boolean }> {
    return window.gtsApi.chooseDbPath(gtsSessionToken ?? null);
  },
  login(payload: LoginPayload): Promise<{ user: User; sessionToken: string }> {
    return window.gtsApi.login(payload);
  },
  getAdminAccessStatus(): Promise<{ enabled: boolean }> {
    return window.gtsApi.getAdminAccessStatus();
  },
  firstLogin(payload: {
    username: string;
    temporaryPassword: string;
    newPassword: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.firstLogin(payload);
  },
  unlockUser(payload: { requesterRole: Role; requesterUsername: string; username: string }): Promise<{ success: boolean }> {
    return auth(() => window.gtsApi.unlockUser(withSession(payload)));
  },
  getActiveSessions(): Promise<{ activeUsernames: string[] }> {
    return auth(() => window.gtsApi.getActiveSessions(withSession({})));
  },
  setAdminCode(payload: { requesterRole: Role; requesterUsername: string; code: string }): Promise<{ success: boolean }> {
    return auth(() => window.gtsApi.setAdminCode(withSession(payload)));
  },
  listUsers(payload: { requesterRole: Role; requesterUsername: string }): Promise<User[]> {
    return auth(() => window.gtsApi.listUsers(withSession(payload)));
  },
  createUser(payload: {
    requesterRole: Role;
    requesterUsername: string;
    username: string;
    fullName: string;
    role: Exclude<Role, "DEV">;
    managerProfile: ManagerProfile | null;
    pageAccess: PageAccess;
  }): Promise<{ user: User; temporaryPassword: string }> {
    return window.gtsApi.createUser(withSession(payload));
  },
  updateUserProfile(payload: {
    requesterRole: Role;
    requesterUsername: string;
    username: string;
    fullName: string;
    newRole: Exclude<Role, "DEV">;
    managerProfile: ManagerProfile | null;
    pageAccess: PageAccess;
    mustResetPassword: boolean;
  }): Promise<{ success: boolean; temporaryPassword: string | null }> {
    return window.gtsApi.updateUserProfile(withSession(payload));
  },
  deactivateUser(payload: {
    requesterRole: Role;
    requesterUsername: string;
    username: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deactivateUser(withSession(payload));
  },
  listAuditLogs(payload: { requesterRole: Role; requesterUsername: string; limit?: number }): Promise<AuditLog[]> {
    return window.gtsApi.listAuditLogs(withSession(payload));
  },
  getAuditMetadata(payload: { requesterRole: Role; requesterUsername: string }): Promise<{
    firstOccurredAt: string | null;
    lastOccurredAt: string | null;
    total: number;
  }> {
    return window.gtsApi.getAuditMetadata(withSession(payload));
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
  }): Promise<{ success: boolean }> {
    return window.gtsApi.logBulkImportAudit(withSession(payload));
  },
  getUserPreferences(payload: { requesterRole: Role; requesterUsername: string }): Promise<{ themeMode: "dark" | "light" }> {
    return window.gtsApi.getUserPreferences(withSession(payload));
  },
  setUserPreferences(payload: {
    requesterRole: Role;
    requesterUsername: string;
    themeMode: "dark" | "light";
  }): Promise<{ success: boolean; themeMode: "dark" | "light" }> {
    return window.gtsApi.setUserPreferences(withSession(payload));
  },
  listSites(payload: { requesterRole: Role }): Promise<SiteRef[]> {
    return window.gtsApi.listSites(withSession(payload));
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
  }): Promise<{ success: boolean }> {
    return window.gtsApi.createSite(withSession(payload));
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
    auditMode?: "single" | "batch";
  }): Promise<{ success: boolean }> {
    return window.gtsApi.updateSite(withSession(payload));
  },
  deleteSite(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteSite(withSession(payload));
  },
  listIntervenants(payload: { requesterRole: Role }): Promise<IntervenantRef[]> {
    return window.gtsApi.listIntervenants(withSession(payload));
  },
  createIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    name: string;
    auditMode?: "single" | "batch";
  }): Promise<{ success: boolean }> {
    return window.gtsApi.createIntervenant(withSession(payload));
  },
  updateIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    name: string;
    auditMode?: "single" | "batch";
  }): Promise<{ success: boolean }> {
    return window.gtsApi.updateIntervenant(withSession(payload));
  },
  deleteIntervenant(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteIntervenant(withSession(payload));
  },
  listAnomalyTypes(payload: { requesterRole: Role }): Promise<AnomalyTypeRef[]> {
    return window.gtsApi.listAnomalyTypes(withSession(payload));
  },
  createAnomalyType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    label: string;
    colorHex?: string;
    auditMode?: "single" | "batch";
  }): Promise<{ success: boolean }> {
    return window.gtsApi.createAnomalyType(withSession(payload));
  },
  updateAnomalyType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    label: string;
    colorHex?: string;
    auditMode?: "single" | "batch";
  }): Promise<{ success: boolean }> {
    return window.gtsApi.updateAnomalyType(withSession(payload));
  },
  deleteAnomalyType(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteAnomalyType(withSession(payload));
  },
  listHolidays(payload: { requesterRole: Role }): Promise<HolidayRef[]> {
    return window.gtsApi.listHolidays(withSession(payload));
  },
  createHoliday(payload: {
    requesterRole: Role;
    requesterUsername: string;
    dateIso: string;
    label: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.createHoliday(withSession(payload));
  },
  updateHoliday(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    dateIso: string;
    label: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.updateHoliday(withSession(payload));
  },
  deleteHoliday(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteHoliday(withSession(payload));
  },
  listFransorResponsables(payload: { requesterRole: Role }): Promise<FransorResponsableRef[]> {
    return window.gtsApi.listFransorResponsables(withSession(payload));
  },
  createFransorResponsable(payload: {
    requesterRole: Role;
    requesterUsername: string;
    name: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.createFransorResponsable(withSession(payload));
  },
  updateFransorResponsable(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    name: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.updateFransorResponsable(withSession(payload));
  },
  deleteFransorResponsable(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteFransorResponsable(withSession(payload));
  },
  listFransorClosures(payload: { requesterRole: Role; month: string }): Promise<FransorClosure[]> {
    return window.gtsApi.listFransorClosures(withSession(payload));
  },
  upsertFransorClosure(payload: {
    id?: string;
    requesterRole: Role;
    requesterUsername: string;
    startDate: string;
    endDate?: string;
    label: string;
    mode: "CLOSED" | "OPEN";
  }): Promise<{ success: boolean }> {
    return window.gtsApi.upsertFransorClosure(withSession(payload));
  },
  deleteFransorClosure(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteFransorClosure(withSession(payload));
  },
  listFransorEntriesByMonth(payload: { requesterRole: Role; month: string }): Promise<FransorEntry[]> {
    return window.gtsApi.listFransorEntriesByMonth(withSession(payload));
  },
  upsertFransorEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    date: string;
    responsableId: string;
    ouvertureDone: boolean;
    fermetureDone: boolean;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.upsertFransorEntry(withSession(payload));
  },
  listFransorMonthlyRecap(payload: { requesterRole: Role; month: string }): Promise<FransorMonthlyRecap[]> {
    return window.gtsApi.listFransorMonthlyRecap(withSession(payload));
  },
  listMainCouranteEntries(payload: { requesterRole: Role }): Promise<MainCouranteEntry[]> {
    return window.gtsApi.listMainCouranteEntries(withSession(payload));
  },
  getMainCouranteUnconsultedCount(payload: { requesterRole: Role }): Promise<{ count: number }> {
    return window.gtsApi.getMainCouranteUnconsultedCount(withSession(payload));
  },
  markMainCouranteEntryConsulted(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.markMainCouranteEntryConsulted(withSession(payload));
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
  }): Promise<MainCouranteEntry> {
    return window.gtsApi.createMainCouranteEntry(withSession(payload));
  },
  updateMainCouranteEntryOperator(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    requesterFullName: string;
  } & MainCouranteSavePayload): Promise<MainCouranteEntry> {
    return window.gtsApi.updateMainCouranteEntryOperator(withSession(payload));
  },
  applyMainCouranteManagerAction(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    managerName: string;
    managerObservation: string;
    decision: "suivre" | "cloture";
  }): Promise<MainCouranteEntry> {
    return window.gtsApi.applyMainCouranteManagerAction(withSession(payload));
  },
  reopenMainCouranteEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    managerName: string;
  }): Promise<MainCouranteEntry> {
    return window.gtsApi.reopenMainCouranteEntry(withSession(payload));
  },
  listInterventions(payload: { requesterRole: Role }): Promise<InterventionEntry[]> {
    return window.gtsApi.listInterventions(withSession(payload));
  },
  getInterventionOpenCount(payload: { requesterRole: Role }): Promise<{ count: number }> {
    return window.gtsApi.getInterventionOpenCount(withSession(payload));
  },
  createInterventionEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
  } & InterventionSavePayload): Promise<InterventionEntry> {
    return window.gtsApi.createInterventionEntry(withSession(payload));
  },
  updateInterventionEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
  } & InterventionSavePayload): Promise<InterventionEntry> {
    return window.gtsApi.updateInterventionEntry(withSession(payload));
  },
  setInterventionStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    status: "EN_COURS" | "CLOTURE" | "ANNULE";
    cancellationReason?: string;
  }): Promise<InterventionEntry> {
    return window.gtsApi.setInterventionStatus(withSession(payload));
  },
  setInterventionBillingStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    billingStatus: "FACTURABLE" | "NON_FACTURABLE";
    reason?: string;
  }): Promise<InterventionEntry> {
    return window.gtsApi.setInterventionBillingStatus(withSession(payload));
  },
  listPendingInterventionSites(payload: { requesterRole: Role }): Promise<PendingInterventionSite[]> {
    return window.gtsApi.listPendingInterventionSites(withSession(payload));
  },
  createPendingInterventionSite(payload: {
    requesterRole: Role;
    requesterUsername: string;
    code: string;
    name: string;
  }): Promise<{ success: boolean; alreadyExists: boolean }> {
    return window.gtsApi.createPendingInterventionSite(withSession(payload));
  },
  resolvePendingInterventionSite(payload: {
    requesterRole: Role;
    requesterUsername: string;
    pendingId: string;
    parc: string;
    famille: string;
  }): Promise<{ success: boolean; siteId: string; alreadyExists: boolean }> {
    return window.gtsApi.resolvePendingInterventionSite(withSession(payload));
  },
  deletePendingInterventionSite(payload: {
    requesterRole: Role;
    requesterUsername: string;
    pendingId: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deletePendingInterventionSite(withSession(payload));
  },
  listPendingInterventionIntervenants(payload: { requesterRole: Role }): Promise<PendingInterventionIntervenant[]> {
    return window.gtsApi.listPendingInterventionIntervenants(withSession(payload));
  },
  createPendingInterventionIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    name: string;
  }): Promise<{ success: boolean; alreadyExists: boolean }> {
    return window.gtsApi.createPendingInterventionIntervenant(withSession(payload));
  },
  resolvePendingInterventionIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    pendingId: string;
    name?: string;
  }): Promise<{ success: boolean; intervenantId: string; alreadyExists: boolean }> {
    return window.gtsApi.resolvePendingInterventionIntervenant(withSession(payload));
  },
  deletePendingInterventionIntervenant(payload: {
    requesterRole: Role;
    requesterUsername: string;
    pendingId: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deletePendingInterventionIntervenant(withSession(payload));
  },
  listRondes(payload: { requesterRole: Role }): Promise<RondeEntry[]> {
    return window.gtsApi.listRondes(withSession(payload));
  },
  createRondeEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    source: RondeSource;
    originInterventionId?: string | null;
    plannedProfileId?: string | null;
    plannedRoundKind?: string | null;
    plannedSlotKey?: string | null;
    initialStatus?: RondeStatus;
    cancellationReason?: string;
    /** Snapshot JSON (ronde exceptionnelle, rejouer « Demande liée »). */
    requestPlanningSnapshotJson?: string | null;
    /** Regroupe plusieurs fiches d’une même demande exceptionnelle. */
    requestBatchId?: string | null;
  } & RondeSavePayload): Promise<RondeEntry> {
    return window.gtsApi.createRondeEntry(withSession(payload));
  },
  updateRondeEntry(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
  } & RondeSavePayload): Promise<RondeEntry> {
    return window.gtsApi.updateRondeEntry(withSession(payload));
  },
  setRondeStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    status: RondeStatus;
    cancellationReason?: string;
  }): Promise<RondeEntry> {
    return window.gtsApi.setRondeStatus(withSession(payload));
  },
  updateRondeBatchSharedFields(payload: {
    requesterRole: Role;
    requesterUsername: string;
    entryIds: string[];
    siteId: string | null;
    siteDisplay: string;
    motifTypeId: string;
    motifDetail: string;
    originKind: RondeOriginKind;
    originDetail: string;
    intervenantId: string | null;
    intervenantName: string;
    requestPlanningSnapshotJson?: string | null;
  }): Promise<{ ok: boolean; updatedCount: number }> {
    return window.gtsApi.updateRondeBatchSharedFields(withSession(payload));
  },
  bulkCancelRondeBatch(payload: {
    requesterRole: Role;
    requesterUsername: string;
    entryIds: string[];
    reason: string;
  }): Promise<{ ok: boolean; cancelledCount: number; skippedCount: number }> {
    return window.gtsApi.bulkCancelRondeBatch(withSession(payload));
  },
  bulkDeleteRondeBatch(payload: {
    requesterRole: Role;
    requesterUsername: string;
    entryIds: string[];
    reason: string;
  }): Promise<{ ok: boolean; deletedCount: number; skippedCount: number }> {
    return window.gtsApi.bulkDeleteRondeBatch(withSession(payload));
  },
  listRondeMotifTypes(payload: { requesterRole: Role }): Promise<RondeMotifTypeRef[]> {
    return window.gtsApi.listRondeMotifTypes(withSession(payload));
  },
  createRondeMotifType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    label: string;
    requiresFreeText: boolean;
    colorHex: string;
  }): Promise<RondeMotifTypeRef> {
    return window.gtsApi.createRondeMotifType(withSession(payload));
  },
  updateRondeMotifType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    label: string;
    requiresFreeText: boolean;
    colorHex: string;
  }): Promise<RondeMotifTypeRef> {
    return window.gtsApi.updateRondeMotifType(withSession(payload));
  },
  deleteRondeMotifType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteRondeMotifType(withSession(payload));
  },
  listRondePlannedProfiles(payload: { requesterRole: Role }): Promise<RondePlannedProfileRef[]> {
    return window.gtsApi.listRondePlannedProfiles(withSession(payload));
  },
  upsertRondePlannedProfile(
    payload: { requesterRole: Role; requesterUsername: string } & RondePlannedProfilePayload
  ): Promise<RondePlannedProfileRef> {
    return window.gtsApi.upsertRondePlannedProfile(withSession(payload));
  },
  deleteRondePlannedProfile(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    return window.gtsApi.deleteRondePlannedProfile(withSession(payload));
  },
  setRondePlannedProfilePlanningEnd(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    planningEndDate: string;
    reason: string;
  }): Promise<RondePlannedProfileRef> {
    return window.gtsApi.setRondePlannedProfilePlanningEnd(withSession(payload));
  },
  setRondePlannedProfileValidated(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    validated: boolean;
  }): Promise<RondePlannedProfileRef> {
    return window.gtsApi.setRondePlannedProfileValidated(withSession(payload));
  },
  listInterventionWordExtraFields(payload: { requesterRole: Role }): Promise<
    Array<{
      id: string;
      sortOrder: number;
      fieldKey: string;
      label: string;
      fieldType: RondeClosureFieldType;
      placeholder: string;
      options: string[];
      createdAt: string;
      updatedAt: string;
    }>
  > {
    return window.gtsApi.listInterventionWordExtraFields(withSession(payload));
  },
  listFormVariables(payload: { requesterRole: Role }): Promise<FormVariableDef[]> {
    return window.gtsApi.listFormVariables(withSession(payload));
  },
  saveFormVariables(payload: {
    requesterRole: Role;
    requesterUsername: string;
    variables: FormVariablePayload[];
  }): Promise<FormVariableDef[]> {
    return window.gtsApi.saveFormVariables(withSession(payload));
  },
  listGardiennages(payload: { requesterRole: Role }): Promise<GardiennageEntry[]> {
    return window.gtsApi.listGardiennages(withSession(payload));
  },
  createGardiennage(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
  } & GardiennageSavePayload): Promise<GardiennageEntry> {
    return window.gtsApi.createGardiennage(withSession(payload));
  },
  updateGardiennage(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
  } & GardiennageSavePayload): Promise<GardiennageEntry> {
    return window.gtsApi.updateGardiennage(withSession(payload));
  },
  setGardiennageStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    status: import("../../features/gardiennage/model/gardiennage.types").GardiennageStatus;
    cancellationReason?: string;
  }): Promise<GardiennageEntry & {
    batchOperation?: {
      type: "CANCEL";
      isBatch: boolean;
      cancelledCount: number;
      preservedClosedCount: number;
    };
  }> {
    return window.gtsApi.setGardiennageStatus(withSession(payload));
  },
  deleteGardiennage(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
  }): Promise<{ success: boolean; batchId?: string | null; deletedCount?: number; preservedClosedCount?: number }> {
    return window.gtsApi.deleteGardiennage(withSession(payload));
  },
  closeGardiennage(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
  } & import("../../features/gardiennage/model/gardiennage.types").GardiennageClosePayload): Promise<GardiennageEntry> {
    return window.gtsApi.closeGardiennage(withSession(payload));
  },
  reopenGardiennage(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
  }): Promise<GardiennageEntry> {
    return window.gtsApi.reopenGardiennage(withSession(payload));
  },
  async logout(): Promise<{ success: boolean }> {
    const prev = gtsSessionToken;
    gtsSessionToken = null;
    if (!prev) return { success: true };
    try {
      return await window.gtsApi.logout({ sessionToken: prev });
    } catch {
      return { success: true };
    }
  }


};
