import { useEffect } from "react";

/**
 * Déplacement des modales par glisser-déposer sur l’en-tête (délégation document).
 *
 * Monté une fois dans `AppShell` : écouteurs globaux sur `pointerdown` / `move` / `up`
 * et double-clic. Poignée = `header` de `.modal`, `.mc-modal-head`, ou `h3` hors titres
 * d’aide. Les contrôles interactifs (boutons, champs, liens) ne déclenchent pas le drag.
 * Double-clic sur la poignée recentre la modale dans la fenêtre.
 *
 * Au premier drag, la modale passe en `position: fixed` avec coordonnées explicites
 * (largeur figée pour éviter les sauts de layout).
 */

type DragState = {
  pointerId: number;
  modal: HTMLElement;
  originX: number;
  originY: number;
  startLeft: number;
  startTop: number;
};

/** Cibles qui ne doivent pas initier ni bloquer implicitement un drag depuis la poignée */
const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, label, [role='button']";

/** Poignées autorisées ; exclut les titres du centre d’aide dans le corps de modale */
const HANDLE_SELECTOR =
  ".modal header, .mc-modal-head, .modal h3:not(.help-center-card-title):not(.help-center-content-title)";

export function useGlobalDraggableModals() {
  useEffect(() => {
    let drag: DragState | null = null;

    const centerModal = (modal: HTMLElement) => {
      const rect = modal.getBoundingClientRect();
      const centeredLeft = Math.round((window.innerWidth - rect.width) / 2);
      const centeredTop = Math.round((window.innerHeight - rect.height) / 2);
      modal.style.position = "fixed";
      modal.style.left = `${centeredLeft}px`;
      modal.style.top = `${centeredTop}px`;
      modal.style.margin = "0";
      modal.style.transform = "none";
      modal.style.width = `${rect.width}px`;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.originX;
      const dy = event.clientY - drag.originY;
      drag.modal.style.left = `${drag.startLeft + dx}px`;
      drag.modal.style.top = `${drag.startTop + dy}px`;
    };

    const stopDrag = (event: PointerEvent) => {
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      try {
        drag.modal.releasePointerCapture(event.pointerId);
      } catch {
        /* capture déjà libérée */
      }
      drag = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      const handle = target.closest(HANDLE_SELECTOR);
      if (!handle) return;
      const modal = target.closest(".modal") as HTMLElement | null;
      if (!modal) return;
      const rect = modal.getBoundingClientRect();
      modal.style.position = "fixed";
      modal.style.left = `${rect.left}px`;
      modal.style.top = `${rect.top}px`;
      modal.style.margin = "0";
      modal.style.transform = "none";
      modal.style.width = `${rect.width}px`;
      drag = {
        pointerId: event.pointerId,
        modal,
        originX: event.clientX,
        originY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top
      };
      modal.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      const handle = target.closest(HANDLE_SELECTOR);
      if (!handle) return;
      const modal = target.closest(".modal") as HTMLElement | null;
      if (!modal) return;
      centerModal(modal);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stopDrag);
    document.addEventListener("pointercancel", stopDrag);
    document.addEventListener("dblclick", onDoubleClick);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopDrag);
      document.removeEventListener("pointercancel", stopDrag);
      document.removeEventListener("dblclick", onDoubleClick);
    };
  }, []);
}
