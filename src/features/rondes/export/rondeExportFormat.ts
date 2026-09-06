/**
 * Formatage statut / origine / badges (tableau + exports Excel / Word).
 * Aligné sur le pattern `intervention/export/interventionExportFormat.ts`.
 */

import type { RondeEntry } from "../model/ronde.types";

/** Libellé statut pour tableau et exports. */
export function rondeStatusLabelFr(entry: RondeEntry, options?: { feminine?: boolean }): string {
  if (entry.status === "CLOTURE") return options?.feminine ? "Clôturée" : "Clôturé";
  if (entry.status === "ANNULE") {
    if (entry.cancellationKind === "NON_EFFECTUEE") return "Non effectuée";
    return options?.feminine ? "Annulée" : "Annulé";
  }
  return "En cours";
}

/** Variante badge CSS (`mc-status-badge--*`). */
export function rondeStatusTone(status: RondeEntry["status"]): "cloture" | "en-attente" | "en-cours" {
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "en-attente";
  return "en-cours";
}

/** Origine courte (exports Excel). */
export function rondeOriginLabelFr(entry: RondeEntry): string {
  if (entry.source === "PLANIFIE") return "Planifiée";
  if (entry.originKind === "TELESURVEILLANCE") return "Télésurveillance";
  if (entry.originKind === "CLIENT") return "Client";
  return "Autre";
}

/** Origine courte selon `originKind` (badge tableau, sans cas « Planifiée »). */
export function rondeOriginKindShortFr(originKind: RondeEntry["originKind"]): string {
  if (originKind === "TELESURVEILLANCE") return "Télésurveillance";
  if (originKind === "CLIENT") return "Client";
  return "Autre";
}

/** Origine détaillée (tableau / Word). */
export function rondeOriginSummaryFr(entry: RondeEntry): string {
  if (entry.originKind === "TELESURVEILLANCE") return "Télésurveillance";
  if (entry.originKind === "CLIENT") {
    return entry.originDetail.trim() ? `Client — ${entry.originDetail.trim()}` : "Client";
  }
  return entry.originDetail.trim() ? `Autre — ${entry.originDetail.trim()}` : "Autre";
}
