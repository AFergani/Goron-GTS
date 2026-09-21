/**
 * Dialogs annulation / quitter sans créer — fiche ronde.
 */

import { ConfirmModal } from "../../common/components/ConfirmModal";

type RondeEntryReasonDialogsProps = {
  showDiscardConfirm: boolean;
  onCancelDiscard: () => void;
  onConfirmDiscard: () => void;
  /** Texte de confirmation (création vs édition) */
  discardMessage?: string;
  discardConfirmLabel?: string;
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
  discardMessage = "Êtes-vous sûr de vouloir quitter sans créer l'entrée ? Les données saisies seront perdues.",
  discardConfirmLabel = "Quitter sans créer",
  showCancelReasonDialog,
  cancelIsNonEffectuee,
  cancelReasonInput,
  onCancelReasonChange,
  onCloseCancelDialog,
  onConfirmCancellation
}: RondeEntryReasonDialogsProps) {
  return (
    <>
      <ConfirmModal
        isOpen={showDiscardConfirm}
        title="Quitter la saisie ?"
        message={discardMessage}
        cancelLabel="Rester"
        confirmLabel={discardConfirmLabel}
        confirmClassName="btn-danger"
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
            placeholder={
              cancelIsNonEffectuee
                ? "Ex: prestataire absent / accès impossible"
                : "Ex: doublon / demande annulée"
            }
            autoFocus
          />
        </label>
      </ConfirmModal>
    </>
  );
}
