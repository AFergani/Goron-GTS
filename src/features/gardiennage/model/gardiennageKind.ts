/**
 * Classification visuelle d'un gardiennage (badge liste / journée).
 *
 * Distingue H24, ponctuel et récurrent, puis jour vs nuit (passage minuit).
 * Utilisé par : `GardiennageTable`.
 */

import type { GardiennageEntry } from "./gardiennage.types";

/** Identifiant CSS du badge de type. */
export type GardiennageKindId =
  | "h24"
  | "recurring-night"
  | "recurring-day"
  | "ponctuel-night"
  | "ponctuel-day";

/** Libellés d'un badge de type gardiennage. */
export type GardiennageKindBadge = {
  id: GardiennageKindId;
  label: string;
  title: string;
};

const KIND_H24: GardiennageKindBadge = {
  id: "h24",
  label: "H24",
  title: "Présence continue H24"
};

const KIND_RECURRING_NIGHT: GardiennageKindBadge = {
  id: "recurring-night",
  label: "Récurrente nuit",
  title: "Planification récurrente de nuit"
};

const KIND_RECURRING_DAY: GardiennageKindBadge = {
  id: "recurring-day",
  label: "Récurrente jour",
  title: "Planification récurrente de jour"
};

const KIND_PONCTUEL_NIGHT: GardiennageKindBadge = {
  id: "ponctuel-night",
  label: "Ponctuel nuit",
  title: "Journée unique de nuit"
};

const KIND_PONCTUEL_DAY: GardiennageKindBadge = {
  id: "ponctuel-day",
  label: "Ponctuel jour",
  title: "Journée unique de jour"
};

/**
 * Détermine le type de prestation affiché en badge.
 *
 * @param entry - Ligne gardiennage
 * @returns Badge (identifiant, libellé, infobulle)
 */
export function classifyGardiennageKind(entry: GardiennageEntry): GardiennageKindBadge {
  const isNight = Boolean(entry.crossesMidnight);
  if (entry.planningSnapshot?.isContinuous) return KIND_H24;
  if (entry.isPonctuel) return isNight ? KIND_PONCTUEL_NIGHT : KIND_PONCTUEL_DAY;
  return isNight ? KIND_RECURRING_NIGHT : KIND_RECURRING_DAY;
}
