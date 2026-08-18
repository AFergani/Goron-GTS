/**
 * Classification contractuelle / exceptionnelle des rondes (badges, filtres, onglets).
 */

import type { RondeEntry } from "../model/ronde.types";

/**
 * Indique si une ronde relève du volet contractuel / planifié.
 *
 * @param entry - Fiche ronde
 * @returns true si contractuelle (planifiée, profil, télésurveillance…)
 */
export function isContractualRondeEntry(entry: RondeEntry): boolean {
  return (
    entry.source === "PLANIFIE" ||
    Boolean(entry.plannedProfileId) ||
    Boolean(entry.plannedRoundKind) ||
    entry.requestPlanningSnapshot?.origin === "CONTRAT" ||
    entry.originKind === "TELESURVEILLANCE"
  );
}

/**
 * Compte les rondes en cours pour une date donnée, ventilées contractuel / exceptionnel.
 *
 * @param entries - Liste complète des rondes chargées
 * @param todayIso - Date du jour (`YYYY-MM-DD`)
 * @returns Totaux sidebar et onglets
 */
export function countTodayInProgressRondes(entries: RondeEntry[], todayIso: string): {
  total: number;
  contractual: number;
  exceptional: number;
} {
  const inProgressToday = entries.filter((entry) => entry.status === "EN_COURS" && entry.requestDate === todayIso);
  const contractual = inProgressToday.filter(isContractualRondeEntry).length;
  return {
    total: inProgressToday.length,
    contractual,
    exceptional: inProgressToday.length - contractual
  };
}
