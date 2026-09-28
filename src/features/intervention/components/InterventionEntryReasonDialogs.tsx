/**
 * Dialogue motif d'annulation d'une intervention.
 */

import { CancelReasonConfirmModal } from "../../common/components/CancelReasonConfirmModal";

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
    <CancelReasonConfirmModal
      isOpen={showCancelReasonDialog}
      title="Motif d'annulation"
      message="Le motif est obligatoire pour annuler l'intervention."
      confirmLabel="Confirmer annulation"
      reason={cancelReasonInput}
      onReasonChange={onCancelReasonChange}
      onCancel={onCloseCancelDialog}
      onConfirm={onConfirmCancel}
    />
  );
}
