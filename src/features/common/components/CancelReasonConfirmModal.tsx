/**
 * Confirmation d'annulation avec motif obligatoire.
 *
 * Réutilisé par les fiches intervention, ronde et gardiennage.
 * Le libellé, le titre et le message restent propres à chaque page.
 */

import { ConfirmModal } from "./ConfirmModal";

type CancelReasonConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  /** Libellé au-dessus du champ. */
  reasonLabel?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
};

/**
 * Modale Fermer / confirmer avec zone de motif. La confirmation est bloquée tant que le motif est vide.
 */
export function CancelReasonConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  reasonLabel = "Motif *",
  placeholder = "Ex. Motif exemple",
  rows = 2,
  maxLength
}: CancelReasonConfirmModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      confirmClassName="btn-danger"
      confirmDisabled={!reason.trim()}
      cancelLabel="Fermer"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
        <span style={{ fontSize: "0.85em", fontWeight: 600 }}>{reasonLabel}</span>
        <textarea
          className="mc-textarea"
          rows={rows}
          value={reason}
          maxLength={maxLength}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      </label>
    </ConfirmModal>
  );
}
