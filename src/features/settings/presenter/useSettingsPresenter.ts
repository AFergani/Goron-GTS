/**
 * Presenter Paramètres : utilisateurs, RBAC, référentiels, BDD PostgreSQL, audit.
 *
 * Orchestration IPC via `gtsApiClient`. ~1400 lignes — découpage futur si besoin.
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient, type PublicPostgresConfig, type PostgresTestResult, type TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
import type { ConfirmDialogState, CreateUserFormState, DataRefreshTarget, DataTab, DocumentsTab, SettingsTab } from "../model/settings.types";
import { getDefaultPageAccessByRole } from "../model/settings.types";
import { isAuditReasonValid, MIN_AUDIT_REASON_LENGTH } from "../../common/model/auditReason";
import type { NotifyToast } from "../../common/model/toast.types";
import type { AnomalyTypeRef, AuditLog, FransorResponsableRef, HolidayRef, IntervenantRef, SiteRef, User } from "../../../types";
import type { PendingIntervenant, PendingSite } from "../../common/model/pendingRefs.types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import type {
  RondePlannedProfilePayload,
  RondePlannedProfileRef
} from "../../rondes/model/rondePlanned.types";
import { exportAuditLogsToExcel } from "../export/auditExcelExport";
import { exportTechErrorLogsToExcel } from "../export/techErrorLogsExcelExport";
import { DEFAULT_POSTGRES_CONFIG_DRAFT, type PostgresBusyPhase, type PostgresConfigDraft } from "../components/PostgresConnectionPanel";
import { canSessionAccessOperatorsTab, canSessionManageUser, isSessionStationAdmin } from "../model/userHierarchy";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

const defaultConfirmDialog: ConfirmDialogState = {
  isOpen: false,
  title: "",
  message: "",
  confirmLabel: "Confirmer",
  confirmClassName: "",
  onConfirm: null
};

/** Champ « Motif » commun à toutes les confirmations de gestion de compte. */
function createReasonField(
  onChange: (value: string) => void,
  options: { placeholder: string; autoFocus?: boolean }
) {
  return createElement(
    "label",
    { className: "mc-field" },
    createElement("span", null, `Motif (obligatoire, ${MIN_AUDIT_REASON_LENGTH} caractères minimum)`),
    createElement("textarea", {
      className: "mc-textarea",
      onChange: (e) => onChange((e.target as HTMLTextAreaElement).value),
      rows: 2,
      placeholder: options.placeholder,
      autoFocus: options.autoFocus
    })
  );
}

export function useSettingsPresenter({
  session,
  onError,
  onInfo,
  onToast,
  onCredentialsReady,
  onSessionUserPatch
}: {
  session: Session | null;
  onError: NotifyToast;
  onInfo: NotifyToast;
  onToast: NotifyToast;
  onCredentialsReady: (value: { username: string; temporaryPassword: string } | null) => void;
  /** Met à jour le badge sidebar si l'utilisateur connecté modifie son propre nom affiché. */
  onSessionUserPatch?: (patch: Partial<User>) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUsernames, setActiveUsernames] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [techErrorLogs, setTechErrorLogs] = useState<TechErrorLog[]>([]);
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
  const [pendingSites, setPendingSites] = useState<PendingSite[]>([]);
  const [pendingIntervenants, setPendingIntervenants] = useState<PendingIntervenant[]>([]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("operators");
  const [activeDataTab, setActiveDataTab] = useState<DataTab>("sites");
  const [activeDocumentsTab, setActiveDocumentsTab] = useState<DocumentsTab>("templates");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"create" | "edit">("create");
  const [editingTechnicalUsername, setEditingTechnicalUsername] = useState<string>("");
  const [createForm, setCreateForm] = useState<CreateUserFormState>({
    username: "",
    role: "OPERATEUR",
    managerProfile: "SUPERVISEUR",
    reason: "",
    pageAccess: getDefaultPageAccessByRole("OPERATEUR")
  });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(defaultConfirmDialog);
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmFullName, setConfirmFullName] = useState("");
  const confirmReasonRef = useRef("");
  const confirmFullNameRef = useRef("");
  useEffect(() => {
    if (!confirmDialog.isOpen) return;
    if (!confirmDialog.requireReason && !confirmDialog.requireDisplayName) return;
    const reasonOk = !confirmDialog.requireReason || isAuditReasonValid(confirmReason);
    const nameRequired = Boolean(confirmDialog.requireDisplayName);
    const nameTrimmed = confirmFullName.trim();
    const nameOk = !nameRequired || nameTrimmed.length > 0;
    const excludeUsername = confirmDialog.excludeUsername || "";
    const nameConflict =
      nameRequired &&
      nameTrimmed.length > 0 &&
      users.some(
        (u) =>
          u.isActive &&
          u.username !== excludeUsername &&
          String(u.fullName || "")
            .trim()
            .toLowerCase() === nameTrimmed.toLowerCase()
      );
    const baseMessage = confirmDialog.baseMessage || confirmDialog.message;
    const nextMessage = nameConflict
      ? `${baseMessage}\n\nUn utilisateur actif porte déjà ce nom affiché. Modifiez le nom affiché pour pouvoir réactiver.`
      : baseMessage;
    setConfirmDialog((prev) => ({
      ...prev,
      confirmDisabled: !reasonOk || !nameOk || nameConflict,
      message: nextMessage
    }));
  }, [
    confirmDialog.isOpen,
    confirmDialog.requireReason,
    confirmDialog.requireDisplayName,
    confirmDialog.excludeUsername,
    confirmDialog.baseMessage,
    confirmReason,
    confirmFullName,
    users
  ]);

  const setConfirmReasonValue = useCallback((value: string) => {
    confirmReasonRef.current = value;
    setConfirmReason(value);
  }, []);
  const setConfirmFullNameValue = useCallback((value: string) => {
    confirmFullNameRef.current = value;
    setConfirmFullName(value);
  }, []);
  const [dbWritable, setDbWritable] = useState<boolean>(false);
  const [postgresConfig, setPostgresConfig] = useState<PublicPostgresConfig | null>(null);
  const [postgresDraft, setPostgresDraft] = useState<PostgresConfigDraft>(DEFAULT_POSTGRES_CONFIG_DRAFT);
  const [postgresTestResult, setPostgresTestResult] = useState<PostgresTestResult | null>(null);
  const [postgresBusyPhase, setPostgresBusyPhase] = useState<PostgresBusyPhase>("idle");
  const resetUserForm = useCallback(() => {
    setCreateForm({
      username: "",
      role: "OPERATEUR",
      managerProfile: "SUPERVISEUR",
      reason: "",
      pageAccess: getDefaultPageAccessByRole("OPERATEUR")
    });
  }, []);

  const canManageUsers = useMemo(() => isSessionStationAdmin(session), [session]);
  const canAccessOperatorsTab = useMemo(() => canSessionAccessOperatorsTab(session), [session]);
  /** Gestion des données : tous les profils responsable + Admin (pleins pouvoirs UI). */
  const canManageData = useMemo(() => {
    const role = session?.user.role;
    return role === "RESPONSABLE" || role === "DEV";
  }, [session]);
  /** Même périmètre que `canManageData` ; les refus de suppression restent métier (références liées). */
  const canDeleteData = canManageData;

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

  const loadPostgresConfig = useCallback(async () => {
    if (!session || !isSessionStationAdmin(session)) return;
    try {
      const cfg = await gtsApiClient.getPostgresConfig();
      setPostgresConfig(cfg);
      setPostgresDraft({
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        user: cfg.user,
        password: ""
      });
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Impossible de charger la configuration PostgreSQL."));
    }
  }, [onError, session]);

  const onSavePostgresConfig = useCallback(async () => {
    if (!session || postgresBusyPhase !== "idle") return;
    onError("");
    setPostgresBusyPhase("saving");
    setPostgresTestResult(null);
    try {
      const result = await gtsApiClient.savePostgresConfig({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        host: postgresDraft.host,
        port: postgresDraft.port,
        database: postgresDraft.database,
        user: postgresDraft.user,
        password: postgresDraft.password
      });
      setPostgresConfig(result.config);
      setPostgresDraft((prev) => ({ ...prev, password: "" }));
      if (result.reconnect?.reachable) {
        onToast("Configuration PostgreSQL enregistrée. Connexion OK.", "success");
      } else {
        onToast(
          `Configuration enregistrée, mais reconnexion incomplète${result.reconnect?.error ? ` : ${result.reconnect.error}` : "."}`,
          "warning"
        );
      }
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Impossible d'enregistrer la configuration PostgreSQL."));
    } finally {
      setPostgresBusyPhase("idle");
    }
  }, [onError, onToast, postgresBusyPhase, postgresDraft, session]);

  const onTestPostgresConfig = useCallback(async () => {
    if (!session || postgresBusyPhase !== "idle") return;
    onError("");
    setPostgresBusyPhase("testing");
    try {
      const result = await gtsApiClient.testPostgresConfig({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        host: postgresDraft.host,
        port: postgresDraft.port,
        database: postgresDraft.database,
        user: postgresDraft.user,
        password: postgresDraft.password
      });
      setPostgresTestResult(result);
      if (result.reachable) {
        onToast("Test PostgreSQL réussi.");
      } else {
        onError(result.error || "Connexion PostgreSQL impossible.");
      }
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Échec du test PostgreSQL."));
    } finally {
      setPostgresBusyPhase("idle");
    }
  }, [onError, onToast, postgresBusyPhase, postgresDraft, session]);

  const onReconnectPostgres = useCallback(async () => {
    if (!session || postgresBusyPhase !== "idle") return;
    onError("");
    setPostgresBusyPhase("reconnecting");
    try {
      const result = await gtsApiClient.reconnectPostgres({
        requesterRole: session.user.role,
        requesterUsername: session.user.username
      });
      if (result.reachable) {
        onToast("PostgreSQL reconnecté.");
      } else {
        onError(result.error || "Reconnexion PostgreSQL impossible.");
      }
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Reconnexion PostgreSQL impossible."));
    } finally {
      setPostgresBusyPhase("idle");
    }
  }, [onError, onToast, postgresBusyPhase, session]);

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
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement du journal."));
    }
  }, [onError, session]);

  const loadTechErrorLogs = useCallback(async () => {
    if (!session) return;
    try {
      const rows = await gtsApiClient.listTechErrorLogs({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        limit: 500
      });
      setTechErrorLogs(rows);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des logs techniques."));
    }
  }, [onError, session]);

  const onExportAuditLogs = useCallback(async (logs?: AuditLog[]) => {
    const exportRows = Array.isArray(logs) ? logs : auditLogs;
    return exportAuditLogsToExcel(exportRows);
  }, [auditLogs]);

  const onExportTechErrorLogs = useCallback(async (logs?: TechErrorLog[]) => {
    const exportRows = Array.isArray(logs) ? logs : techErrorLogs;
    return exportTechErrorLogsToExcel(exportRows);
  }, [techErrorLogs]);

  const loadSites = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listSites({ requesterRole: session.user.role });
      setSites(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des sites."));
    }
  }, [onError, session]);

  const loadIntervenants = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listIntervenants({ requesterRole: session.user.role });
      setIntervenants(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des intervenants."));
    }
  }, [onError, session]);

  const loadAnomalyTypes = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listAnomalyTypes({ requesterRole: session.user.role });
      setAnomalyTypes(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des types d'anomalie."));
    }
  }, [onError, session]);

  const loadRondeMotifTypes = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listRondeMotifTypes({ requesterRole: session.user.role });
      setRondeMotifTypes(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des motifs de ronde."));
    }
  }, [onError, session]);

  const loadHolidays = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listHolidays({ requesterRole: session.user.role });
      setHolidays(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des jours fériés."));
    }
  }, [onError, session]);

  const loadRondePlannedProfiles = useCallback(async () => {
    if (!session) return;
    try {
      const data = await gtsApiClient.listRondePlannedProfiles({ requesterRole: session.user.role });
      setRondePlannedProfiles(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des profils de planification des rondes."));
    }
  }, [onError, session]);

  const loadFransorResponsables = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listFransorResponsables({ requesterRole: session.user.role });
      setFransorResponsables(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des responsables Fransor."));
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
        .listPendingSites({ requesterRole: session.user.role })
        .then((rows) => setPendingSites(rows))
        .catch(() => setPendingSites([])),
      gtsApiClient
        .listPendingIntervenants({ requesterRole: session.user.role })
        .then((rows) => setPendingIntervenants(rows))
        .catch(() => setPendingIntervenants([]))
    ]);
  }, [loadAnomalyTypes, loadFransorResponsables, loadHolidays, loadIntervenants, loadRondeMotifTypes, loadRondePlannedProfiles, loadSites, session]);

  useEffect(() => {
    if (!session) return;
    const loadPendingCounts = () => {
      void gtsApiClient
        .listPendingSites({ requesterRole: session.user.role })
        .then((rows) => setPendingSites(rows))
        .catch(() => setPendingSites([]));
      void gtsApiClient
        .listPendingIntervenants({ requesterRole: session.user.role })
        .then((rows) => setPendingIntervenants(rows))
        .catch(() => setPendingIntervenants([]));
    };
    loadPendingCounts();
    const pendingTimer = setInterval(loadPendingCounts, 30000);
    return () => clearInterval(pendingTimer);
  }, [session]);

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

    if (activeSettingsTab === "data" || activeSettingsTab === "templates") {
      void loadDataSection();
      const timer = setInterval(() => {
        void loadDataSection();
      }, refreshMs);
      return () => clearInterval(timer);
    }

    if (activeSettingsTab === "database") {
      if (!canManageUsers) return;
      void loadPostgresConfig();
      return;
    }

    if (activeSettingsTab === "audit") {
      if (!canManageUsers) return;
      void loadAuditLogs();
      void loadTechErrorLogs();
      const timer = setInterval(() => {
        void loadAuditLogs();
        void loadTechErrorLogs();
      }, refreshMs);
      return () => clearInterval(timer);
    }
  }, [
    activeSettingsTab,
    loadAuditLogs,
    loadTechErrorLogs,
    loadPostgresConfig,
    loadDataSection,
    loadUsers,
    session,
    canManageUsers,
    canAccessOperatorsTab
  ]);

  useEffect(() => {
    if (!canManageUsers && (activeSettingsTab === "audit" || activeSettingsTab === "database")) {
      setActiveSettingsTab(canAccessOperatorsTab ? "operators" : "data");
      return;
    }
    if (canAccessOperatorsTab) return;
    if (activeSettingsTab === "operators") {
      setActiveSettingsTab("data");
    }
  }, [canManageUsers, canAccessOperatorsTab, activeSettingsTab, setActiveSettingsTab]);

  const onCreateUser = async () => {
    if (!session) return;
    if (userModalMode === "create" ? !canManageUsers : !canAccessOperatorsTab) return;
    onError("");
    onInfo("");
    onCredentialsReady(null);
    try {
      if (userModalMode === "create") {
        const payloadPageAccess = getDefaultPageAccessByRole(createForm.role);
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
        const payloadPageAccess = getDefaultPageAccessByRole(createForm.role);
        const result = await gtsApiClient.updateUserProfile({
          requesterRole: session.user.role,
          requesterUsername: session.user.username,
          username: editingTechnicalUsername,
          fullName: createForm.username,
          newRole: createForm.role,
          managerProfile: createForm.role === "RESPONSABLE" ? createForm.managerProfile : null,
          pageAccess: payloadPageAccess,
          mustResetPassword: false,
          reason: createForm.reason.trim(),
          expectedUpdatedAt: existingUser?.updatedAt ?? null
        });
        onToast("Utilisateur modifié.");
        if (
          editingTechnicalUsername === session.user.username &&
          typeof onSessionUserPatch === "function"
        ) {
          onSessionUserPatch({
            fullName: result.fullName || createForm.username,
            role: createForm.role,
            managerProfile: createForm.role === "RESPONSABLE" ? createForm.managerProfile : null,
            pageAccess: payloadPageAccess
          });
        }
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
      onError(extractUserFacingErrorMessage(err, "Erreur de creation."));
    }
  };

  const onOpenEditUser = (user: User) => {
    if (user.role === "DEV") return;
    if (!session || !user.isActive || !canSessionManageUser(session, user)) return;
    setCreateForm({
      username: user.fullName,
      role: user.role,
      managerProfile: user.managerProfile || "SUPERVISEUR",
      reason: "",
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
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du site."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du site."));
    }
  };

  const onUpdateSite = async (payload: { id: string; code: string; name: string; address: string; parc: string; famille: string }) => {
    if (!session) return;
    onError("");
    try {
      const current = sites.find((s) => s.id === payload.id);
      await gtsApiClient.updateSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        ...payload,
        expectedUpdatedAt: current?.updatedAt ?? null
      });
      onToast("Site modifié.");
      await loadSites();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du site."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout de l'intervenant."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression de l'intervenant."));
    }
  };

  const onUpdateIntervenant = async (id: string, name: string) => {
    if (!session) return;
    onError("");
    try {
      const current = intervenants.find((item) => item.id === id);
      await gtsApiClient.updateIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        name,
        expectedUpdatedAt: current?.updatedAt ?? null
      });
      onToast("Intervenant modifié.");
      await loadIntervenants();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification de l'intervenant."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du type d'anomalie."));
    }
  };

  const onDeleteAnomalyType = async (id: string, reason: string) => {
    if (!session) return;
    if (anomalyTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce type d'anomalie est un type système et ne peut pas être supprimé.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.deleteAnomalyType({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Type d'anomalie supprimé.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du type d'anomalie."));
    }
  };

  const onUpdateAnomalyType = async (id: string, label: string, colorHex: string) => {
    if (!session) return;
    if (anomalyTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce type d'anomalie est un type système et ne peut pas être modifié.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.updateAnomalyType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        label,
        colorHex,
        expectedUpdatedAt: anomalyTypes.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Type d'anomalie modifié.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du type d'anomalie."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du jour férié."));
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
        label,
        expectedUpdatedAt: holidays.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Jour férié modifié.");
      await loadHolidays();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du jour férié."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du jour férié."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du motif de ronde."));
    }
  };

  const onUpdateRondeMotifType = async (id: string, label: string, colorHex: string) => {
    if (!session) return;
    if (rondeMotifTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce motif de ronde est un type système et ne peut pas être modifié.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.updateRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        label,
        colorHex,
        requiresFreeText: false,
        expectedUpdatedAt: rondeMotifTypes.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Motif de ronde modifié.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du motif de ronde."));
    }
  };

  const onDeleteRondeMotifType = async (id: string, reason: string) => {
    if (!session) return;
    if (rondeMotifTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce motif de ronde est un type système et ne peut pas être supprimé.");
      return;
    }
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
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du motif de ronde."));
    }
  };

  const onUpsertRondePlannedProfile = async (payload: RondePlannedProfilePayload) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      const result = await gtsApiClient.upsertRondePlannedProfile({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        ...payload,
        expectedUpdatedAt: payload.id
          ? rondePlannedProfiles.find((item) => item.id === payload.id)?.updatedAt ?? null
          : undefined
      });
      onToast(payload.id ? "Profil de planification mis à jour." : "Profil de planification créé.");
      await loadRondePlannedProfiles();
      return result;
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur à l'enregistrement du profil.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onDeleteRondePlannedProfile = async (id: string, reason: string) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      const result = await gtsApiClient.deleteRondePlannedProfile({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      const action = (result as { action?: string } | null)?.action;
      onToast(
        action === "deactivated"
          ? "Programmation désactivée (rondes clôturées conservées)."
          : "Profil de planification supprimé."
      );
      await loadRondePlannedProfiles();
      return result;
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur de suppression du profil.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onRequestRondePlannedProfileCancellation = async (id: string, reason: string) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      await gtsApiClient.requestRondePlannedProfileCancellation({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Demande d'annulation envoyée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Impossible d'envoyer la demande d'annulation.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onReviewRondePlannedProfileCancellationRequest = async (
    id: string,
    payload: { decision: "approve" | "reject"; reviewReason: string; planningEndDate?: string }
  ) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      await gtsApiClient.reviewRondePlannedProfileCancellationRequest({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        ...payload,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast(payload.decision === "approve" ? "Demande d'annulation acceptée." : "Demande d'annulation refusée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Impossible de traiter la demande d'annulation.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onSetRondePlannedProfilePlanningEnd = async (id: string, planningEndDate: string, reason: string) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      await gtsApiClient.setRondePlannedProfilePlanningEnd({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        planningEndDate,
        reason,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Date de fin de planification enregistrée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Impossible d'enregistrer la fin de planification.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
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
        validated,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast(validated ? "Profil marqué comme validé." : "Validation du profil levée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Impossible de mettre à jour la validation du profil."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du responsable Fransor."));
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
        name,
        expectedUpdatedAt: fransorResponsables.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Responsable Fransor modifié.");
      await loadFransorResponsables();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du responsable Fransor."));
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
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du responsable Fransor."));
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

  const onRefreshImportedData = async (target: DataRefreshTarget) => {
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
    if (target === "pendingSites") {
      if (!session) return;
      const rows = await gtsApiClient.listPendingSites({ requesterRole: session.user.role });
      setPendingSites(rows);
      return;
    }
    if (target === "pendingIntervenants") {
      if (!session) return;
      const rows = await gtsApiClient.listPendingIntervenants({ requesterRole: session.user.role });
      setPendingIntervenants(rows);
      return;
    }
    if (target === "rondeMotifs") {
      await loadRondeMotifTypes();
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
      const result = await gtsApiClient.resolvePendingSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        parc: payload.parc,
        famille: payload.famille
      });
      const p = result?.propagation;
      const totalPropagated = p
        ? (p.interventionEntries || 0) + (p.rondeEntries || 0) + (p.gardiennageEntries || 0) + (p.mainCouranteEntries || 0)
        : 0;
      const toastMsg = totalPropagated > 0
        ? `Site validé et propagé à ${totalPropagated} entrée(s) existante(s).`
        : "Site en attente validé et ajouté aux sites.";
      onToast(toastMsg);
      await Promise.all([loadSites(), onRefreshImportedData("pendingSites")]);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de validation du site en attente."));
    }
  };

  const onResolvePendingIntervenant = async (payload: { pendingId: string; name: string }) => {
    if (!session) return;
    onError("");
    try {
      const result = await gtsApiClient.resolvePendingIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        name: payload.name
      });
      const p = result?.propagation;
      const totalPropagated = p
        ? (p.interventionEntries || 0) + (p.rondeEntries || 0) + (p.gardiennageEntries || 0)
        : 0;
      const toastMsg = totalPropagated > 0
        ? `Intervenant validé et propagé à ${totalPropagated} entrée(s) existante(s).`
        : "Intervenant en attente validé et ajouté aux intervenants.";
      onToast(toastMsg);
      await Promise.all([loadIntervenants(), onRefreshImportedData("pendingIntervenants")]);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de validation de l'intervenant en attente."));
    }
  };

  const onDeletePendingSiteSubmission = async (payload: { pendingId: string; reason: string }) => {
    if (!session) return;
    try {
      await gtsApiClient.deletePendingSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        reason: payload.reason
      });
      onToast("Soumission site en attente supprimée.");
      await onRefreshImportedData("pendingSites");
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur de suppression de la soumission site.");
      throw new Error(message);
    }
  };

  const onDeletePendingIntervenantSubmission = async (payload: { pendingId: string; reason: string }) => {
    if (!session) return;
    try {
      await gtsApiClient.deletePendingIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        reason: payload.reason
      });
      onToast("Soumission intervenant en attente supprimée.");
      await onRefreshImportedData("pendingIntervenants");
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur de suppression de la soumission intervenant.");
      throw new Error(message);
    }
  };


  const onRequestPasswordReset = (user: User) => {
    if (!session || !canSessionManageUser(session, user)) return;
    setConfirmReasonValue("");
    setConfirmDialog({
      isOpen: true,
      title: "Confirmer la réinitialisation du mot de passe",
      message: `Réinitialiser le mot de passe de ${user.fullName} ? Un mot de passe temporaire sera généré et devra être changé à la prochaine connexion.`,
      confirmLabel: "Réinitialiser",
      confirmClassName: "btn-light",
      confirmDisabled: true,
      requireReason: true,
      children: createReasonField(setConfirmReasonValue, {
        placeholder: "Ex: demande de l'opérateur après oubli du code, compte bloqué, suspicion de compromission",
        autoFocus: true
      }),
      onConfirm: async () => {
        onError("");
        onInfo("");
        onCredentialsReady(null);
        const reasonToSend = confirmReasonRef.current.trim();
        try {
          const result = await gtsApiClient.updateUserProfile({
            requesterRole: session.user.role,
            requesterUsername: session.user.username,
            username: user.username,
            fullName: user.fullName,
            newRole: user.role === "OPERATEUR" ? "OPERATEUR" : "RESPONSABLE",
            managerProfile: user.role === "RESPONSABLE" ? user.managerProfile ?? "SUPERVISEUR" : null,
            pageAccess: user.pageAccess,
            mustResetPassword: true,
            reason: reasonToSend,
            expectedUpdatedAt: user.updatedAt ?? null
          });
          onToast("Mot de passe réinitialisé.");
          if (result.temporaryPassword) {
            onCredentialsReady({ username: user.fullName, temporaryPassword: result.temporaryPassword });
          }
          await loadUsers();
        } catch (err) {
          onError(extractUserFacingErrorMessage(err, "Erreur lors de la réinitialisation du mot de passe."));
        }
      }
    });
  };

  const onUnlockUser = (user: User) => {
    if (!session || !canSessionManageUser(session, user)) return;
    setConfirmReasonValue("");
    setConfirmDialog({
      isOpen: true,
      title: "Confirmer le déverrouillage",
      message: `Déverrouiller le compte de ${user.fullName} ? Le compteur de tentatives échouées sera remis à zéro.`,
      confirmLabel: "Déverrouiller",
      confirmClassName: "btn-light",
      confirmDisabled: true,
      requireReason: true,
      children: createReasonField(setConfirmReasonValue, {
        placeholder: "Ex: demande de l'opérateur après saisies erronées, identité vérifiée",
        autoFocus: true
      }),
      onConfirm: async () => {
        onError("");
        try {
          await gtsApiClient.unlockUser({
            requesterRole: session.user.role,
            requesterUsername: session.user.username,
            username: user.username,
            reason: confirmReasonRef.current.trim()
          });
          onToast("Compte déverrouillé.");
          await loadUsers();
        } catch (err) {
          onError(extractUserFacingErrorMessage(err, "Erreur de déverrouillage."));
        }
      }
    });
  };

  const onDeactivateUser = (user: User) => {
    if (!session || !canSessionManageUser(session, user)) return;
    setConfirmReasonValue("");
    setConfirmDialog({
      isOpen: true,
      title: "Confirmer la désactivation",
      message: `Désactiver l'utilisateur ${user.fullName} ?`,
      confirmLabel: "Désactiver",
      confirmClassName: "btn-danger",
      confirmDisabled: true,
      requireReason: true,
      children: createReasonField(setConfirmReasonValue, {
        placeholder: "Ex: départ de l'utilisateur, suspension temporaire",
        autoFocus: true
      }),
      onConfirm: async () => {
        onError("");
        onInfo("");
        onCredentialsReady(null);
        const reasonToSend = confirmReasonRef.current.trim();
        try {
          await gtsApiClient.deactivateUser({
            requesterRole: session.user.role,
            requesterUsername: session.user.username,
            username: user.username,
            reason: reasonToSend
          });
          onInfo(`Utilisateur ${user.fullName} désactivé.`);
          await loadUsers();
        } catch (err) {
          onError(extractUserFacingErrorMessage(err, "Erreur de désactivation."));
        }
      }
    });
  };

  const onReactivateUser = (user: User) => {
    if (!session || !canSessionManageUser(session, user)) return;
    setConfirmReasonValue("");
    setConfirmFullNameValue(user.fullName || "");
    const baseMessage =
      `Réactiver l'utilisateur ${user.fullName} ? Un nouveau mot de passe temporaire sera généré (comme à la création).` +
      " Si un autre compte actif porte déjà ce nom, changez le nom affiché ci-dessous.";
    setConfirmDialog({
      isOpen: true,
      title: "Confirmer la réactivation",
      message: baseMessage,
      baseMessage,
      confirmLabel: "Réactiver",
      confirmClassName: "btn-light",
      confirmDisabled: true,
      requireReason: true,
      requireDisplayName: true,
      excludeUsername: user.username,
      children: createElement(
        "div",
        { className: "mc-form-stack", style: { display: "grid", gap: "0.75rem" } },
        createElement(
          "label",
          { className: "mc-field" },
          createElement("span", null, "Nom affiché"),
          createElement("input", {
            className: "mc-input",
            type: "text",
            defaultValue: user.fullName || "",
            onChange: (e) => setConfirmFullNameValue((e.target as HTMLInputElement).value),
            autoFocus: true,
            "aria-label": "Nom affiché pour la réactivation"
          })
        ),
        createReasonField(setConfirmReasonValue, { placeholder: "Ex: retour d'absence, compte réhabilité" })
      ),
      onConfirm: async () => {
        onError("");
        onInfo("");
        onCredentialsReady(null);
        const reasonToSend = confirmReasonRef.current.trim();
        const fullNameToSend = confirmFullNameRef.current.trim();
        try {
          const result = await gtsApiClient.reactivateUser({
            requesterRole: session.user.role,
            requesterUsername: session.user.username,
            username: user.username,
            reason: reasonToSend,
            fullName: fullNameToSend
          });
          const displayName = result.fullName || fullNameToSend || user.fullName;
          onToast(`Utilisateur ${displayName} réactivé — mot de passe temporaire généré.`);
          if (result.temporaryPassword) {
            onCredentialsReady({ username: displayName, temporaryPassword: result.temporaryPassword });
          }
          await loadUsers();
        } catch (err) {
          onError(extractUserFacingErrorMessage(err, "Erreur de réactivation."));
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

  const closeConfirmDialog = () => {
    setConfirmDialog(defaultConfirmDialog);
    setConfirmReasonValue("");
    setConfirmFullNameValue("");
  };
  const handleConfirmDialog = async () => {
    const action = confirmDialog.onConfirm;
    if (!action) return;
    try {
      await action();
    } finally {
      closeConfirmDialog();
    }
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
    setPendingSites([]);
    setPendingIntervenants([]);
    setShowCreateModal(false);
    resetUserForm();
    setUserModalMode("create");
    setEditingTechnicalUsername("");
    setConfirmDialog(defaultConfirmDialog);
    setActiveSettingsTab("operators");
    setActiveDataTab("sites");
    setActiveDocumentsTab("templates");
    onCredentialsReady(null);
    setTechErrorLogs([]);
  };

  return {
    users,
    activeUsernames,
    auditLogs,
    techErrorLogs,
    auditMetadata,
    sites,
    intervenants,
    anomalyTypes,
    holidays,
    rondeMotifTypes,
    rondePlannedProfiles,
    fransorResponsables,
    pendingSites,
    pendingIntervenants,
    activeSettingsTab,
    setActiveSettingsTab,
    activeDataTab,
    setActiveDataTab,
    activeDocumentsTab,
    setActiveDocumentsTab,
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
    onDeactivateUser,
    onReactivateUser,
    onUnlockUser,
    loadUsers,
    loadAuditLogs,
    loadTechErrorLogs,
    onExportAuditLogs,
    onExportTechErrorLogs,
    loadDataSection,
    canManageUsers,
    canAccessOperatorsTab,
    onRequestPasswordReset,
    canManageData,
    canDeleteData,
    confirmDialog,
    closeConfirmDialog,
    handleConfirmDialog,
    postgresConfig,
    postgresDraft,
    setPostgresDraft,
    postgresTestResult,
    postgresBusyPhase,
    onSavePostgresConfig,
    onTestPostgresConfig,
    onReconnectPostgres,
    loadPostgresConfig,
    dbWritable,
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
    onRequestRondePlannedProfileCancellation,
    onReviewRondePlannedProfileCancellationRequest,
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
