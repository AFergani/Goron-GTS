/**
 * Presenter authentification : connexion, première définition de mot de passe, compte verrouillé.
 *
 * Appelé depuis `AppShell` lorsque aucune session n'est active. Délègue à `gtsApiClient`
 * et remonte la session créée via `onSessionCreated`.
 */

import { FormEvent, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Session } from "../../../app/session/SessionProvider";
import type { LoginFormState, PasswordUpdateFormState, PeerResetFormState } from "../model/auth.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

const emptyPeerResetForm: PeerResetFormState = {
  fullName: "",
  validatorFullName: "",
  validatorPassword: "",
  reason: ""
};

type UseAuthPresenterOptions = {
  onSessionCreated: (session: Session) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
};

/**
 * État et handlers pour `LoginView`, `FirstLoginModal` et `PeerResetModal`.
 *
 * @param options.onSessionCreated - Enregistre la session après login réussi.
 * @param options.onError - Message sous le formulaire de connexion uniquement.
 * @param options.onToast - Confirmation après mise à jour ou déblocage du mot de passe.
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
  const [passwordUpdateError, setPasswordUpdateError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPeerResetModal, setShowPeerResetModal] = useState(false);
  const [peerResetForm, setPeerResetForm] = useState<PeerResetFormState>(emptyPeerResetForm);
  const [peerResetError, setPeerResetError] = useState("");
  const [isPeerResetting, setIsPeerResetting] = useState(false);

  const isPasswordLongEnough = passwordUpdateForm.newPassword.length >= 6;
  const isPasswordConfirmed = useMemo(
    () => passwordUpdateForm.confirmPassword.length > 0 && passwordUpdateForm.newPassword === passwordUpdateForm.confirmPassword,
    [passwordUpdateForm.confirmPassword, passwordUpdateForm.newPassword]
  );
  /**
   * Le mot de passe temporaire est le seul antécédent connu du client : les mots de passe
   * plus anciens ne sont vérifiés que par le serveur, qui répond alors dans `passwordUpdateError`.
   */
  const isPasswordDifferentFromTemporary = useMemo(
    () =>
      passwordUpdateForm.newPassword.length > 0 &&
      passwordUpdateForm.newPassword !== pendingFirstLogin?.temporaryPassword,
    [passwordUpdateForm.newPassword, pendingFirstLogin]
  );

  /** Toute saisie efface le refus précédent : il ne doit pas survivre à la correction. */
  const onPasswordUpdateFormChange = (next: PasswordUpdateFormState) => {
    setPasswordUpdateError("");
    setPasswordUpdateForm(next);
  };

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    onError("");
    setIsLoggingIn(true);
    try {
      const result = await gtsApiClient.login(loginForm);
      if (result.user.mustChangePassword) {
        setPendingFirstLogin({ displayName: loginForm.username, temporaryPassword: loginForm.password });
        setPasswordUpdateError("");
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
    setPasswordUpdateError("");
    if (!pendingFirstLogin) {
      onError("Session de première connexion invalide. Reconnectez-vous.");
      setShowPasswordUpdateModal(false);
      return;
    }
    if (!isPasswordLongEnough) {
      setPasswordUpdateError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (!isPasswordConfirmed) {
      setPasswordUpdateError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!isPasswordDifferentFromTemporary) {
      setPasswordUpdateError(
        "Ce mot de passe est celui qui vous a été remis. Choisissez-en un autre, connu de vous seul."
      );
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
      setPasswordUpdateError(extractUserFacingErrorMessage(err, "Erreur de première connexion."));
    }
  };

  const onOpenPeerReset = () => {
    setPeerResetError("");
    setPeerResetForm({ ...emptyPeerResetForm, fullName: loginForm.username });
    setShowLockedDialog(false);
    setShowPeerResetModal(true);
  };

  const onClosePeerReset = () => {
    setShowPeerResetModal(false);
    setPeerResetForm(emptyPeerResetForm);
    setPeerResetError("");
  };

  /**
   * Le mot de passe temporaire obtenu pré-remplit le formulaire de connexion :
   * la connexion qui suit déclenche la modale de définition du mot de passe personnel.
   */
  const onSubmitPeerReset = async (e: FormEvent) => {
    e.preventDefault();
    if (isPeerResetting) return;
    setPeerResetError("");
    setIsPeerResetting(true);
    try {
      const result = await gtsApiClient.resetPasswordWithPeer({
        fullName: peerResetForm.fullName,
        validatorFullName: peerResetForm.validatorFullName,
        validatorPassword: peerResetForm.validatorPassword,
        reason: peerResetForm.reason
      });
      setLoginForm({ username: result.fullName, password: result.temporaryPassword });
      onClosePeerReset();
      onToast("Accès débloqué. Cliquez sur Connexion pour définir votre nouveau mot de passe.");
    } catch (err) {
      setPeerResetError(extractUserFacingErrorMessage(err, "Erreur lors du déblocage de l'accès."));
    } finally {
      setIsPeerResetting(false);
    }
  };

  return {
    loginForm,
    setLoginForm,
    onLogin,
    showPeerResetModal,
    peerResetForm,
    setPeerResetForm,
    peerResetError,
    isPeerResetting,
    onOpenPeerReset,
    onClosePeerReset,
    onSubmitPeerReset,
    isLoggingIn,
    showPasswordUpdateModal,
    showLockedDialog,
    setShowLockedDialog,
    pendingFirstLoginDisplayName: pendingFirstLogin?.displayName ?? "",
    passwordUpdateForm,
    onPasswordUpdateFormChange,
    passwordUpdateError,
    onFirstLogin,
    isPasswordLongEnough,
    isPasswordConfirmed,
    isPasswordDifferentFromTemporary
  };
}
