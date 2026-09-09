/**
 * Parse date ISO + HH:MM en timestamp local (null si invalide).
 */

export function parseDateTimeSafeMs(dateIso: string, hhmm: string): number | null {
  const d = new Date(`${String(dateIso || "").trim()}T${String(hhmm || "").trim()}:00`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}
