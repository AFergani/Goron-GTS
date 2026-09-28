/**
 * Modale création / édition utilisateur — même gabarit que les créations référentiel (`FormModal`).
 * L'accès Paramètres découle du rôle (oui pour responsable, non pour opérateur).
 */

import type { Session } from "../../../app/session/SessionProvider";
import type { BusinessProfile, ManagerProfile } from "../../../types";
import { FormModal } from "../../common/components/FormModal";
import { isAuditReasonValid, MIN_AUDIT_REASON_LENGTH } from "../../common/model/auditReason";
import { getDefaultPageAccessByRole, type CreateUserFormState } from "../model/settings.types";
import { canSessionAssignRank } from "../model/userHierarchy";

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
  session: Session | null;
  onClose: () => void;
  onChange: (next: CreateUserFormState) => void;
  onSubmit: () => void | Promise<void>;
};

export function CreateUserModal({
  isOpen,
  form,
  mode,
  editingTechnicalUsername,
  session,
  onClose,
  onChange,
  onSubmit
}: CreateUserModalProps) {
  // Anti-élévation de privilège : on ne propose que les profils de rang inférieur ou égal au sien.
  const canAssignProfile = (profile: ManagerProfile) =>
    Boolean(session && canSessionAssignRank(session, "RESPONSABLE", profile));
  const reasonMissing = mode === "edit" && !isAuditReasonValid(form.reason);
  const nameMissing = !String(form.username || "").trim();
  // On ne modifie pas son propre niveau hiérarchique : les sélecteurs restent en lecture seule.
  const isEditingSelf = mode === "edit" && Boolean(session) && editingTechnicalUsername === session?.user.username;
  // Promouvoir un compte est réservé au responsable de station, au directeur et à l’Admin.
  const isSupervisor =
    session?.user.role === "RESPONSABLE" && session.user.managerProfile === "SUPERVISEUR";
  const rankLocked = isEditingSelf || isSupervisor;
  const rankLockTitle = isEditingSelf
    ? "Votre propre niveau hiérarchique n'est pas modifiable"
    : isSupervisor
      ? "Seul un responsable de station ou un directeur peut modifier le niveau hiérarchique"
      : undefined;
  const submitTitle = reasonMissing
    ? `Saisissez un motif d’au moins ${MIN_AUDIT_REASON_LENGTH} caractères pour débloquer l’enregistrement.`
    : nameMissing
      ? "Le nom affiché est obligatoire."
      : undefined;

  return (
    <FormModal
      isOpen={isOpen}
      title={mode === "create" ? "Créer un utilisateur" : "Modifier un utilisateur"}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={mode === "create" ? "Créer l'utilisateur" : "Enregistrer les modifications"}
      submitDisabled={reasonMissing || nameMissing}
      submitTitle={submitTitle}
    >
      <div className="form">
        <label>
          <span>
            Nom affiché
            {mode === "create" && (
              <span
                className="muted"
                title="Un identifiant technique unique est généré automatiquement par le système."
                aria-label="Un identifiant technique unique est généré automatiquement par le système."
              >
                {"\u00a0"}*
              </span>
            )}
          </span>
          <input
            value={form.username}
            onChange={(e) => onChange({ ...form, username: e.target.value })}
            required
          />
        </label>
        <label>
          Rôle technique
          <select
            value={form.role}
            disabled={rankLocked}
            title={rankLockTitle}
            onChange={(e) => {
              const role = e.target.value as "RESPONSABLE" | "OPERATEUR";
              const managerProfile: CreateUserFormState["managerProfile"] =
                role === "RESPONSABLE"
                  ? form.managerProfile === "OPERATEUR_PLUS" || form.managerProfile === ""
                    ? "SUPERVISEUR"
                    : form.managerProfile
                  : form.managerProfile === "OPERATEUR_PLUS"
                    ? "OPERATEUR_PLUS"
                    : "";
              onChange({
                ...form,
                role,
                managerProfile,
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
            value={form.role === "OPERATEUR" ? form.managerProfile : form.managerProfile || "SUPERVISEUR"}
            disabled={rankLocked}
            title={
              rankLockTitle ??
              (form.role === "OPERATEUR" ? "Opérateur + ouvre la page Remarques vidéo" : undefined)
            }
            onChange={(e) =>
              onChange({
                ...form,
                managerProfile: e.target.value as BusinessProfile | ""
              })
            }
          >
            {form.role === "OPERATEUR" ? (
              <>
                <option value="">Opérateur</option>
                <option value="OPERATEUR_PLUS">Opérateur +</option>
              </>
            ) : (
              MANAGER_PROFILE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={!canAssignProfile(option.value)}>
                  {option.label}
                </option>
              ))
            )}
          </select>
        </label>
        {mode === "edit" && (
          <label className="mc-field">
            <span>Motif de la modification (obligatoire, {MIN_AUDIT_REASON_LENGTH} caractères minimum)</span>
            <textarea
              className="mc-textarea"
              rows={2}
              value={form.reason}
              required
              minLength={MIN_AUDIT_REASON_LENGTH}
              placeholder="Ex. Motif exemple"
              onChange={(e) => onChange({ ...form, reason: e.target.value })}
            />
          </label>
        )}
      </div>
    </FormModal>
  );
}
