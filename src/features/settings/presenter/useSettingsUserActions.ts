/**
 * CRUD comptes opérateurs (création, édition, mot de passe, verrouillage) pour Paramètres.
 *
 * Utilisé par `useSettingsPresenter` : les confirmations d’audit restent dans le presenter
 * (`confirmDialog` partagé avec quitter l’application).
 */

import { createElement, useCallback, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { ConfirmDialogState, CreateUserFormState } from "../model/settings.types";
import { getDefaultPageAccessByRole } from "../model/settings.types";
import { MIN_AUDIT_REASON_LENGTH } from "../../common/model/auditReason";
import type { NotifyToast } from "../../common/model/toast.types";
import type { User } from "../../../types";
import { canSessionManageUser } from "../model/userHierarchy";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

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

/**
 * @param params.session - Session courante
 * @param params.users - Liste déjà chargée (unicité / `updatedAt`)
 * @returns État modale utilisateur et handlers CRUD
 */
export function useSettingsUserActions({
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
}: {
  session: Session | null;
  users: User[];
  loadUsers: () => Promise<void>;
  canManageUsers: boolean;
  canAccessOperatorsTab: boolean;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>;
  setConfirmReasonValue: (value: string) => void;
  setConfirmFullNameValue: (value: string) => void;
  confirmReasonRef: MutableRefObject<string>;
  confirmFullNameRef: MutableRefObject<string>;
  onError: NotifyToast;
  onInfo: NotifyToast;
  onToast: NotifyToast;
  onCredentialsReady: (value: { username: string; temporaryPassword: string } | null) => void;
  onSessionUserPatch?: (patch: Partial<User>) => void;
}) {
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

  const resetUserForm = useCallback(() => {
    setCreateForm({
      username: "",
      role: "OPERATEUR",
      managerProfile: "SUPERVISEUR",
      reason: "",
      pageAccess: getDefaultPageAccessByRole("OPERATEUR")
    });
  }, []);

  const resetUserActionsState = useCallback(() => {
    setShowCreateModal(false);
    resetUserForm();
    setUserModalMode("create");
    setEditingTechnicalUsername("");
  }, [resetUserForm]);

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
        if (editingTechnicalUsername === session.user.username && typeof onSessionUserPatch === "function") {
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
        placeholder: "Ex. Motif exemple",
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
        placeholder: "Ex. Motif exemple",
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
        placeholder: "Ex. Motif exemple",
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
        createReasonField(setConfirmReasonValue, { placeholder: "Ex. Motif exemple" })
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

  return {
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
  };
}
