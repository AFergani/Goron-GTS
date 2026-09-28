/**
 * Modale de première connexion : définition du mot de passe personnel obligatoire.
 *
 * Affichée par `AppShell` lorsque `mustChangePassword` est vrai après login.
 * Logique métier et validation dans `useAuthPresenter` (vue contrôlée).
 */

import type { FormEvent } from "react";
import type { PasswordUpdateFormState } from "../model/auth.types";
import { PasswordInput } from "../../common/components/PasswordInput";
import { MIN_USER_PASSWORD_LENGTH } from "../model/passwordPolicy";
import { AuthLogo } from "../components/AuthLogo";

type FirstLoginModalProps = {
  isOpen: boolean;
  form: PasswordUpdateFormState;
  isPasswordLongEnough: boolean;
  isPasswordConfirmed: boolean;
  isPasswordDifferentFromTemporary: boolean;
  error: string;
  displayName: string;
  onChange: (next: PasswordUpdateFormState) => void;
  onSubmit: (e: FormEvent) => void;
};

/**
 * Formulaire nouveau mot de passe + indicateurs de validation (8 caractères, confirmation,
 * différence avec le mot de passe temporaire).
 *
 * La modale couvre tout l'écran : elle doit afficher ses propres refus, un message posé
 * sous le formulaire de connexion resterait invisible derrière elle.
 */
export function FirstLoginModal({
  isOpen,
  form,
  isPasswordLongEnough,
  isPasswordConfirmed,
  isPasswordDifferentFromTemporary,
  error,
  displayName,
  onChange,
  onSubmit
}: FirstLoginModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay modal-overlay--auth-first-login">
      <section className="modal modal--first-login" onClick={(e) => e.stopPropagation()}>
        <AuthLogo compact />
        <h3>Mise à jour du mot de passe</h3>
        <p className="muted">Bienvenue {displayName}, veuillez définir votre mot de passe personnel.</p>
        <p className="muted">Il ne doit pas reprendre un mot de passe déjà utilisé récemment (y compris le temporaire).</p>
        <form onSubmit={onSubmit} className="form">
          <label title={`${MIN_USER_PASSWORD_LENGTH} caractères minimum, sans contrainte de complexité`}>
            Nouveau mot de passe
            <PasswordInput
              value={form.newPassword}
              onChange={(newPassword) => onChange({ ...form, newPassword })}
              required
              autoComplete="new-password"
              aria-label="Nouveau mot de passe"
            />
          </label>
          <label>
            Confirmer le mot de passe
            <PasswordInput
              value={form.confirmPassword}
              onChange={(confirmPassword) => onChange({ ...form, confirmPassword })}
              required
              autoComplete="new-password"
              aria-label="Confirmer le mot de passe"
            />
          </label>
          <div className="validation-box">
            <p className={isPasswordLongEnough ? "ok" : "ko"}>
              {isPasswordLongEnough ? "✓" : "✗"} Le mot de passe doit contenir au moins {MIN_USER_PASSWORD_LENGTH} caractères.
            </p>
            <p className={isPasswordConfirmed ? "ok" : "ko"}>
              {isPasswordConfirmed ? "✓" : "✗"} Confirmation du mot de passe identique.
            </p>
            <p className={isPasswordDifferentFromTemporary ? "ok" : "ko"}>
              {isPasswordDifferentFromTemporary ? "✓" : "✗"} Différent du mot de passe temporaire reçu.
            </p>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <div className="row-actions">
            <button type="submit">Valider</button>
          </div>
        </form>
      </section>
    </div>
  );
}
