/**
 * Écran de connexion Goron-GTS (affiché sans session active dans `AppShell`).
 *
 * Vue contrôlée : formulaire nom affiché / mot de passe, choix initial de la base
 * si non configurée, dialogue compte bloqué. Handlers fournis par `useAuthPresenter`
 * et `useSettingsPresenter` (chemin DB).
 */

import type { FormEvent } from "react";
import type { LoginFormState } from "../model/auth.types";
import logoGts from "../../../assets/logo-gts.png";

type LoginViewProps = {
  loginForm: LoginFormState;
  /** `null` tant que la config DB n'est pas chargée ; `false` impose le choix du fichier .db */
  dbConfigured: boolean | null;
  error: string;
  showLockedDialog: boolean;
  onCloseLockedDialog: () => void;
  onChooseDbPath: () => void;
  onLogin: (e: FormEvent) => void;
  onChange: (next: LoginFormState) => void;
};

export function LoginView({
  loginForm,
  dbConfigured,
  error,
  showLockedDialog,
  onCloseLockedDialog,
  onChooseDbPath,
  onLogin,
  onChange
}: LoginViewProps) {
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
              Contactez votre responsable ou le directeur de station pour qu'il réinitialise votre accès depuis la gestion des utilisateurs.
            </p>
            <div className="row-actions modal-actions">
              <button type="button" onClick={onCloseLockedDialog}>
                Fermer
              </button>
            </div>
          </section>
        </div>
      )}
      {dbConfigured === false && (
        <section className="panel login-panel">
          <h3>Configuration base de données</h3>
          <p className="muted">Sélectionnez le fichier de base de données (.db) avant toute connexion.</p>
          <button type="button" onClick={onChooseDbPath}>
            Choisir l'emplacement de la DB
          </button>
        </section>
      )}
      <section className="panel login-panel">
        <div className="logo-slot">
          <img src={logoGts} alt="Logo GTS" className="logo-image" />
        </div>
        <h1>Connexion GTS</h1>
        <form onSubmit={onLogin} className="form">
          <label>
            Nom affiché
            <input value={loginForm.username} onChange={(e) => onChange({ ...loginForm, username: e.target.value })} required />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) => onChange({ ...loginForm, password: e.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={dbConfigured !== true}>
            Connexion
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
