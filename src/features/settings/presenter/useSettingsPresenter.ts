import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient, type ArchiveStatus, type DatabaseItem } from "../../../infrastructure/api/gtsApiClient";
import type { ConfirmDialogState, CreateUserFormState, DataTab, SettingsTab } from "../model/settings.types";
import type { AnomalyTypeRef, AuditLog, FransorResponsableRef, HolidayRef, IntervenantRef, SiteRef, User } from "../../../types";
import type { PendingInterventionSite } from "../../intervention/model/intervention.types";
import type { PendingInterventionIntervenant } from "../../intervention/model/intervention.types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import type {
  RondePlannedProfilePayload,
  RondePlannedProfileRef
} from "../../rondes/model/rondePlanned.types";
import { exportAuditLogsToExcel } from "../export/auditExcelExport";
import type { WriterConfigDraft } from "../components/WriterConfigGeneratorPanel";
import { canSessionResetPasswordOrUnlockForUser } from "../model/userHierarchy";

function getErrorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  return err.message.replace("Error invoking remote method", "").replace(/^[:\s-]+/, "").trim() || fallback;
}

function formatArchiveReason(reason?: string) {
  const normalized = String(reason || "").trim().toLowerCase();
  if (!normalized) return "Archivage refusé.";
  if (normalized === "db_not_configured") return "Archivage refusé : aucune base active n'est configurée.";
  if (normalized === "already_on_current_quarter") return "Archivage refusé : le trimestre courant est déjà archivé.";
  if (normalized === "q1_keeps_primary_db") return "Archivage refusé : le trimestre courant conserve la base principale.";
  if (normalized === "queue_smb_unavailable") return "Archivage refusé : file SMB indisponible.";
  return `Archivage refusé : ${reason}`;
}

const defaultConfirmDialog: ConfirmDialogState = {
  isOpen: false,
  title: "",
  message: "",
  confirmLabel: "Confirmer",
  confirmClassName: "",
  onConfirm: null
};

/** Aligné sur `ensureStationAdminAccess` : gestion complète des comptes + journal (pas le superviseur métier). */
function canFullStationAdminUsers(session: Session | null): boolean {
  const role = session?.user.role;
  const managerProfile = session?.user.managerProfile;
  if (role === "DEV") return true;
  if (role !== "RESPONSABLE") return false;
  return managerProfile === "DIRECTEUR_STATION" || managerProfile === "RESPONSABLE_STATION";
}

/** Superviseur : liste des comptes et réinitialisation MDP uniquement (pas les accès pages ni création). */
function isSuperviseurPasswordDesk(session: Session | null): boolean {
  return Boolean(session?.user.role === "RESPONSABLE" && session.user.managerProfile === "SUPERVISEUR");
}

function canEditPageAccess(session: Session) {
  const role = session?.user.role;
  const managerProfile = session?.user.managerProfile;
  if (role === "DEV") return true;
  return role === "RESPONSABLE" && (managerProfile === "DIRECTEUR_STATION" || managerProfile === "RESPONSABLE_STATION");
}

function getDefaultPageAccessByRole(role: "RESPONSABLE" | "OPERATEUR") {
  if (role === "RESPONSABLE") {
    return { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: true, gardiennage: true };
  }
  return { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: false, gardiennage: true };
}

export function useSettingsPresenter({
  session,
  onError,
  onInfo,
  onToast,
  onCredentialsReady
}: {
  session: Session;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
  onToast: (message: string) => void;
  onCredentialsReady: (value: { username: string; temporaryPassword: string } | null) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUsernames, setActiveUsernames] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditMetadata, setAuditMetadata] = useState<{ firstOccurredAt: string | null; lastOccurredAt: string | null; total: number }>({
    firstOccurredAt: null,
    lastOccurredAt: null,
    total: 0
  });
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [intervenants, setIntervenants] = useState<IntervenantRef[]>([]);
  const [anomalyTypes, setAnomalyTypes] = useState<AnomalyTypeRef[]>([]);
  const [holidays, setHolidays] = useState<HolidayRef[]>([]);
  const [rondeMotifTypes, setRondeMotifTypes] = useState<RondeMotifTypeRef[]>([]);
  const [rondePlannedProfiles, setRondePlannedProfiles] = useState<RondePlannedProfileRef[]>([]);
  const [fransorResponsables, setFransorResponsables] = useState<FransorResponsableRef[]>([]);
  const [interventionPendingSites, setInterventionPendingSites] = useState<PendingInterventionSite[]>([]);
  const [interventionPendingIntervenants, setInterventionPendingIntervenants] = useState<PendingInterventionIntervenant[]>([]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("operators");
  const [activeDataTab, setActiveDataTab] = useState<DataTab>("sites");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"create" | "edit">("create");
  const [editingTechnicalUsername, setEditingTechnicalUsername] = useState<string>("");
  const [createForm, setCreateForm] = useState<CreateUserFormState>({
    username: "",
    role: "OPERATEUR",
    managerProfile: "SUPERVISEUR",
    mustResetPassword: false,
    pageAccess: { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: false, gardiennage: true }
  });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(defaultConfirmDialog);
  const [dbConfigured, setDbConfigured] = useState<boolean | null>(null);
  const [dbPath, setDbPath] = useState<string>("");
  const [dbWritable, setDbWritable] = useState<boolean>(false);
  const [databaseItems, setDatabaseItems] = useState<DatabaseItem[]>([]);
  const [activeDatabasePath, setActiveDatabasePath] = useState<string | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatus | null>(null);
  const [writerConfigDraft, setWriterConfigDraft] = useState<WriterConfigDraft>({
    serviceSubnet: "192.168.111.0/24",
    heartbeatIntervalMs: 3000,
    writerTimeoutMs: 15000,
    retryIntervalMs: 5000,
    master: { hostname: "", host: "", port: 4711, whoami: "" },
    backup: { hostname: "", host: "", port: 4811, whoami: "" }
  });

  const resetUserForm = useCallback(() => {
    setCreateForm({
      username: "",
      role: "OPERATEUR",
      managerProfile: "SUPERVISEUR",
      mustResetPassword: false,
      pageAccess: { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: false, gardiennage: true }
    });
  }, []);

  const canManageUsers = useMemo(() => canFullStationAdminUsers(session), [session]);
  const canAccessOperatorsTab = useMemo(
    () => canFullStationAdminUsers(session) || isSuperviseurPasswordDesk(session),
    [session]
  );
  const canManagePageAccess = useMemo(() => canEditPageAccess(session), [session]);
  const canDeleteData = useMemo(() => {
    const role = session?.user.role;
    return role === "RESPONSABLE" || role === "DEV";
  }, [session]);
  const canManageData = useMemo(() => Boolean(session), [session]);
  const hasArchiveSourceActive = useMemo(() => Boolean(archiveStatus?.archiveSession?.active), [archiveStatus]);
  const archiveOpenedBy = useMemo(() => archiveStatus?.archiveSession?.openedBy || null, [archiveStatus]);

  useEffect(() => {
    const initDbConfig = async () => {
      try {
        const cfg = await gtsApiClient.getDbConfig();
        setDbConfigured(cfg.configured);
        setDbPath(cfg.dbPath || "");
      } catch {
        setDbConfigured(false);
      }
    };
    void initDbConfig();
  }, []);

  useEffect(() => {
    const loadDbHealth = async () => {
      try {
        const health = await gtsApiClient.getDbHealth();
        setDbWritable(Boolean(health.configured && health.writable));
      } catch {
        setDbWritable(false);
      }
    };
    void loadDbHealth();
    const timer = setInterval(() => {
      void loadDbHealth();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const onChooseDbPath = useCallback(async () => {
    onError("");
    try {
      const result = await gtsApiClient.chooseDbPath();
      setDbConfigured(result.configured);
      setDbPath(result.dbPath || "");
      const health = await gtsApiClient.getDbHealth();
      setDbWritable(Boolean(health.configured && health.writable));
      try {
        const dbList = await gtsApiClient.listDatabases();
        setDatabaseItems(dbList.items);
        setActiveDatabasePath(dbList.activeDbPath);
        if (dbList.archiveSession) {
          setArchiveStatus((prev) => (prev ? { ...prev, archiveSession: dbList.archiveSession } : prev));
        }
      } catch {
        // Ignore refresh error after choosing DB.
      }
      if (!result.canceled && result.configured) {
        onToast("Emplacement de base de données enregistré.");
      }
    } catch (err) {
      onError(getErrorMessage(err, "Impossible de sélectionner la base de données."));
    }
  }, [onError, onToast]);

  const loadDatabaseList = useCallback(async () => {
    onError("");
    try {
      const dbList = await gtsApiClient.listDatabases();
      setDatabaseItems(dbList.items);
      setActiveDatabasePath(dbList.activeDbPath);
      if (dbList.archiveSession) {
        setArchiveStatus((prev) => ({
          ...(prev || {
            lastLogicalRunAt: null,
            lastLogicalResult: null,
            lastQuarterRotationAt: null,
            lastQuarterFrom: null,
            lastQuarterTo: null,
            lastError: null,
            pendingJobs: 0,
            delayDays: 10,
            schedulerIntervalMs: 0,
            quarterKey: "",
            dbPath: dbList.activeDbPath || null
          }),
          archiveSession: dbList.archiveSession,
          dbPath: dbList.activeDbPath || null
        }));
      }
      if (dbList.activeDbPath) {
        setDbPath(dbList.activeDbPath);
      }
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des bases de données."));
    }
  }, [onError]);

  const loadArchiveStatus = useCallback(async () => {
    onError("");
    try {
      const status = await gtsApiClient.getArchiveStatus();
      setArchiveStatus(status);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement du statut d'archivage."));
    }
  }, [onError]);

  const onSwitchDatabase = useCallback(
    async (nextDbPath: string) => {
      if (!session) return;
      onError("");
      try {
        const switchResult = await gtsApiClient.switchDatabase({
          dbPath: nextDbPath,
          requesterRole: session.user.role,
          requesterUsername: session.user.username
        });
        const [cfg, health] = await Promise.all([gtsApiClient.getDbConfig(), gtsApiClient.getDbHealth()]);
        setDbConfigured(cfg.configured);
        setDbPath(cfg.dbPath || "");
        setDbWritable(Boolean(health.configured && health.writable));
        await Promise.all([loadDatabaseList(), loadArchiveStatus()]);
        if (switchResult.restoredFromArchive) {
          onToast(
            `Archive restaurée en base active. Source: ${switchResult.sourceDbPath || nextDbPath} -> Active: ${cfg.dbPath || "inconnue"}`
          );
        } else {
          onToast(`Base active changée : ${cfg.dbPath || "inconnue"}`);
        }
      } catch (err) {
        onError(getErrorMessage(err, "Impossible de basculer vers cette base."));
      }
    },
    [loadArchiveStatus, loadDatabaseList, onError, onToast, session]
  );

  const onRunArchiveNow = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const result = await gtsApiClient.runArchiveNow({
        requesterRole: session.user.role,
        requesterUsername: session.user.username
      });
      if (result.skipped) {
        onError(formatArchiveReason(result.reason));
        return;
      }
      if (result.queued) {
        onToast("Archivage mis en file d'attente.");
      } else {
        const rotation = result.rotation as { rotated?: boolean; reason?: string } | undefined;
        if (rotation && rotation.rotated === false) {
          onToast(`Archivage exécuté : ${formatArchiveReason(rotation.reason).replace("Archivage refusé : ", "")}`);
        } else {
          onToast("Archivage lancé.");
        }
      }
      await loadArchiveStatus();
    } catch (err) {
      onError(getErrorMessage(err, "Impossible de lancer l'archivage."));
    }
  }, [loadArchiveStatus, onError, onToast, session]);

  const onRestoreLocalActiveDb = useCallback(async () => {
    if (!dbPath) {
      onError("Base active locale introuvable.");
      return;
    }
    await onSwitchDatabase(dbPath);
  }, [dbPath, onError, onSwitchDatabase]);

  useEffect(() => {
    void loadDatabaseList();
  }, [loadDatabaseList]);

  useEffect(() => {
    void loadArchiveStatus();
  }, [loadArchiveStatus]);

  const onOpenWriterLogFolder = useCallback(async () => {
    onError("");
    try {
      const result = await gtsApiClient.openWriterLogFolder();
      if (!result.success) {
        onError(result.error || "Impossible d'ouvrir le dossier des logs writer.");
        return;
      }
      onToast("Dossier des logs writer ouvert.");
    } catch (err) {
      onError(getErrorMessage(err, "Impossible d'ouvrir le dossier des logs writer."));
    }
  }, [onError, onToast]);

  const onPrefillWriterNode = useCallback(
    async (target: "master" | "backup") => {
      onError("");
      try {
        const local = await gtsApiClient.getLocalNodeIdentity();
        setWriterConfigDraft((prev) => ({
          ...prev,
          [target]: {
            ...prev[target],
            hostname: local.hostname,
            host: local.host,
            whoami: local.whoami
          }
        }));
        onToast(`Champs ${target === "master" ? "Master" : "Backup"} préremplis avec le poste local.`);
      } catch (err) {
        onError(getErrorMessage(err, "Impossible de lire les informations du poste local."));
      }
    },
    [onError, onToast]
  );

  const onGenerateWriterConfig = useCallback(async () => {
    onError("");
    try {
      const result = await gtsApiClient.generateWriterConfig({
        ...writerConfigDraft,
        defaultProfile: "production",
        forceIPv4: true,
        failoverEnabled: true
      });
      if (result.canceled) return;
      onToast(`Configuration writer générée: ${result.filePath || "chemin inconnu"}`);
      await loadDatabaseList();
    } catch (err) {
      onError(getErrorMessage(err, "Impossible de générer la configuration writer."));
    }
  }, [loadDatabaseList, onError, onToast, writerConfigDraft]);

  const loadUsers = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const [data, sessions] = await Promise.all([
        gtsApiClient.listUsers({ requesterRole: session.user.role, requesterUsername: session.user.username }),
        gtsApiClient.getActiveSessions().catch(() => ({ activeUsernames: [] }))
      ]);
      setUsers(data);
      setActiveUsernames(sessions.activeUsernames);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement."));
    }
  }, [onError, session]);

  useEffect(() => {
    if (!session) {
      setActiveUsernames([]);
      return;
    }
    let cancelled = false;
    const refreshActiveSessions = async () => {
      try {
        const sessions = await gtsApiClient.getActiveSessions();
        if (!cancelled) setActiveUsernames(sessions.activeUsernames);
      } catch {
        // Conserver le dernier état connu si un refresh ponctuel échoue.
      }
    };
    void refreshActiveSessions();
    const timer = setInterval(() => {
      void refreshActiveSessions();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.sessionToken]);

  const onUnlockUser = useCallback(async (username: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.unlockUser({ requesterRole: session.user.role, requesterUsername: session.user.username, username });
      onToast("Compte déverrouillé.");
      await loadUsers();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de déverrouillage."));
    }
  }, [onError, onToast, session, loadUsers]);

  const loadAuditLogs = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const rows = await gtsApiClient.listAuditLogs({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        limit: 1000
      });
      setAuditLogs(rows);
      const metadata = await gtsApiClient.getAuditMetadata({
        requesterRole: session.user.role,
        requesterUsername: session.user.username
      });
      setAuditMetadata(metadata);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement du journal."));
    }
  }, [onError, session]);

  const onExportAuditLogs = useCallback((logs?: AuditLog[]) => {
    const exportRows = Array.isArray(logs) ? logs : auditLogs;
    exportAuditLogsToExcel(exportRows);
  }, [auditLogs]);

  const loadSites = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listSites({ requesterRole: session.user.role });
      setSites(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des sites."));
    }
  }, [onError, session]);

  const loadIntervenants = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listIntervenants({ requesterRole: session.user.role });
      setIntervenants(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des intervenants."));
    }
  }, [onError, session]);

  const loadAnomalyTypes = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listAnomalyTypes({ requesterRole: session.user.role });
      setAnomalyTypes(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des types d'anomalie."));
    }
  }, [onError, session]);

  const loadRondeMotifTypes = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listRondeMotifTypes({ requesterRole: session.user.role });
      setRondeMotifTypes(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des motifs de ronde."));
    }
  }, [onError, session]);

  const loadHolidays = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listHolidays({ requesterRole: session.user.role });
      setHolidays(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des jours fériés."));
    }
  }, [onError, session]);

  const loadRondePlannedProfiles = useCallback(async () => {
    if (!session) return;
    try {
      const data = await gtsApiClient.listRondePlannedProfiles({ requesterRole: session.user.role });
      setRondePlannedProfiles(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des profils de planification des rondes."));
    }
  }, [onError, session]);

  const loadFransorResponsables = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listFransorResponsables({ requesterRole: session.user.role });
      setFransorResponsables(data);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de chargement des responsables Fransor."));
    }
  }, [onError, session]);

  const loadDataSection = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      loadSites(),
      loadIntervenants(),
      loadAnomalyTypes(),
      loadHolidays(),
      loadRondeMotifTypes(),
      loadRondePlannedProfiles(),
      loadFransorResponsables(),
      gtsApiClient
        .listPendingInterventionSites({ requesterRole: session.user.role })
        .then((rows) => setInterventionPendingSites(rows))
        .catch(() => setInterventionPendingSites([])),
      gtsApiClient
        .listPendingInterventionIntervenants({ requesterRole: session.user.role })
        .then((rows) => setInterventionPendingIntervenants(rows))
        .catch(() => setInterventionPendingIntervenants([]))
    ]);
  }, [loadAnomalyTypes, loadFransorResponsables, loadHolidays, loadIntervenants, loadRondeMotifTypes, loadRondePlannedProfiles, loadSites, session]);

  useEffect(() => {
    if (!session) return;
    const refreshMs = 10000;

    if (activeSettingsTab === "operators") {
      if (!canAccessOperatorsTab) return;
      void loadUsers();
      const timer = setInterval(() => {
        void loadUsers();
      }, refreshMs);
      return () => clearInterval(timer);
    }

    if (activeSettingsTab === "data") {
      void loadDataSection();
      const timer = setInterval(() => {
        void loadDataSection();
      }, refreshMs);
      return () => clearInterval(timer);
    }

    if (activeSettingsTab === "database") {
      void loadDatabaseList();
      void loadArchiveStatus();
      const timer = setInterval(() => {
        void loadDatabaseList();
        void loadArchiveStatus();
      }, refreshMs);
      return () => clearInterval(timer);
    }

    if (activeSettingsTab === "audit") {
      if (!canManageUsers) return;
      void loadAuditLogs();
      const timer = setInterval(() => {
        void loadAuditLogs();
      }, refreshMs);
      return () => clearInterval(timer);
    }
  }, [
    activeSettingsTab,
    loadArchiveStatus,
    loadAuditLogs,
    loadDatabaseList,
    loadDataSection,
    loadUsers,
    session,
    canManageUsers,
    canAccessOperatorsTab
  ]);

  useEffect(() => {
    if (canAccessOperatorsTab) {
      if (!canManageUsers && activeSettingsTab === "audit") {
        setActiveSettingsTab("operators");
      }
      return;
    }
    setActiveSettingsTab("data");
  }, [canManageUsers, canAccessOperatorsTab, activeSettingsTab, setActiveSettingsTab]);

  const onCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || !canManageUsers) return;
    onError("");
    onInfo("");
    onCredentialsReady(null);
    try {
      if (userModalMode === "create") {
        const payloadPageAccess = canManagePageAccess ? createForm.pageAccess : getDefaultPageAccessByRole(createForm.role);
        const result = await gtsApiClient.createUser({
          requesterRole: session.user.role,
          requesterUsername: session.user.username,
          username: createForm.username,
          fullName: createForm.username,
          role: createForm.role,
          managerProfile: createForm.role === "RESPONSABLE" ? createForm.managerProfile : null,
          pageAccess: payloadPageAccess
        });
        onInfo("");
        onToast("Utilisateur créé.");
        onCredentialsReady({ username: createForm.username, temporaryPassword: result.temporaryPassword });
      } else {
        const existingUser = users.find((user) => user.username === editingTechnicalUsername);
        const payloadPageAccess = canManagePageAccess
          ? createForm.pageAccess
          : existingUser?.pageAccess || getDefaultPageAccessByRole(createForm.role);
        const result = await gtsApiClient.updateUserProfile({
          requesterRole: session.user.role,
          requesterUsername: session.user.username,
          username: editingTechnicalUsername,
          fullName: createForm.username,
          newRole: createForm.role,
          managerProfile: createForm.role === "RESPONSABLE" ? createForm.managerProfile : null,
          pageAccess: payloadPageAccess,
          mustResetPassword: createForm.mustResetPassword
        });
        onToast("Utilisateur modifié.");
        if (result.temporaryPassword) {
          onCredentialsReady({ username: createForm.username, temporaryPassword: result.temporaryPassword });
        }
      }
      resetUserForm();
      setUserModalMode("create");
      setEditingTechnicalUsername("");
      setShowCreateModal(false);
      await loadUsers();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de creation."));
    }
  };

  const onOpenEditUser = (user: User) => {
    if (user.role === "DEV" || !user.isActive) return;
    setCreateForm({
      username: user.fullName,
      role: user.role,
      managerProfile: user.managerProfile || "SUPERVISEUR",
      mustResetPassword: false,
      pageAccess: user.pageAccess
    });
    setUserModalMode("edit");
    setEditingTechnicalUsername(user.username);
    setShowCreateModal(true);
  };

  const onOpenCreateUserModal = () => {
    setUserModalMode("create");
    setEditingTechnicalUsername("");
    resetUserForm();
    setShowCreateModal(true);
  };

  const onCreateSite = async ({
    code,
    name,
    address,
    parc,
    famille
  }: {
    code: string;
    name: string;
    address: string;
    parc: string;
    famille: string;
  }) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        code,
        name,
        address,
        parc,
        famille
      });
      onToast("Site ajouté.");
      await loadSites();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur d'ajout du site."));
    }
  };

  const onDeleteSite = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteSite({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Site supprimé.");
      await loadSites();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression du site."));
    }
  };

  const onUpdateSite = async (payload: { id: string; code: string; name: string; address: string; parc: string; famille: string }) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        ...payload
      });
      onToast("Site modifié.");
      await loadSites();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de modification du site."));
    }
  };

  const onCreateIntervenant = async (name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        name
      });
      onToast("Intervenant ajouté.");
      await loadIntervenants();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur d'ajout de l'intervenant."));
    }
  };

  const onDeleteIntervenant = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteIntervenant({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Intervenant supprimé.");
      await loadIntervenants();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression de l'intervenant."));
    }
  };

  const onUpdateIntervenant = async (id: string, name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        name
      });
      onToast("Intervenant modifié.");
      await loadIntervenants();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de modification de l'intervenant."));
    }
  };

  const onCreateAnomalyType = async (label: string, colorHex: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createAnomalyType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        label,
        colorHex
      });
      onToast("Type d'anomalie ajouté.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur d'ajout du type d'anomalie."));
    }
  };

  const onDeleteAnomalyType = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteAnomalyType({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Type d'anomalie supprimé.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression du type d'anomalie."));
    }
  };

  const onUpdateAnomalyType = async (id: string, label: string, colorHex: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateAnomalyType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        label,
        colorHex
      });
      onToast("Type d'anomalie modifié.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de modification du type d'anomalie."));
    }
  };

  const onCreateHoliday = async (dateIso: string, label: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createHoliday({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        dateIso,
        label
      });
      onToast("Jour férié ajouté.");
      await loadHolidays();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur d'ajout du jour férié."));
    }
  };

  const onUpdateHoliday = async (id: string, dateIso: string, label: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateHoliday({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        dateIso,
        label
      });
      onToast("Jour férié modifié.");
      await loadHolidays();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de modification du jour férié."));
    }
  };

  const onDeleteHoliday = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteHoliday({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Jour férié supprimé.");
      await loadHolidays();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression du jour férié."));
    }
  };

  const onCreateRondeMotifType = async (label: string, colorHex: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        label,
        colorHex,
        requiresFreeText: false
      });
      onToast("Motif de ronde ajouté.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur d'ajout du motif de ronde."));
    }
  };

  const onUpdateRondeMotifType = async (id: string, label: string, colorHex: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        label,
        colorHex,
        requiresFreeText: false
      });
      onToast("Motif de ronde modifié.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de modification du motif de ronde."));
    }
  };

  const onDeleteRondeMotifType = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Motif de ronde supprimé.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression du motif de ronde."));
    }
  };

  const onUpsertRondePlannedProfile = async (payload: RondePlannedProfilePayload) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.upsertRondePlannedProfile({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        ...payload
      });
      onToast(payload.id ? "Profil de planification mis à jour." : "Profil de planification créé.");
      await loadRondePlannedProfiles();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur à l'enregistrement du profil."));
    }
  };

  const onDeleteRondePlannedProfile = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteRondePlannedProfile({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Profil de planification supprimé.");
      await loadRondePlannedProfiles();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression du profil."));
    }
  };

  const onSetRondePlannedProfilePlanningEnd = async (id: string, planningEndDate: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.setRondePlannedProfilePlanningEnd({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        planningEndDate,
        reason
      });
      onToast("Date de fin de planification enregistrée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      onError(getErrorMessage(err, "Impossible d'enregistrer la fin de planification."));
    }
  };

  const onSetRondePlannedProfileValidated = async (id: string, validated: boolean) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.setRondePlannedProfileValidated({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        validated
      });
      onToast(validated ? "Profil marqué comme validé." : "Validation du profil levée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      onError(getErrorMessage(err, "Impossible de mettre à jour la validation du profil."));
    }
  };

  const onCreateFransorResponsable = async (name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createFransorResponsable({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        name
      });
      onToast("Responsable Fransor ajouté.");
      await loadFransorResponsables();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur d'ajout du responsable Fransor."));
    }
  };

  const onUpdateFransorResponsable = async (id: string, name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateFransorResponsable({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        name
      });
      onToast("Responsable Fransor modifié.");
      await loadFransorResponsables();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de modification du responsable Fransor."));
    }
  };

  const onDeleteFransorResponsable = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteFransorResponsable({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Responsable Fransor supprimé.");
      await loadFransorResponsables();
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de suppression du responsable Fransor."));
    }
  };

  const onImportSiteRow = async (payload: { code: string; name: string; address: string; parc: string; famille: string }) => {
    if (!session) return;
    await gtsApiClient.createSite({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      ...payload,
      auditMode: "batch"
    });
  };

  const onImportIntervenantRow = async (name: string) => {
    if (!session) return;
    await gtsApiClient.createIntervenant({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      name,
      auditMode: "batch"
    });
  };

  const onImportTypeRow = async (label: string) => {
    if (!session) return;
    await gtsApiClient.createAnomalyType({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      label,
      auditMode: "batch"
    });
  };

  const onLogImportSummary = async (payload: {
    target: "sites" | "intervenants" | "types";
    fileName: string;
    total: number;
    success: number;
    failed: number;
    errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
  }) => {
    if (!session) return;
    await gtsApiClient.logBulkImportAudit({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      ...payload
    });
  };

  const onRefreshImportedData = async (target: DataTab) => {
    if (target === "sites") {
      await loadSites();
      return;
    }
    if (target === "intervenants") {
      await loadIntervenants();
      return;
    }
    if (target === "fransorResponsables") {
      await loadFransorResponsables();
      return;
    }
    if (target === "interventionPendingSites") {
      if (!session) return;
      const rows = await gtsApiClient.listPendingInterventionSites({ requesterRole: session.user.role });
      setInterventionPendingSites(rows);
      return;
    }
    if (target === "interventionPendingIntervenants") {
      if (!session) return;
      const rows = await gtsApiClient.listPendingInterventionIntervenants({ requesterRole: session.user.role });
      setInterventionPendingIntervenants(rows);
      return;
    }
    if (target === "rondeMotifs") {
      await loadRondeMotifTypes();
      return;
    }
    if (target === "documentTemplates") {
      return;
    }
    if (target === "holidays") {
      await loadHolidays();
      return;
    }
    await loadAnomalyTypes();
  };

  const onResolvePendingSite = async (payload: { pendingId: string; parc: string; famille: string }) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.resolvePendingInterventionSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        parc: payload.parc,
        famille: payload.famille
      });
      onToast("Site en attente validé et ajouté aux sites.");
      await Promise.all([loadSites(), onRefreshImportedData("interventionPendingSites")]);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de validation du site en attente."));
    }
  };

  const onResolvePendingIntervenant = async (payload: { pendingId: string; name: string }) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.resolvePendingInterventionIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        name: payload.name
      });
      onToast("Intervenant en attente validé et ajouté aux intervenants.");
      await Promise.all([loadIntervenants(), onRefreshImportedData("interventionPendingIntervenants")]);
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de validation de l'intervenant en attente."));
    }
  };

  const onDeletePendingSiteSubmission = async (payload: { pendingId: string; reason: string }) => {
    if (!session) return;
    try {
      await gtsApiClient.deletePendingInterventionSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        reason: payload.reason
      });
      onToast("Soumission site en attente supprimée.");
      await onRefreshImportedData("interventionPendingSites");
    } catch (err) {
      const message = getErrorMessage(err, "Erreur de suppression de la soumission site.");
      throw new Error(message);
    }
  };

  const onDeletePendingIntervenantSubmission = async (payload: { pendingId: string; reason: string }) => {
    if (!session) return;
    try {
      await gtsApiClient.deletePendingInterventionIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        reason: payload.reason
      });
      onToast("Soumission intervenant en attente supprimée.");
      await onRefreshImportedData("interventionPendingIntervenants");
    } catch (err) {
      const message = getErrorMessage(err, "Erreur de suppression de la soumission intervenant.");
      throw new Error(message);
    }
  };


  const onRequestPasswordReset = useCallback(
    async (user: User) => {
      if (!session) return;
      if (!canSessionResetPasswordOrUnlockForUser(session, user)) return;
      onError("");
      try {
        const result = await gtsApiClient.updateUserProfile({
          requesterRole: session.user.role,
          requesterUsername: session.user.username,
          username: user.username,
          fullName: user.fullName,
          newRole: user.role === "OPERATEUR" ? "OPERATEUR" : "RESPONSABLE",
          managerProfile: user.role === "RESPONSABLE" ? user.managerProfile ?? "SUPERVISEUR" : null,
          pageAccess: user.pageAccess,
          mustResetPassword: true
        });
        onToast("Mot de passe réinitialisé.");
        if (result.temporaryPassword) {
          onCredentialsReady({ username: user.username, temporaryPassword: result.temporaryPassword });
        }
        await loadUsers();
      } catch (err) {
        onError(getErrorMessage(err, "Erreur lors de la réinitialisation du mot de passe."));
      }
    },
    [session, onError, onToast, onCredentialsReady, loadUsers]
  );

  const onDeleteUser = (username: string) => {
    if (!session || !canManageUsers) return;
    setConfirmDialog({
      isOpen: true,
      title: "Confirmer la suppression",
      message: `Supprimer (désactiver) l'utilisateur ${username} ?`,
      confirmLabel: "Supprimer",
      confirmClassName: "btn-danger",
      onConfirm: async () => {
        onError("");
        onInfo("");
        onCredentialsReady(null);
        try {
          await gtsApiClient.deactivateUser({
            requesterRole: session.user.role,
            requesterUsername: session.user.username,
            username
          });
          onInfo(`Utilisateur ${username} désactivé.`);
          await loadUsers();
        } catch (err) {
          onError(getErrorMessage(err, "Erreur de suppression."));
        }
      }
    });
  };

  const onQuitApp = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Confirmer la fermeture",
      message: "Quitter l'application maintenant ?",
      confirmLabel: "Quitter",
      confirmClassName: "btn-danger",
      onConfirm: async () => {
        await gtsApiClient.quitApp();
      }
    });
  };

  const onMinimizeApp = async () => {
    await gtsApiClient.minimizeApp();
  };

  const onQuitAppNow = async () => {
    await gtsApiClient.quitApp();
  };

  const closeConfirmDialog = () => setConfirmDialog(defaultConfirmDialog);
  const handleConfirmDialog = async () => {
    const action = confirmDialog.onConfirm;
    closeConfirmDialog();
    if (!action) return;
    await action();
  };

  const resetSettingsState = () => {
    setUsers([]);
    setAuditLogs([]);
    setAuditMetadata({ firstOccurredAt: null, lastOccurredAt: null, total: 0 });
    setSites([]);
    setIntervenants([]);
    setAnomalyTypes([]);
    setHolidays([]);
    setRondeMotifTypes([]);
    setRondePlannedProfiles([]);
    setFransorResponsables([]);
    setInterventionPendingSites([]);
    setInterventionPendingIntervenants([]);
    setShowCreateModal(false);
    resetUserForm();
    setUserModalMode("create");
    setEditingTechnicalUsername("");
    setConfirmDialog(defaultConfirmDialog);
    setActiveSettingsTab("operators");
    setActiveDataTab("sites");
    setDatabaseItems([]);
    setActiveDatabasePath(null);
    setArchiveStatus(null);
    onCredentialsReady(null);
  };

  return {
    users,
    activeUsernames,
    auditLogs,
    auditMetadata,
    sites,
    intervenants,
    anomalyTypes,
    holidays,
    rondeMotifTypes,
    rondePlannedProfiles,
    fransorResponsables,
    interventionPendingSites,
    interventionPendingIntervenants,
    activeSettingsTab,
    setActiveSettingsTab,
    activeDataTab,
    setActiveDataTab,
    showCreateModal,
    setShowCreateModal,
    onOpenCreateUserModal,
    userModalMode,
    setUserModalMode,
    editingTechnicalUsername,
    setEditingTechnicalUsername,
    createForm,
    setCreateForm,
    onCreateUser,
    onOpenEditUser,
    onDeleteUser,
    onUnlockUser,
    loadUsers,
    loadAuditLogs,
    onExportAuditLogs,
    loadDataSection,
    canManageUsers,
    canAccessOperatorsTab,
    onRequestPasswordReset,
    canManagePageAccess,
    canManageData,
    canDeleteData,
    confirmDialog,
    closeConfirmDialog,
    handleConfirmDialog,
    onChooseDbPath,
    onOpenWriterLogFolder,
    writerConfigDraft,
    setWriterConfigDraft,
    onPrefillWriterNode,
    onGenerateWriterConfig,
    dbConfigured,
    dbPath,
    dbWritable,
    databaseItems,
    activeDatabasePath,
    archiveStatus,
    hasArchiveSourceActive,
    archiveOpenedBy,
    loadDatabaseList,
    loadArchiveStatus,
    onSwitchDatabase,
    onRunArchiveNow,
    onRestoreLocalActiveDb,
    onQuitApp,
    onMinimizeApp,
    onQuitAppNow,
    onCreateSite,
    onUpdateSite,
    onDeleteSite,
    onCreateIntervenant,
    onUpdateIntervenant,
    onDeleteIntervenant,
    onCreateAnomalyType,
    onUpdateAnomalyType,
    onDeleteAnomalyType,
    onCreateHoliday,
    onUpdateHoliday,
    onDeleteHoliday,
    onCreateRondeMotifType,
    onUpdateRondeMotifType,
    onDeleteRondeMotifType,
    onUpsertRondePlannedProfile,
    onDeleteRondePlannedProfile,
    onSetRondePlannedProfilePlanningEnd,
    onSetRondePlannedProfileValidated,
    onCreateFransorResponsable,
    onUpdateFransorResponsable,
    onDeleteFransorResponsable,
    onImportSiteRow,
    onImportIntervenantRow,
    onImportTypeRow,
    onLogImportSummary,
    onRefreshImportedData,
    onResolvePendingSite,
    onResolvePendingIntervenant,
    onDeletePendingSiteSubmission,
    onDeletePendingIntervenantSubmission,
    resetSettingsState
  };
}
