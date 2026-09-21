/**
 * Presenter Paramètres : utilisateurs, RBAC, référentiels, BDD PostgreSQL, audit.
 *
 * Orchestration IPC via `gtsApiClient`. Référentiels : `useSettingsDataReferentials`.
 * Comptes opérateurs : `useSettingsUserActions`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient, type TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
import type { ConfirmDialogState, DataTab, DocumentsTab, SettingsTab } from "../model/settings.types";
import { isAuditReasonValid } from "../../common/model/auditReason";
import type { NotifyToast } from "../../common/model/toast.types";
import type { AuditLog, User } from "../../../types";
import { exportAuditLogsToExcel } from "../export/auditExcelExport";
import { exportTechErrorLogsToExcel } from "../export/techErrorLogsExcelExport";
import { canSessionAccessOperatorsTab, isSessionStationAdmin } from "../model/userHierarchy";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import { useSettingsDataReferentials } from "./useSettingsDataReferentials";
import { useSettingsUserActions } from "./useSettingsUserActions";

const defaultConfirmDialog: ConfirmDialogState = {
  isOpen: false,
  title: "",
  message: "",
  confirmLabel: "Confirmer",
  confirmClassName: "",
  onConfirm: null
};

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
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("operators");
  const [activeDataTab, setActiveDataTab] = useState<DataTab>("sites");
  const [activeDocumentsTab, setActiveDocumentsTab] = useState<DocumentsTab>("templates");
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

  const {
    sites,
    intervenants,
    anomalyTypes,
    holidays,
    rondeMotifTypes,
    rondePlannedProfiles,
    fransorResponsables,
    pendingSites,
    pendingIntervenants,
    loadDataSection,
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
    resetDataReferentials
  } = useSettingsDataReferentials({ session, onError, onToast });

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

  const {
    showCreateModal,
    setShowCreateModal,
    userModalMode,
    setUserModalMode,
    editingTechnicalUsername,
    setEditingTechnicalUsername,
    createForm,
    setCreateForm,
    onCreateUser,
    onOpenEditUser,
    onOpenCreateUserModal,
    onRequestPasswordReset,
    onUnlockUser,
    onDeactivateUser,
    onReactivateUser,
    resetUserActionsState
  } = useSettingsUserActions({
    session,
    users,
    loadUsers,
    canManageUsers,
    canAccessOperatorsTab,
    setConfirmDialog,
    setConfirmReasonValue,
    setConfirmFullNameValue,
    confirmReasonRef,
    confirmFullNameRef,
    onError,
    onInfo,
    onToast,
    onCredentialsReady,
    onSessionUserPatch
  });

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
    resetDataReferentials();
    resetUserActionsState();
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
