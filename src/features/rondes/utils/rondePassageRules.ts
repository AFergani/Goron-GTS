/**
 * Règles UI passage / terrain (alignées sur le backend `passageRules.js`).
 */

import type { RondeEntry } from "../model/ronde.types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function extractRondeRequestedTimeHm(entry: RondeEntry): string {
  const obs = String(entry.horairesDemandeObs || "");
  const fromObs = /Heure demandée:\s*([01]\d|2[0-3]):([0-5]\d)/i.exec(obs);
  if (fromObs) return `${fromObs[1]}:${fromObs[2]}`;
  const snap = entry.requestPlanningSnapshot;
  if (snap?.lines?.length) {
    for (const ln of snap.lines) {
      const t = String(ln.requestedTime || "").trim();
      if (TIME_RE.test(t)) return t;
    }
  }
  const rt = String(snap?.requestTime || "").trim();
  if (TIME_RE.test(rt)) return rt;
  return "00:00";
}

export function isRondePassagePast(entry: RondeEntry, nowMs = Date.now()): boolean {
  const date = String(entry.requestDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = Date.parse(`${date}T${extractRondeRequestedTimeHm(entry)}:00`);
  return Number.isFinite(ms) && ms < nowMs;
}

export function isRondeManagerRole(role: string | undefined | null): boolean {
  return role === "RESPONSABLE" || role === "DEV";
}
