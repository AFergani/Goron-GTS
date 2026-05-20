import { FormEvent, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Session } from "../../../app/session/SessionProvider";
import type { LoginFormState, PasswordUpdateFormState } from "../model/auth.types";

function getErrorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message.replace("Error invoking remote method", "").replace(/^[:\s-]+/, "").trim();
  // Supprimer les tags techniques internes des messages métier.
  return raw.replace(/^\[[A-Z_]+\]\s*/, "") || fallback;
}

export function useAuthPresenter({
  onSessionCreated,
  onError,
  onToast
}: {
  onSessionCreated: (session: Session) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const [showPasswordUpdateModal, setShowPasswordUpdateModal] = useState(false);
  const [showLockedDialog, setShowLockedDialog] = useState(false);
  const [pendingFirstLogin, setPendingFirstLogin] = useState<{ displayName: string; temporaryPassword: string } | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>({
    username: "",
    password: ""
  });
  const [passwordUpdateForm, setPasswordUpdateForm] = useState<PasswordUpdateFormState>({
    newPassword: "",
    confirmPassword: ""
  });

  const isPasswordLongEnough = passwordUpdateForm.newPassword.length >= 6;
  const isPasswordConfirmed = useMemo(
    () => passwordUpdateForm.confirmPassword.length > 0 && passwordUpdateForm.newPassword === passwordUpdateForm.confirmPassword,
    [passwordUpdateForm.confirmPassword, passwordUpdateForm.newPassword]
  );

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    onError("");
    try {
      const result = await gtsApiClient.login(loginForm);
      if (result.user.mustChangePassword) {
        setPendingFirstLogin({ displayName: loginForm.username, temporaryPassword: loginForm.password });
        setPasswordUpdateForm({ newPassword: "", confirmPassword: "" });
        setShowPasswordUpdateModal(true);
        return;
      }
      onSessionCreated(result);
      setLoginForm({ username: "", password: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("[AUTH_ACCOUNT_LOCKED]")) {
        setShowLockedDialog(true);
        return;
      }
      onError(getErrorMessage(err, "Erreur de connexion."));
    }
  };

  const onFirstLogin = async (e: FormEvent) => {
    e.preventDefault();
    onError("");
    if (!pendingFirstLogin) {
      onError("Session de première connexion invalide. Reconnectez-vous.");
      setShowPasswordUpdateModal(false);
      return;
    }
    if (!isPasswordLongEnough) {
      onError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (!isPasswordConfirmed) {
      onError("Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      await gtsApiClient.firstLogin({
        username: pendingFirstLogin.displayName,
        temporaryPassword: pendingFirstLogin.temporaryPassword,
        newPassword: passwordUpdateForm.newPassword
      });
      const result = await gtsApiClient.login({
        username: pendingFirstLogin.displayName,
        password: passwordUpdateForm.newPassword
      });
      onSessionCreated(result);
      setShowPasswordUpdateModal(false);
      setPendingFirstLogin(null);
      setPasswordUpdateForm({ newPassword: "", confirmPassword: "" });
      setLoginForm({ username: "", password: "" });
      onToast("Mot de passe mis à jour.");
    } catch (err) {
      onError(getErrorMessage(err, "Erreur de première connexion."));
    }
  };

  return {
    loginForm,
    setLoginForm,
    onLogin,
    showPasswordUpdateModal,
    showLockedDialog,
    setShowLockedDialog,
    pendingFirstLogin,
    passwordUpdateForm,
    setPasswordUpdateForm,
    onFirstLogin,
    isPasswordLongEnough,
    isPasswordConfirmed
  };
}
