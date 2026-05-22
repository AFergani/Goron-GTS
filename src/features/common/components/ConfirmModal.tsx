/**
 * Modale de confirmation réutilisable (annuler / confirmer, action async).
 *
 * Utilisée dans les modales métier, Paramètres et AppShell pour les suppressions,
 * validations avec motif (`children`) ou dialogues du presenter settings.
 * Overlay cliquable pour annuler ; état « Enregistrement… » pendant `onConfirm` async.
 */

import { useState } from "react";
import type { ReactNode } from "react";

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClassName?: string;
  /** Désactive le bouton de confirmation (ex. champ obligatoire non rempli) */
  confirmDisabled?: boolean;
  /** Libellé du bouton secondaire (annulation / retour) */
  cancelLabel?: string;
  /** Contenu additionnel affiché entre le message et les boutons (ex. champ motif) */
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmClassName,
  confirmDisabled = false,
  cancelLabel = "Annuler",
  children,
  onCancel,
  onConfirm
}: ConfirmModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isConfirming || confirmDisabled) return;
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => (!isConfirming ? onCancel() : undefined)}>
      <section className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{message}</p>
        {children}
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName || undefined}
            disabled={confirmDisabled || isConfirming}
            onClick={() => void handleConfirm()}
          >
            {isConfirming ? "Enregistrement…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
