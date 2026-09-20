/**
 * Formatage dates/statuts pour la main courante (UI + exports).
 */

import { formatDateTimeFr } from "../../common/utils/formatDateShortFr";
import type { MainCouranteStatus } from "../model/mainCourante.types";

export function formatMainCouranteDate(iso: string | undefined): string {
  return formatDateTimeFr(iso);
}

export function statusLabelFr(status: MainCouranteStatus): string {
  if (status === "EN_ATTENTE") return "En attente";
  if (status === "EN_COURS") return "En cours";
  return "Clôturé";
}
