/**
 * Helpers HH:MM partagés (moteur créneaux, demande, règles de passage, date logique).
 */

import { isValidTime } from "../../common/utils/timeInput";

/** Regex HH:MM 24h stricte (heures et minutes capturées). */
export const RONDE_TIME_HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Indique si la valeur est une heure HH:MM valide. */
export function isRondeTimeHm(value: string): boolean {
  return isValidTime(value);
}

/** HH:MM trimée si valide, sinon le fallback. */
export function normalizeRondeHmOr(value: string, fallback: string): string {
  const trimmed = String(value || "").trim();
  return isRondeTimeHm(trimmed) ? trimmed : fallback;
}

/** Convertit HH:MM en minutes depuis minuit (0 si invalide). */
export function hhmmToMinutes(time: string): number {
  const value = String(time || "").trim();
  const m = RONDE_TIME_HM_RE.exec(value);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Convertit des minutes (éventuellement hors 0–1439) en HH:MM. */
export function minutesToHm(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
