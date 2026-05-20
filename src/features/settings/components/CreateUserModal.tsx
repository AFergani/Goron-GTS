import type { FormEvent } from "react";
import type { CreateUserFormState } from "../model/settings.types";
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
          <label>
            Nom affiché
            <input value={form.username} onChange={(e) => onChange({ ...form, username: e.target.value })} required />
          </label>
          {mode === "create" && <p className="muted">Un identifiant technique unique est généré automatiquement par le système.</p>}
          <label>
            Rôle technique
            <select
              value={form.role}
              onChange={(e) => onChange({ ...form, role: e.target.value as "RESPONSABLE" | "OPERATEUR" })}
            >
              <option value="OPERATEUR">Opérateur</option>
              <option value="RESPONSABLE">Responsable</option>
            </select>
          </label>
          {form.role === "RESPONSABLE" && (
            <label>
              Profil métier du responsable
              <select
                value={form.managerProfile}
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
          )}
          {canEditPageAccess ? (
            <fieldset>
              <legend>Vues autorisées</legend>
              <div className="toggle-field-list">
                <ToggleSwitch
                  label="Main courante"
                  checked={form.pageAccess.mainCourante}
                  onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, mainCourante: next } })}
                />
                <ToggleSwitch
                  label="Fransor"
                  checked={form.pageAccess.fransor}
                  onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, fransor: next } })}
                />
                <ToggleSwitch
                  label="Intervention"
                  checked={form.pageAccess.intervention}
                  onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, intervention: next } })}
                />
                <ToggleSwitch
                  label="Rondes"
                  checked={form.pageAccess.rondes}
                  onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, rondes: next } })}
                />
                <ToggleSwitch
                  label="Paramètres"
                  checked={form.pageAccess.settings}
                  onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, settings: next } })}
                />
                <ToggleSwitch
                  label="Gardiennage"
                  checked={form.pageAccess.gardiennage}
                  onChange={(next) => onChange({ ...form, pageAccess: { ...form.pageAccess, gardiennage: next } })}
                />
              </div>
            </fieldset>
          ) : (
            <p className="muted">
              Modification des accès pages réservée au directeur de station et au responsable de station.
            </p>
          )}
          {mode === "edit" && (
            <fieldset>
              <legend>Sécurité</legend>
              <div className="toggle-field-list">
                <ToggleSwitch
                  label="Demander la réinitialisation du mot de passe"
                  checked={form.mustResetPassword}
                  onChange={(next) => onChange({ ...form, mustResetPassword: next })}
                />
              </div>
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
