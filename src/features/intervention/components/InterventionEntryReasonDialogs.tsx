/**
 * Dialogue motif d'annulation d'une intervention.
 */

import { ConfirmModal } from "../../common/components/ConfirmModal";

type InterventionEntryReasonDialogsProps = {
  showCancelReasonDialog: boolean;
  cancelReasonInput: string;
  onCancelReasonChange: (value: string) => void;
  onCloseCancelDialog: () => void;
  onConfirmCancel: () => void;
};

export function InterventionEntryReasonDialogs({
  showCancelReasonDialog,
  cancelReasonInput,
  onCancelReasonChange,
  onCloseCancelDialog,
  onConfirmCancel
}: InterventionEntryReasonDialogsProps) {
  return (
    <ConfirmModal
      isOpen={showCancelReasonDialog}
      title="Motif d'annulation"
      message="Le motif est obligatoire pour annuler l'intervention."
      confirmLabel="Confirmer annulation"
      confirmClassName="btn-danger"
      confirmDisabled={!cancelReasonInput.trim()}
      cancelLabel="Fermer"
      onCancel={onCloseCancelDialog}
      onConfirm={onConfirmCancel}
    >
      <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
        <span style={{ fontSize: "0.85em", fontWeight: 600 }}>Motif *</span>
        <textarea
          className="mc-textarea"
          rows={2}
          value={cancelReasonInput}
          onChange={(e) => onCancelReasonChange(e.target.value)}
          placeholder="Ex. Motif exemple"
          autoFocus
        />
      </label>
    </ConfirmModal>
  );
}
