/**
 * Classification visuelle d'un gardiennage (badge liste / journée).
 *
 * Distingue présence continue (H24), série jour/nuit, et unique (aujourd'hui / cette nuit).
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
  label: "Présence continue",
  title: "Présence continue H24 (sans interruption)"
};

const KIND_RECURRING_NIGHT: GardiennageKindBadge = {
  id: "recurring-night",
  label: "Présence nuit",
  title: "Présence de nuit sur une période (créneau récurrent)"
};

const KIND_RECURRING_DAY: GardiennageKindBadge = {
  id: "recurring-day",
  label: "Présence jour",
  title: "Présence de jour sur une période (créneau récurrent)"
};

const KIND_PONCTUEL_NIGHT: GardiennageKindBadge = {
  id: "ponctuel-night",
  label: "Cette nuit",
  title: "Présence unique de nuit (une seule occurrence)"
};

const KIND_PONCTUEL_DAY: GardiennageKindBadge = {
  id: "ponctuel-day",
  label: "Aujourd'hui",
  title: "Présence unique de jour (une seule occurrence)"
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
