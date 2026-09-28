/**
 * Règles UI passage / terrain (alignées sur le backend `passageRules.js`).
 */

import type { RondeEntry } from "../model/ronde.types";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { isRondeTimeHm } from "./rondeTime";

const HEURE_DEMANDEE_RE = /Heure demandée:\s*([01]\d|2[0-3]):([0-5]\d)/i;

/**
 * Heure HH:mm écrite dans l'observation (« Heure demandée: hh:mm »).
 *
 * @param obs - Texte d'observation.
 * @returns Chaîne vide si absente.
 */
export function extractHeureDemandeeHmFromObs(obs: string | null | undefined): string {
  const match = HEURE_DEMANDEE_RE.exec(String(obs || ""));
  return match ? `${match[1]}:${match[2]}` : "";
}

/** Champs lus pour savoir si l'heure de passage est dépassée. */
type RondePassageTiming = {
  requestDate?: string;
  horairesDemandeObs?: string;
  requestPlanningSnapshot?: RondeEntry["requestPlanningSnapshot"];
};

export function extractRondeRequestedTimeHm(entry: RondePassageTiming): string {
  const fromObs = extractHeureDemandeeHmFromObs(entry.horairesDemandeObs);
  if (fromObs) return fromObs;
  const snap = entry.requestPlanningSnapshot;
  if (snap?.lines?.length) {
    for (const ln of snap.lines) {
      const t = String(ln.requestedTime || "").trim();
      if (isRondeTimeHm(t)) return t;
    }
  }
  const rt = String(snap?.requestTime || "").trim();
  if (isRondeTimeHm(rt)) return rt;
  return "00:00";
}

export function isRondePassagePast(entry: RondePassageTiming, nowMs = Date.now()): boolean {
  const date = String(entry.requestDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = Date.parse(`${date}T${extractRondeRequestedTimeHm(entry)}:00`);
  return Number.isFinite(ms) && ms < nowMs;
}

export function isRondeManagerRole(role: string | undefined | null): boolean {
  return role === "RESPONSABLE" || role === "DEV";
}

/**
 * Refus de clôture d'une ronde contractuelle : trop tôt, ou sans compte-rendu / horaires.
 *
 * @returns Message affichable, ou `null` si la clôture peut continuer.
 */
export function plannedContractualClosureRefusal(
  input: RondePassageTiming & {
    source?: string | null;
    report?: string;
    arrivalTime?: string;
    departureTime?: string;
  },
  nowMs = Date.now()
): string | null {
  if (String(input.source || "").trim().toUpperCase() !== "PLANIFIE") return null;
  if (!isRondePassagePast(input, nowMs)) {
    const when = formatDateShortFr(input.requestDate || "");
    return when
      ? `Cette ronde est prévue le ${when}. La clôture n'est possible qu'une fois l'heure de passage passée.`
      : "La clôture n'est possible qu'une fois l'heure de passage passée.";
  }
  if (!String(input.report || "").trim()) {
    return "Le compte rendu est obligatoire avant clôture.";
  }
  if (!String(input.arrivalTime || "").trim() || !String(input.departureTime || "").trim()) {
    return "Les heures d'arrivée et de départ sont obligatoires avant clôture.";
  }
  return null;
}
