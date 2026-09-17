/**
 * Formatage dates / statuts intervention (UI tableau + exports Excel / Word).
 */

import type { InterventionEntry } from "../model/intervention.types";

export function formatInterventionDateTime(date: string, time: string): string {
  if (!date) return "—";
  const iso = `${date}T${time || "00:00"}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Libellé statut pour tableau et exports. */
export function statusLabelFr(status: InterventionEntry["status"]): string {
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours";
}

/** Variante badge CSS (`mc-status-badge--*`). */
export function statusTone(status: InterventionEntry["status"]): "cloture" | "en-attente" | "en-cours" {
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "en-attente";
  return "en-cours";
}
