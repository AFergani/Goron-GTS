import { useCallback, useEffect, useState } from "react";
import { useModalEscape } from "./useModalEscape";

/**
 * Garde de fermeture pour modales de saisie avec risque de perte de brouillon.
 *
 * Expose `requestClose` à brancher sur overlay, Fermer, croix et Échap : si `enabled`
 * et `isDirty`, ouvre une confirmation (`showDiscardConfirm`) au lieu de fermer tout de suite.
 * Si `enabled` est faux (sous-dialogue ouvert), `requestClose` ne fait rien.
 *
 * Échap : fermeture ou confirmation ; pendant la confirmation, `ConfirmModal` reprend Échap
 * (annuler l’abandon) grâce à la pile de `useModalEscape`.
 *
 * Utilisé par : MainCouranteEntryModal, InterventionEntryModal, RondeEntryModal,
 * GardiennageEntryModal, GardiennageCloseModal, et d’autres formulaires longs.
 */

type UseCreateModalCloseGuardParams = {
  /** Modale visible et éligible à Échap / confirmation (souvent `isOpen` hors sous-dialogue). */
  enabled: boolean;
  isDirty: boolean;
  onClose: () => void;
};

export function useCreateModalCloseGuard({
  enabled,
  isDirty,
  onClose
}: UseCreateModalCloseGuardParams) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const attemptClose = useCallback(() => {
    if (!enabled) return;
    if (isDirty) setShowDiscardConfirm(true);
    else onClose();
  }, [enabled, isDirty, onClose]);

  const confirmDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => setShowDiscardConfirm(false), []);

  useEffect(() => {
    if (!enabled) setShowDiscardConfirm(false);
  }, [enabled]);

  useModalEscape(enabled && !showDiscardConfirm, attemptClose);

  return {
    requestClose: attemptClose,
    showDiscardConfirm,
    confirmDiscardAndClose,
    cancelDiscard
  };
}
