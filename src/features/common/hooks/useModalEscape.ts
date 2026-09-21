/**
 * Échap sur la modale la plus haute : une pile évite de fermer une fenêtre derrière une confirmation.
 *
 * Utilisé par `ConfirmModal`, `FormModal`, `useCreateModalCloseGuard` et les modales autonomes.
 * Les fenêtres bloquantes (panne PG, premier mot de passe) ne s’y enregistrent pas.
 */

import { useEffect } from "react";

const escapeStack: Array<() => void> = [];

/**
 * Enregistre un gestionnaire Échap tant que la modale est active.
 *
 * @param isActive - La modale est visible et doit réagir à Échap.
 * @param onEscape - Fermeture ou ouverture de la confirmation d’abandon.
 */
export function useModalEscape(isActive: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!isActive) return;
    escapeStack.push(onEscape);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (escapeStack[escapeStack.length - 1] !== onEscape) return;
      if (event.target instanceof HTMLSelectElement) return;
      if (document.querySelector('[data-suggest-open="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      const index = escapeStack.lastIndexOf(onEscape);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [isActive, onEscape]);
}
