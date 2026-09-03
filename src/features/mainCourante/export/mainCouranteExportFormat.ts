/**
 * Formatage dates/statuts pour la main courante (UI + exports).
 */

import type { MainCouranteStatus } from "../model/mainCourante.types";

export function formatMainCouranteDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Affichage UI : tiret cadratin si date absente. */
export function formatMainCouranteDateOrDash(iso: string | undefined): string {
  return formatMainCouranteDate(iso) || "—";
}

export function statusLabelFr(status: MainCouranteStatus): string {
  if (status === "EN_ATTENTE") return "En attente";
  if (status === "EN_COURS") return "En cours";
  return "Clôturé";
}
