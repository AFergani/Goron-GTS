import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { profileLineMatchesEmittedRoundKind } from "./profileLineMatchesSlot";

/**
 * Heure demandée issue du profil / ligne (rondes planifiées).
 * Sans profils en contexte, retourne null (l’export peut retomber sur « — »).
 */
export function resolvePlannedHeureDemandeeFromProfiles(
  entry: RondeEntry,
  profiles?: RondePlannedProfileRef[] | null
): string | null {
  if (entry.source !== "PLANIFIE" || !entry.plannedProfileId || !entry.plannedRoundKind || !profiles?.length) {
    return null;
  }
  const profile = profiles.find((p) => p.id === entry.plannedProfileId);
  const lineBySlot =
    entry.plannedSlotKey && profile?.lines?.length
      ? profile.lines.find((l) => entry.plannedSlotKey!.startsWith(`${l.id}:`))
      : undefined;
  const line =
    lineBySlot || profile?.lines?.find((l) => profileLineMatchesEmittedRoundKind(l, entry.plannedRoundKind));
  const rt = line?.requestedTime?.trim();
  if (rt) return rt;
  if (line?.roundKind === "RANDOM" && entry.arrivalTime?.trim()) return entry.arrivalTime.trim();
  return null;
}
