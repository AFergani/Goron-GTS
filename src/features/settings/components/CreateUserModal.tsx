/**
 * Modale création / édition utilisateur : identité et rôles sur une ligne,
 * accès Paramètres via interrupteur, et motif d'audit obligatoire en modification.
 */

import type { FormEvent } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import type { ManagerProfile } from "../../../types";
import { getDefaultPageAccessByRole, type CreateUserFormState } from "../model/settings.types";
import { isAuditReasonValid, MIN_AUDIT_REASON_LENGTH } from "../../common/model/auditReason";
import { canSessionAssignRank } from "../model/userHierarchy";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";

const MANAGER_PROFILE_OPTIONS: { value: ManagerProfile; label: string }[] = [
  { value: "SUPERVISEUR", label: "Superviseur" },
  { value: "RESPONSABLE_STATION", label: "Responsable de station" },
  { value: "DIRECTEUR_STATION", label: "Directeur de station" }
];

type CreateUserModalProps = {
  isOpen: boolean;
  form: CreateUserFormState;
  mode: "create" | "edit";
  editingTechnicalUsername?: string;
  canEditPageAccess: boolean;
  session: Session | null;
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
  session,
  onClose,
  onChange,
  onSubmit
}: CreateUserModalProps) {
  if (!isOpen) return null;

  // Anti-élévation de privilège : on ne propose que les profils de rang inférieur ou égal au sien.
  const canAssignProfile = (profile: ManagerProfile) =>
    Boolean(session && canSessionAssignRank(session, "RESPONSABLE", profile));
  const reasonMissing = mode === "edit" && !isAuditReasonValid(form.reason);
  // On ne modifie pas son propre niveau hiérarchique : les sélecteurs restent en lecture seule.
  const isEditingSelf = mode === "edit" && Boolean(session) && editingTechnicalUsername === session?.user.username;
  const rankLockTitle = isEditingSelf ? "Votre propre niveau hiérarchique n'est pas modifiable" : undefined;

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
                disabled={isEditingSelf}
                title={rankLockTitle}
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
                disabled={isEditingSelf || form.role !== "RESPONSABLE"}
                title={rankLockTitle ?? (form.role === "RESPONSABLE" ? undefined : "Réservé aux comptes responsables")}
                onChange={(e) =>
                  onChange({
                    ...form,
                    managerProfile: e.target.value as "SUPERVISEUR" | "RESPONSABLE_STATION" | "DIRECTEUR_STATION"
                  })
                }
              >
                {MANAGER_PROFILE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} disabled={!canAssignProfile(option.value)}>
                    {option.label}
                  </option>
                ))}
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
            <label className="mc-field">
              <span>Motif de la modification (obligatoire, {MIN_AUDIT_REASON_LENGTH} caractères minimum)</span>
              <textarea
                className="mc-textarea"
                rows={2}
                value={form.reason}
                required
                minLength={MIN_AUDIT_REASON_LENGTH}
                placeholder="Ex: changement de fonction, correction du nom affiché, ouverture de l'accès Paramètres"
                onChange={(e) => onChange({ ...form, reason: e.target.value })}
              />
            </label>
          )}
          <div className="row-actions modal-actions">
            <button type="button" className="btn-light" onClick={onClose}>
              Fermer
            </button>
            <button type="submit" disabled={reasonMissing}>
              {mode === "create" ? "Créer l'utilisateur" : "Enregistrer les modifications"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
