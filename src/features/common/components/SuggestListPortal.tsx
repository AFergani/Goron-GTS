/**
 * Liste de suggestions rendue hors de la modale.
 *
 * Taille fixe, au-dessus du contenu, sans élargir le champ ni la fenêtre.
 * Utilisé par la recherche site et prestataire.
 */

import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Largeur unique des listes site / prestataire (28rem). */
const PANEL_WIDTH_PX = 448;

type SuggestListPortalProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

type PanelBox = {
  top: number;
  left: number;
  width: number;
};

export function SuggestListPortal({ open, anchorRef, children }: SuggestListPortalProps) {
  const [box, setBox] = useState<PanelBox | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH_PX, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      const height = Math.min(220, window.innerHeight * 0.45);
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - 8 && rect.top > height + 8) {
        top = rect.top - height - 4;
      }
      setBox({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  if (!open || !box) return null;

  return createPortal(
    <div className="mc-site-suggest-portal" style={{ top: box.top, left: box.left, width: box.width }}>
      {children}
    </div>,
    document.body
  );
}
