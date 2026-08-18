/**
 * Presenter authentification : connexion, première définition de mot de passe, compte verrouillé.
 *
 * Appelé depuis `AppShell` lorsque aucune session n'est active. Délègue à `gtsApiClient`
 * et remonte la session créée via `onSessionCreated`.
 */

import { FormEvent, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Session } from "../../../app/session/SessionProvider";
import type { LoginFormState, PasswordUpdateFormState } from "../model/auth.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

type UseAuthPresenterOptions = {
  onSessionCreated: (session: Session) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
};

/**
 * État et handlers pour `LoginView` et `FirstLoginModal`.
 */
export function useAuthPresenter({ onSessionCreated, onError, onToast }: UseAuthPresenterOptions) {
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
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isPasswordLongEnough = passwordUpdateForm.newPassword.length >= 6;
  const isPasswordConfirmed = useMemo(
    () => passwordUpdateForm.confirmPassword.length > 0 && passwordUpdateForm.newPassword === passwordUpdateForm.confirmPassword,
    [passwordUpdateForm.confirmPassword, passwordUpdateForm.newPassword]
  );

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    onError("");
    setIsLoggingIn(true);
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
      onError(extractUserFacingErrorMessage(err, "Erreur de connexion."));
    } finally {
      setIsLoggingIn(false);
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
      onError(extractUserFacingErrorMessage(err, "Erreur de première connexion."));
    }
  };

  return {
    loginForm,
    setLoginForm,
    onLogin,
    isLoggingIn,
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
