/**
 * Dialogues motif d'annulation et justification non facturable.
 */

import { ConfirmModal } from "../../common/components/ConfirmModal";

type InterventionEntryReasonDialogsProps = {
  showCancelReasonDialog: boolean;
  cancelReasonInput: string;
  showBillingReasonDialog: boolean;
  billingReasonInput: string;
  onCancelReasonChange: (value: string) => void;
  onBillingReasonChange: (value: string) => void;
  onCloseCancelDialog: () => void;
  onCloseBillingDialog: () => void;
  onConfirmCancel: () => void;
  onConfirmNonBillable: () => void;
};

export function InterventionEntryReasonDialogs({
  showCancelReasonDialog,
  cancelReasonInput,
  showBillingReasonDialog,
  billingReasonInput,
  onCancelReasonChange,
  onBillingReasonChange,
  onCloseCancelDialog,
  onCloseBillingDialog,
  onConfirmCancel,
  onConfirmNonBillable
}: InterventionEntryReasonDialogsProps) {
  return (
    <>
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
            placeholder="Ex: intervention lancée par erreur"
            autoFocus
          />
        </label>
      </ConfirmModal>
      <ConfirmModal
        isOpen={showBillingReasonDialog}
        title="Justification non facturable"
        message="Une justification est obligatoire pour passer l'intervention en non facturable."
        confirmLabel="Confirmer non facturable"
        confirmClassName="btn-danger"
        confirmDisabled={!billingReasonInput.trim()}
        cancelLabel="Fermer"
        onCancel={onCloseBillingDialog}
        onConfirm={onConfirmNonBillable}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>Justification *</span>
          <textarea
            className="mc-textarea"
            rows={2}
            value={billingReasonInput}
            onChange={(e) => onBillingReasonChange(e.target.value)}
            placeholder="Ex: intervention hors contrat"
            autoFocus
          />
        </label>
      </ConfirmModal>
    </>
  );
}
