/**
 * Modale création / édition utilisateur : identité et rôles sur une ligne,
 * accès Paramètres et sécurité via interrupteurs.
 */

import type { FormEvent } from "react";
import { getDefaultPageAccessByRole, type CreateUserFormState } from "../model/settings.types";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";

type CreateUserModalProps = {
  isOpen: boolean;
  form: CreateUserFormState;
  mode: "create" | "edit";
  editingTechnicalUsername?: string;
  canEditPageAccess: boolean;
  onClose: () => void;
  onChange: (next: CreateUserFormState) => void;
  onSubmit: (e: FormEvent) => void;
};

export function CreateUserModal({
  isOpen,
  form,
  mode,
  editingTechnicalUsername,
  canEditPageAccess,
  onClose,
  onChange,
  onSubmit
}: CreateUserModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal fransor-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3>{mode === "create" ? "Créer un utilisateur" : "Modifier un utilisateur"}</h3>
        </div>
        <form onSubmit={onSubmit} className="form">
          {mode === "edit" && (
            <p className="muted">Identifiant technique: {editingTechnicalUsername || "-"}</p>
          )}
          <div className="user-modal__identity-row">
            <label>
              Nom affiché
              <input value={form.username} onChange={(e) => onChange({ ...form, username: e.target.value })} required />
            </label>
            <label>
              Rôle technique
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value as "RESPONSABLE" | "OPERATEUR";
                  onChange({
                    ...form,
                    role,
                    pageAccess: getDefaultPageAccessByRole(role)
                  });
                }}
              >
                <option value="OPERATEUR">Opérateur</option>
                <option value="RESPONSABLE">Responsable</option>
              </select>
            </label>
            <label>
              Profil métier
              <select
                value={form.managerProfile}
                disabled={form.role !== "RESPONSABLE"}
                title={form.role === "RESPONSABLE" ? undefined : "Réservé aux comptes responsables"}
                onChange={(e) =>
                  onChange({
                    ...form,
                    managerProfile: e.target.value as "SUPERVISEUR" | "RESPONSABLE_STATION" | "DIRECTEUR_STATION"
                  })
                }
              >
                <option value="SUPERVISEUR">Superviseur</option>
                <option value="RESPONSABLE_STATION">Responsable de station</option>
                <option value="DIRECTEUR_STATION">Directeur de station</option>
              </select>
            </label>
          </div>
          {mode === "create" && <p className="muted">Un identifiant technique unique est généré automatiquement par le système.</p>}
          {canEditPageAccess ? (
            <fieldset className="user-modal__page-access">
              <legend>Vues autorisées</legend>
              <ToggleSwitch
                label="Paramètres"
                labelFirst
                checked={form.pageAccess.settings}
                tooltip="Les vues métier (Interventions, Rondes, Gardiennage, Main courante, Fransor) sont ouvertes à tous les comptes ; seul l'accès à Paramètres se règle ici."
                onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, settings: next } })}
              />
            </fieldset>
          ) : (
            <p className="muted">
              Modification de l&apos;accès à Paramètres réservée au directeur de station et au responsable de station.
            </p>
          )}
          {mode === "edit" && (
            <fieldset className="user-modal__page-access">
              <legend>Sécurité</legend>
              <ToggleSwitch
                label="Demander la réinitialisation du mot de passe"
                labelFirst
                checked={form.mustResetPassword}
                onChange={(next) => onChange({ ...form, mustResetPassword: next })}
              />
            </fieldset>
          )}
          <div className="row-actions modal-actions">
            <button type="button" className="btn-light" onClick={onClose}>
              Fermer
            </button>
            <button type="submit">{mode === "create" ? "Créer l'utilisateur" : "Enregistrer les modifications"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
