/**
 * Formatage statut / origine / badges (tableau + export Excel).
 * Aligné sur le pattern `intervention/export/interventionExportFormat.ts`.
 */

import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { RondeEntry } from "../model/ronde.types";
import { isSuiteInterventionRonde, suiteInterventionClientName } from "../model/requestOrigin";
import { isRondeTimeHm } from "../utils/rondeTime";
import { extractHeureDemandeeHmFromObs } from "../utils/rondePassageRules";
import { rondePassageKindLabel } from "../utils/rondePassageKindLabel";
import { resolvePlannedHeureDemandeeFromProfiles } from "../utils/plannedHeureDemandee";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";

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

/** Badge + détail pour la colonne Origine (tableau exceptionnel). */
export function rondeTableOriginParts(entry: RondeEntry): { badge: string; detail: string } {
  if (isSuiteInterventionRonde(entry)) {
    const clientName = suiteInterventionClientName(entry);
    return { badge: "Suite intervention", detail: clientName || "Télésurveillance" };
  }
  if (entry.originKind === "CLIENT") {
    const name = String(entry.originDetail || "").trim();
    return { badge: "Client", detail: name || "Sans précision" };
  }
  const extra = String(entry.originDetail || "").trim();
  return { badge: "Autre", detail: extra || "Sans précision" };
}

/** Origine courte (exports Excel). */
export function rondeOriginLabelFr(entry: RondeEntry): string {
  if (entry.source === "PLANIFIE") return "Planifiée";
  if (entry.originKind === "TELESURVEILLANCE" && !isSuiteInterventionRonde(entry)) return "Planifiée";
  const { badge, detail } = rondeTableOriginParts(entry);
  return `${badge} — ${detail}`;
}

/** Origine détaillée (tri tableau). */
export function rondeOriginSummaryFr(entry: RondeEntry): string {
  const { badge, detail } = rondeTableOriginParts(entry);
  return `${badge} — ${detail}`;
}

function isDedicatedRondePassage(entry: RondeEntry): boolean {
  const kind = String(entry.plannedRoundKind || "").trim().toUpperCase();
  if (kind === "RANDOM") return false;
  if (kind === "OPENING" || kind === "CLOSING" || kind === "ACCOMPAGNEMENT") return true;
  const label = rondePassageKindLabel(entry).toLowerCase();
  if (/aléatoire|aleatoire/.test(label)) return false;
  return /ouverture|fermeture|accompagnement/.test(label);
}

function dedicatedRequestedTimeHm(
  entry: RondeEntry,
  profiles?: RondePlannedProfileRef[] | null
): string {
  if (!isDedicatedRondePassage(entry)) return "";
  const fromObs = extractHeureDemandeeHmFromObs(entry.horairesDemandeObs);
  if (fromObs) return fromObs;
  const snapLines = entry.requestPlanningSnapshot?.lines ?? [];
  for (const line of snapLines) {
    const rk = String(line.roundKind || "").trim().toUpperCase();
    if (rk !== "OPENING" && rk !== "CLOSING" && rk !== "ACCOMPAGNEMENT") continue;
    const time = String(line.requestedTime || "").trim();
    if (isRondeTimeHm(time)) return time;
  }
  const planned = resolvePlannedHeureDemandeeFromProfiles(entry, profiles);
  return planned && isRondeTimeHm(planned) ? planned : "";
}

/**
 * Date de clôture pour l’export Word `{date_cloture}` : JJ/MM/AAAA,
 * plus l’heure seulement si une heure a été transmise (ouverture, fermeture, accompagnement).
 */
export function formatRondeClosureDateFr(
  entry: RondeEntry,
  profiles?: RondePlannedProfileRef[] | null
): string {
  const closedAt = String(entry.closedAt || "").trim();
  if (!closedAt) return "";
  const dateFr = formatDateShortFr(closedAt);
  if (!dateFr) return "";
  const time = dedicatedRequestedTimeHm(entry, profiles);
  return time ? `${dateFr} ${time}` : dateFr;
}
