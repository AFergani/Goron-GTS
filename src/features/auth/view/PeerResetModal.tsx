/**
 * Modale « mot de passe oublié » : réinitialisation validée par un collègue présent.
 *
 * Sert les postes sans responsable ni superviseur (nuit, week-end). Le collègue
 * s'authentifie avec ses propres identifiants et son nom est inscrit dans le journal
 * à côté de celui du bénéficiaire. Logique dans `useAuthPresenter`.
 */

import type { FormEvent } from "react";
import type { PeerResetFormState } from "../model/auth.types";
import { isAuditReasonValid, MIN_AUDIT_REASON_LENGTH } from "../../common/model/auditReason";
import { PasswordInput } from "../../common/components/PasswordInput";
import { AuthLogo } from "../components/AuthLogo";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";

type PeerResetModalProps = {
  isOpen: boolean;
  form: PeerResetFormState;
  error: string;
  busy: boolean;
  onChange: (next: PeerResetFormState) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
};

export function PeerResetModal({ isOpen, form, error, busy, onChange, onClose, onSubmit }: PeerResetModalProps) {
  const isDirty = Boolean(
    form.fullName.trim() ||
      form.validatorFullName.trim() ||
      form.validatorPassword ||
      form.reason.trim()
  );
  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } = useCreateModalCloseGuard({
    enabled: isOpen && !busy,
    isDirty,
    onClose
  });
  if (!isOpen) return null;

  const canSubmit =
    form.fullName.trim().length > 0 &&
    form.validatorFullName.trim().length > 0 &&
    form.validatorPassword.length > 0 &&
    isAuditReasonValid(form.reason);

  return (
    <>
    <div className="modal-overlay" onClick={busy ? undefined : requestClose}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <AuthLogo compact />
        <h3>Mot de passe oublié</h3>
        <p className="muted">
          En l&apos;absence d&apos;un responsable, un collègue présent peut débloquer votre accès. Il s&apos;identifie
          ci-dessous et ne peut le faire que pour un profil de niveau inférieur ou égal au sien.
        </p>
        <p className="muted">
          L&apos;opération est enregistrée dans le journal des actions avec les deux noms et le motif.
        </p>
        <form onSubmit={onSubmit} className="form">
          <label>
            Votre nom affiché
            <input
              value={form.fullName}
              onChange={(e) => onChange({ ...form, fullName: e.target.value })}
              required
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <fieldset className="peer-reset__validator">
            <legend>Collègue qui valide</legend>
            <label>
              Son nom affiché
              <input
                value={form.validatorFullName}
                onChange={(e) => onChange({ ...form, validatorFullName: e.target.value })}
                required
                disabled={busy}
                autoComplete="off"
              />
            </label>
            <label>
              Son mot de passe
              <PasswordInput
                value={form.validatorPassword}
                onChange={(validatorPassword) => onChange({ ...form, validatorPassword })}
                required
                disabled={busy}
                autoComplete="off"
                aria-label="Mot de passe du collègue validateur"
              />
            </label>
          </fieldset>
          <label className="mc-field">
            <span>Motif (obligatoire, {MIN_AUDIT_REASON_LENGTH} caractères minimum)</span>
            <textarea
              className="mc-textarea"
              rows={2}
              value={form.reason}
              required
              disabled={busy}
              placeholder="Ex: code oublié après congés, identité vérifiée par le collègue présent"
              onChange={(e) => onChange({ ...form, reason: e.target.value })}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="row-actions modal-actions">
            <button type="button" className="btn-light" onClick={requestClose} disabled={busy}>
              Annuler
            </button>
            <button type="submit" disabled={busy || !canSubmit}>
              {busy ? "Vérification…" : "Débloquer l'accès"}
            </button>
          </div>
        </form>
      </section>
    </div>
    <DiscardConfirmModal
      isOpen={showDiscardConfirm}
      onCancel={cancelDiscard}
      onConfirm={confirmDiscardAndClose}
    />
    </>
  );
}
