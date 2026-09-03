/**
 * Modale formulaire réutilisable (titre, contenu, annuler / soumettre).
 *
 * Utilisée pour les créations référentiel, alertes à bouton unique ou formulaires
 * métier avec validation locale avant soumission async.
 */

import { useState, type ReactNode } from "react";

type FormModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Masque le bouton annuler (alerte à bouton unique) */
  hideCancel?: boolean;
  /** Désactive les actions pendant une opération externe */
  busy?: boolean;
  error?: string;
  submitDisabled?: boolean;
};

export function FormModal({
  isOpen,
  title,
  onClose,
  children,
  onSubmit,
  submitLabel = "Enregistrer",
  cancelLabel = "Annuler",
  hideCancel = false,
  busy = false,
  error,
  submitDisabled = false
}: FormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (!isOpen) return null;

  const disabled = busy || isSubmitting;

  const handleSubmit = async () => {
    if (!onSubmit || disabled || submitDisabled) return;
    setIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => (!disabled ? onClose() : undefined)}>
      <section className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        {error ? <p className="error">{error}</p> : null}
        <div className="row-actions modal-actions">
          {!hideCancel ? (
            <button type="button" className="btn-light" onClick={onClose} disabled={disabled}>
              {cancelLabel}
            </button>
          ) : null}
          {onSubmit ? (
            <button type="button" onClick={() => void handleSubmit()} disabled={disabled || submitDisabled}>
              {disabled ? "Enregistrement…" : submitLabel}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
