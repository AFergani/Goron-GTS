/**
 * Libellés français récapitulatifs des lignes et profils planifiés (UI gestion profils).
 */

import type { RondePlannedProfileRef, RondePlannedRoundKind, RondePlannedRecurrenceKind } from "./rondePlanned.types";
import { RANDOM_PERIOD_DAY } from "./rondePlanned.types";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";

const WEEKDAY_BITS = [
  { bit: 1, label: "Lun" },
  { bit: 2, label: "Mar" },
  { bit: 4, label: "Mer" },
  { bit: 8, label: "Jeu" },
  { bit: 16, label: "Ven" },
  { bit: 32, label: "Sam" },
  { bit: 64, label: "Dim" }
] as const;

export function formatRondePlannedRoundKind(kind: RondePlannedRoundKind, randomPeriodMask?: number | null): string {
  if (kind === "RANDOM") {
    const m =
      randomPeriodMask == null || !Number.isFinite(Number(randomPeriodMask))
        ? 3
        : Math.min(3, Math.max(1, Math.round(Number(randomPeriodMask))));
    if (m === RANDOM_PERIOD_DAY) return "Aléatoire (jour)";
    if (m === 2) return "Aléatoire (nuit)";
    return "Aléatoire (jour · nuit)";
  }
  switch (kind) {
    case "OPENING":    return "Ouverture";
    case "CLOSING":    return "Fermeture";
    case "ACCOMPAGNEMENT": return "Accompagnement";
    case "RANDOM_DAY": return "Aléatoire (jour)";
    case "RANDOM_NIGHT": return "Aléatoire (nuit)";
    default: return kind;
  }
}

export function formatRondePlannedIntervalMinutes(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 1) return "—";
  if (minutes % 60 === 0 && minutes >= 60) return `Toutes les ${minutes / 60} h`;
  return `Toutes les ${minutes} min`;
}

export function formatRondePlannedLineSummary(line: {
  roundKind: RondePlannedRoundKind;
  recurrenceKind: RondePlannedRecurrenceKind;
  weekdaysMask: number;
  monthDay: number | null;
  requestedTime: string | null;
  intervalMinutes: number | null;
  randomPeriodMask?: number | null;
  randomWindowStart?: string | null;
  randomWindowEnd?: string | null;
  randomRoundsCount?: number | null;
  rangeStartDate?: string | null;
  rangeEndDate?: string | null;
}): string {
  const kind =
    line.roundKind === "RANDOM"
      ? formatRondePlannedRoundKind("RANDOM", line.randomPeriodMask)
      : formatRondePlannedRoundKind(line.roundKind);
  let rec = "";
  if (line.recurrenceKind === "DATE_RANGE") {
    const fromFr = formatDateShortFr(line.rangeStartDate?.trim() || "") || "—";
    const toFr = formatDateShortFr(line.rangeEndDate?.trim() || "") || "—";
    rec = `du ${fromFr} au ${toFr}`;
  } else if (line.recurrenceKind === "DAILY") {
    rec = "chaque jour";
  } else if (line.recurrenceKind === "MONTHLY") {
    rec = `mensuel j.${line.monthDay ?? "—"}`;
  } else {
    const parts: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      if (line.weekdaysMask & (1 << i)) parts.push(WEEKDAY_BITS[i].label);
    }
    rec = parts.length ? `hebdo ${parts.join(", ")}` : "hebdo —";
  }
  const time =
    line.roundKind === "OPENING" || line.roundKind === "CLOSING" || line.roundKind === "ACCOMPAGNEMENT"
      ? ` · ${line.requestedTime?.trim() || "—"}`
      : "";
  const freq =
    line.intervalMinutes != null && line.intervalMinutes >= 1
      ? ` · ${formatRondePlannedIntervalMinutes(line.intervalMinutes)}`
      : "";
  const rwS = line.randomWindowStart?.trim();
  const rwE = line.randomWindowEnd?.trim();
  const win = line.roundKind === "RANDOM" && rwS && rwE ? ` · fenêtre ${rwS}–${rwE}` : "";
  const rc =
    line.roundKind === "RANDOM" && line.randomRoundsCount != null && line.randomRoundsCount >= 1
      ? ` · ${line.randomRoundsCount} ronde(s)`
      : "";
  return `${kind} (${rec})${time}${freq}${win}${rc}`;
}

export function summarizeRondePlannedProfile(profile: RondePlannedProfileRef): string {
  if (!profile.lines.length) return "—";
  const previews = profile.lines.slice(0, 2).map((l) => formatRondePlannedLineSummary(l));
  const more = profile.lines.length > 2 ? ` · +${profile.lines.length - 2}` : "";
  return `${previews.join(" · ")}${more}`;
}
