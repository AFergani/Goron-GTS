/**
 * Libellés / tons statut gardiennage (tableau + exports).
 *
 * Aligné sur le pattern interventions (`statusLabelFr` / `statusTone`).
 */

import type { GardiennageEntry } from "../model/gardiennage.types";

/** Libellé français du statut pour UI et Excel. */
export function statusLabelFr(status: GardiennageEntry["status"]): string {
  if (status === "ACTIF") return "Actif";
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours"; /* PLANIFIE */
}

/** Tone CSS badge (`mc-status-badge--*`), aligné interventions pour ANNULE. */
export function statusTone(
  status: GardiennageEntry["status"]
): "info" | "en-cours" | "cloture" | "en-attente" {
  if (status === "ACTIF") return "en-cours";
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "en-attente";
  return "info"; /* PLANIFIE */
}
