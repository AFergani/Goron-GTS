/**
 * Dialogs annulation / abandon de saisie — fiche ronde.
 */

import { CancelReasonConfirmModal } from "../../common/components/CancelReasonConfirmModal";
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

      <CancelReasonConfirmModal
        isOpen={showCancelReasonDialog}
        title={cancelIsNonEffectuee ? "Ronde non effectuée" : "Annuler la ronde"}
        message={
          cancelIsNonEffectuee
            ? "Le motif est obligatoire. La ronde sera marquée comme non effectuée par le prestataire."
            : "Le motif est obligatoire pour confirmer l'annulation de cette ronde déjà passée."
        }
        confirmLabel={cancelIsNonEffectuee ? "Confirmer non effectuée" : "Confirmer annulation"}
        reason={cancelReasonInput}
        onReasonChange={onCancelReasonChange}
        onCancel={onCloseCancelDialog}
        onConfirm={onConfirmCancellation}
      />
    </>
  );
}
