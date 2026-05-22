import { useCallback, useEffect, useState } from "react";

/**
 * Garde de fermeture pour modales de saisie avec risque de perte de brouillon.
 *
 * Expose `requestClose` à brancher sur overlay, Annuler, croix et Échap : si `enabled`
 * et `isDirty`, ouvre une confirmation (`showDiscardConfirm`) au lieu de fermer tout de suite.
 * Si `enabled` est faux, `requestClose` appelle `onClose` directement (mode édition ou
 * sous-dialogue actif).
 *
 * Échap en phase capture : fermeture ou abandon de la confirmation selon l’état.
 * La modale `ConfirmModal` « Abandonner la saisie ? » est câblée par le parent via
 * `confirmDiscardAndClose` / `cancelDiscard`.
 *
 * Utilisé par : MainCouranteEntryModal, InterventionEntryModal, RondeEntryModal,
 * GardiennageEntryModal.
 */

type UseCreateModalCloseGuardParams = {
  /** Active la confirmation si saisie modifiée (souvent mode création uniquement) */
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
    if (!enabled) {
      onClose();
      return;
    }
    if (isDirty) setShowDiscardConfirm(true);
    else onClose();
  }, [enabled, isDirty, onClose]);

  const confirmDiscardAndClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => setShowDiscardConfirm(false), []);

  /* Échap : tenter de fermer la modale de création */
  useEffect(() => {
    if (!enabled || showDiscardConfirm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      attemptClose();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [enabled, showDiscardConfirm, attemptClose]);

  /* Échap pendant la confirmation : revenir à la saisie */
  useEffect(() => {
    if (!enabled || !showDiscardConfirm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancelDiscard();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [enabled, showDiscardConfirm, cancelDiscard]);

  return {
    requestClose: attemptClose,
    showDiscardConfirm,
    confirmDiscardAndClose,
    cancelDiscard
  };
}
