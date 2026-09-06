import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef, RondePlannedRoundKind } from "../model/rondePlanned.types";
import { profileLineMatchesEmittedRoundKind } from "./profileLineMatchesSlot";

type PlannedHeureDemandeeInput = {
  plannedProfileId: string | null | undefined;
  plannedRoundKind: RondePlannedRoundKind | string | null | undefined;
  plannedSlotKey?: string | null;
  profiles: RondePlannedProfileRef[] | null | undefined;
  /** Pour aléatoire : repli sur l’heure d’arrivée déjà connue. */
  fallbackArrivalTime?: string | null;
};

/**
 * Heure demandée issue d’une ligne de profil (création ou édition).
 */
export function resolvePlannedLineRequestedTime(input: PlannedHeureDemandeeInput): string | null {
  const plannedProfileId = String(input.plannedProfileId || "").trim();
  const plannedRoundKind = input.plannedRoundKind;
  const profiles = input.profiles;
  if (!plannedProfileId || !plannedRoundKind || !profiles?.length) return null;

  const profile = profiles.find((p) => p.id === plannedProfileId);
  const plannedSlotKey = String(input.plannedSlotKey || "").trim();
  const lineBySlot =
    plannedSlotKey && profile?.lines?.length
      ? profile.lines.find((l) => plannedSlotKey.startsWith(`${l.id}:`))
      : undefined;
  const line =
    lineBySlot || profile?.lines?.find((l) => profileLineMatchesEmittedRoundKind(l, plannedRoundKind));
  const rt = line?.requestedTime?.trim();
  if (rt) return rt;
  if (line?.roundKind === "RANDOM" && String(input.fallbackArrivalTime || "").trim()) {
    return String(input.fallbackArrivalTime).trim();
  }
  return null;
}

/**
 * Heure demandée issue du profil / ligne (rondes planifiées déjà enregistrées).
 * Sans profils en contexte, retourne null (l’export peut retomber sur « — »).
 */
export function resolvePlannedHeureDemandeeFromProfiles(
  entry: RondeEntry,
  profiles?: RondePlannedProfileRef[] | null
): string | null {
  if (entry.source !== "PLANIFIE") return null;
  return resolvePlannedLineRequestedTime({
    plannedProfileId: entry.plannedProfileId,
    plannedRoundKind: entry.plannedRoundKind,
    plannedSlotKey: entry.plannedSlotKey,
    profiles,
    fallbackArrivalTime: entry.arrivalTime
  });
}
