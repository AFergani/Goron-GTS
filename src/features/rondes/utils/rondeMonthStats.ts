/**
 * Compteurs de synthèse mensuelle des fiches ronde (mois civil local).
 *
 * Utilisé par : presenter rondes (cartes « Synthèse du mois »).
 */

import { getLocalMonthKey, isIsoDateInLocalMonth } from "../../common/utils/currentMonthSummary";
import type { RondeEntry } from "../model/ronde.types";
import { isContractualRondeEntry } from "./rondeEntryClassification";

export type RondeMonthStatusCounts = {
  total: number;
  inProgress: number;
  closed: number;
  canceled: number;
  notPerformed: number;
};

function countByStatus(rows: RondeEntry[]): RondeMonthStatusCounts {
  return {
    total: rows.length,
    inProgress: rows.filter((entry) => entry.status === "EN_COURS").length,
    closed: rows.filter((entry) => entry.status === "CLOTURE").length,
    canceled: rows.filter((entry) => entry.status === "ANNULE").length,
    notPerformed: rows.filter(
      (entry) => entry.status === "ANNULE" && entry.cancellationKind === "NON_EFFECTUEE"
    ).length
  };
}

/**
 * Ventile les fiches du mois en cours entre onglets contractuel et exceptionnel.
 *
 * @param entries - Liste complète des rondes
 */
export function computeRondeMonthSummaryStats(entries: RondeEntry[]): {
  exceptional: RondeMonthStatusCounts;
  contractual: RondeMonthStatusCounts;
} {
  const monthKey = getLocalMonthKey();
  const monthEntries = entries.filter((entry) => isIsoDateInLocalMonth(entry.requestDate, monthKey));
  return {
    exceptional: countByStatus(monthEntries.filter((entry) => !isContractualRondeEntry(entry))),
    contractual: countByStatus(monthEntries.filter(isContractualRondeEntry))
  };
}
