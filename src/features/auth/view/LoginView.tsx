/**
 * Écran de connexion Goron-GTS (affiché sans session active dans `AppShell`).
 *
 * Vue contrôlée : formulaire nom affiché / mot de passe. La persistance métier
 * repose sur PostgreSQL (bootstrap connexion serveur avant cet écran si besoin).
 * Handlers : `useAuthPresenter`.
 */

import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import type { LoginFormState } from "../model/auth.types";
import { PasswordInput } from "../../common/components/PasswordInput";
import { AuthLogo } from "../components/AuthLogo";
import { useModalEscape } from "../../common/hooks/useModalEscape";

type LoginViewProps = {
  loginForm: LoginFormState;
  error: string;
  showLockedDialog: boolean;
  /** Empêche les doubles soumissions pendant l'attente PostgreSQL / auth. */
  isLoggingIn: boolean;
  onCloseLockedDialog: () => void;
  onLogin: (e: FormEvent) => void;
  onChange: (next: LoginFormState) => void;
  /** Ouvre la réinitialisation validée par un collègue présent. */
  onOpenPeerReset: () => void;
  /** Affiche le lien de récupération si PostgreSQL est injoignable. */
  showDbRecoveryLink?: boolean;
  /** Ouvre l'écran de reconfiguration de la connexion DB. */
  onOpenDbRecovery?: () => void;
};

export function LoginView({
  loginForm,
  error,
  showLockedDialog,
  isLoggingIn,
  onCloseLockedDialog,
  onLogin,
  onChange,
  onOpenPeerReset,
  showDbRecoveryLink = false,
  onOpenDbRecovery
}: LoginViewProps) {
  useModalEscape(showLockedDialog, onCloseLockedDialog);
  return (
    <main className="auth-page">
      {showLockedDialog && (
        <div className="modal-overlay" onClick={onCloseLockedDialog}>
          <section className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Compte bloqué</h3>
            <p>
              Votre compte a été bloqué après trop de tentatives de connexion échouées.
            </p>
            <p className="muted">
              Le blocage se lève automatiquement au bout de 15 minutes. Si vous avez oublié votre mot de passe,
              faites-le réinitialiser par votre responsable, ou par un collègue présent via « Mot de passe oublié ».
            </p>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={onCloseLockedDialog}>
                Fermer
              </button>
              <button type="button" onClick={onOpenPeerReset}>
                Mot de passe oublié
              </button>
            </div>
          </section>
        </div>
      )}
      <section className="panel login-panel" aria-busy={isLoggingIn}>
        <AuthLogo />
        <h1>Connexion GTS</h1>
        <form onSubmit={onLogin} className="form">
          <label>
            Nom affiché
            <input
              value={loginForm.username}
              onChange={(e) => onChange({ ...loginForm, username: e.target.value })}
              required
              disabled={isLoggingIn}
              autoComplete="username"
            />
          </label>
          <label>
            Mot de passe
            <PasswordInput
              value={loginForm.password}
              onChange={(password) => onChange({ ...loginForm, password })}
              required
              disabled={isLoggingIn}
              autoComplete="current-password"
              aria-label="Mot de passe"
            />
          </label>
          <button type="submit" disabled={isLoggingIn} aria-busy={isLoggingIn}>
            {isLoggingIn ? (
              <span className="login-submit-busy">
                <Loader2 size={16} className="login-spinner" aria-hidden />
                Connexion en cours…
              </span>
            ) : (
              "Connexion"
            )}
          </button>
        </form>
        <div className="login-links">
          <button type="button" className="link-btn" onClick={onOpenPeerReset} disabled={isLoggingIn}>
            Mot de passe oublié ?
          </button>
          {showDbRecoveryLink && onOpenDbRecovery ? (
            <button type="button" className="link-btn" onClick={onOpenDbRecovery} disabled={isLoggingIn}>
              Base de données inaccessible ?
            </button>
          ) : null}
        </div>
        {isLoggingIn ? (
          <p className="muted login-status" role="status">
            Vérification de l&apos;identité et accès à la base…
          </p>
        ) : null}
        {error && !isLoggingIn ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
