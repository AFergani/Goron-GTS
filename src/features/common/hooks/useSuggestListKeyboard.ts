/**
 * Navigation clavier d'une liste de suggestions (autocomplete).
 *
 * Le focus reste dans le champ : flèches haut/bas déplacent la surbrillance,
 * Entrée valide l'élément actif (sans soumettre le formulaire parent).
 * La surbrillance revient au premier résultat quand le texte saisi change,
 * et l'élément actif est ramené dans la zone visible.
 *
 * Utilisé par : SiteSearchInput, IntervenantSearchInput, FamilleSearchInput.
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";

type UseSuggestListKeyboardParams<T> = {
  /** Résultats actuellement proposés */
  items: T[];
  /** Liste visible (assez de caractères, pas encore de sélection) */
  isOpen: boolean;
  /** Validation de l'élément surligné */
  onPick: (item: T) => void;
  /** Ferme la liste (Échap) sans fermer la modale parente */
  onDismiss?: () => void;
  /** Texte saisi : remet la surbrillance sur le premier résultat sans la perdre au refresh des listes */
  resetKey?: string;
};

type UseSuggestListKeyboardResult = {
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  listboxId: string;
  getOptionId: (index: number) => string;
  activeDescendantId: string | undefined;
  listRef: RefObject<HTMLUListElement | null>;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * Gère la surbrillance clavier d'une listbox associée à un champ de recherche.
 *
 * @param params.items - Suggestions affichées
 * @param params.isOpen - Indique si la liste est visible et navigable
 * @param params.onPick - Appelé avec l'élément actif sur Entrée
 * @param params.onDismiss - Ferme la liste sur Échap (la modale parente reste ouverte)
 * @param params.resetKey - Texte de recherche : remet la surbrillance sur le premier résultat
 * @returns Index actif, identifiants ARIA, ref de liste et handler `onKeyDown`
 */
export function useSuggestListKeyboard<T>({
  items,
  isOpen,
  onPick,
  onDismiss,
  resetKey
}: UseSuggestListKeyboardParams<T>): UseSuggestListKeyboardResult {
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const itemCount = items.length;

  const getOptionId = useCallback((index: number) => `${listboxId}-opt-${index}`, [listboxId]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [isOpen, resetKey]);

  useEffect(() => {
    if (itemCount === 0) return;
    setHighlightedIndex((prev) => Math.min(prev, itemCount - 1));
  }, [itemCount]);

  useEffect(() => {
    if (!isOpen || itemCount === 0) return;
    const active = listRef.current?.querySelector<HTMLElement>(`[data-suggest-index="${highlightedIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, isOpen, itemCount]);

  const onInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || itemCount === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % itemCount);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + itemCount) % itemCount);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const item = items[highlightedIndex];
        if (item) onPick(item);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onDismiss?.();
      }
    },
    [highlightedIndex, isOpen, itemCount, items, onPick, onDismiss]
  );

  const activeDescendantId = isOpen && itemCount > 0 ? getOptionId(highlightedIndex) : undefined;

  return {
    highlightedIndex,
    setHighlightedIndex,
    listboxId,
    getOptionId,
    activeDescendantId,
    listRef,
    onInputKeyDown
  };
}
