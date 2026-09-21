/**
 * Dialogs annulation / abandon de saisie — fiche ronde.
 */

import { ConfirmModal } from "../../common/components/ConfirmModal";
import { DiscardConfirmModal, type DiscardConfirmKind } from "../../common/components/DiscardConfirmModal";

type RondeEntryReasonDialogsProps = {
  showDiscardConfirm: boolean;
  onCancelDiscard: () => void;
  onConfirmDiscard: () => void;
  discardKind?: DiscardConfirmKind;
  showCancelReasonDialog: boolean;
  cancelIsNonEffectuee: boolean;
  cancelReasonInput: string;
  onCancelReasonChange: (value: string) => void;
  onCloseCancelDialog: () => void;
  onConfirmCancellation: () => void;
};

export function RondeEntryReasonDialogs({
  showDiscardConfirm,
  onCancelDiscard,
  onConfirmDiscard,
  discardKind = "create",
  showCancelReasonDialog,
  cancelIsNonEffectuee,
  cancelReasonInput,
  onCancelReasonChange,
  onCloseCancelDialog,
  onConfirmCancellation
}: RondeEntryReasonDialogsProps) {
  return (
    <>
      <DiscardConfirmModal
        isOpen={showDiscardConfirm}
        kind={discardKind}
        onCancel={onCancelDiscard}
        onConfirm={onConfirmDiscard}
      />

      <ConfirmModal
        isOpen={showCancelReasonDialog}
        title={cancelIsNonEffectuee ? "Ronde non effectuée" : "Annuler la ronde"}
        message={
          cancelIsNonEffectuee
            ? "Le motif est obligatoire. La ronde sera marquée comme non effectuée par le prestataire."
            : "Le motif est obligatoire pour confirmer l'annulation de cette ronde déjà passée."
        }
        confirmLabel={cancelIsNonEffectuee ? "Confirmer non effectuée" : "Confirmer annulation"}
        confirmClassName="btn-danger"
        confirmDisabled={!cancelReasonInput.trim()}
        cancelLabel="Fermer"
        onCancel={onCloseCancelDialog}
        onConfirm={onConfirmCancellation}
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
    </>
  );
}
