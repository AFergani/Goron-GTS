import { useCallback, useEffect, useState } from "react";

/**
 * Fermeture contrôlée des modales de création : clic hors modale, Échap, bouton Annuler.
 * Si la saisie a changé, demande une confirmation avant de fermer.
 */
export function useCreateModalCloseGuard({
  enabled,
  isDirty,
  onClose
}: {
  enabled: boolean;
  isDirty: boolean;
  onClose: () => void;
}) {
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
