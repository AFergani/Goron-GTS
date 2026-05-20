import type { RondePlannedProfileLineRef, RondePlannedRoundKind } from "../model/rondePlanned.types";

/**
 * Indique si une ligne de profil produit le créneau émis (ex. RANDOM jour/nuit depuis une ligne RANDOM + masque).
 */
export function profileLineMatchesEmittedRoundKind(
  line: Pick<RondePlannedProfileLineRef, "roundKind" | "randomPeriodMask">,
  emittedRoundKind: RondePlannedRoundKind | string | null | undefined
): boolean {
  const emitted = String(emittedRoundKind || "").trim().toUpperCase();
  if (!emitted) return false;
  const lk = String(line.roundKind || "").trim().toUpperCase();
  if (lk === emitted) return true;
  if (lk === "RANDOM") {
    const raw = line.randomPeriodMask;
    const mask =
      raw == null || !Number.isFinite(Number(raw)) ? 3 : Math.min(3, Math.max(1, Math.round(Number(raw))));
    if (emitted === "RANDOM_DAY" && (mask & 1) !== 0) return true;
    if (emitted === "RANDOM_NIGHT" && (mask & 2) !== 0) return true;
  }
  return false;
}
