/**
 * Presenter Paramètres : utilisateurs, RBAC, référentiels, BDD PostgreSQL, audit.
 *
 * Orchestration IPC via `gtsApiClient`. Référentiels délégués à `useSettingsDataReferentials`.
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient, type TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
import type { ConfirmDialogState, CreateUserFormState, DataTab, DocumentsTab, SettingsTab } from "../model/settings.types";
import { getDefaultPageAccessByRole } from "../model/settings.types";
import { isAuditReasonValid, MIN_AUDIT_REASON_LENGTH } from "../../common/model/auditReason";
import type { NotifyToast } from "../../common/model/toast.types";
import type { AuditLog, User } from "../../../types";
import { exportAuditLogsToExcel } from "../export/auditExcelExport";
import { exportTechErrorLogsToExcel } from "../export/techErrorLogsExcelExport";
import { canSessionAccessOperatorsTab, canSessionManageUser, isSessionStationAdmin } from "../model/userHierarchy";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import { useSettingsDataReferentials } from "./useSettingsDataReferentials";

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
    resetDataReferentials();
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
