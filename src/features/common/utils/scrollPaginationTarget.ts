import type { RefObject } from "react";

/** Scroll vers une cible ou le haut de la fenêtre (pagination tableaux). */
export function scrollPaginationTarget(targetRef?: RefObject<HTMLElement | null>) {
  if (targetRef?.current) {
    targetRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
