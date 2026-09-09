/**
 * Récapitulatif planification gardiennage (miroir du récap demande ronde).
 *
 * Affiche un résumé par ligne + compteurs de créneaux, la validité, et le total.
 * Journée unique : date de fin = lendemain si passage minuit (fin ≤ début).
 */

import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { GardiennagePlanningLineV1 } from "../model/gardiennage.types";
import {
  isValidPlanningTime,
  resolvePonctuelValidToDate,
  type GardiennagePlanningFormMode
} from "../model/gardiennagePlanningForm";
import { formatGardiennagePlanningLineSummary } from "../model/gardiennagePlanningLineSummary";
import { gardiennagePlanningLineDisplayNumber } from "../utils/gardiennagePlanningLineOrder";

type GardiennagePlanningLinesRecapProps = {
  mode: GardiennagePlanningFormMode;
  isEdit: boolean;
  lines: GardiennagePlanningLineV1[];
  lockWeekdaysFromValidityRange: boolean;
  validFromDate: string;
  validFromTime: string;
  validToDate: string;
  validToTime: string;
  /** Compteurs de créneaux générés, index aligné sur `lines` (mode récurrent). */
  perLineCounts: number[];
  totalSlots: number;
  totalMinutesLabel: string;
  closedSlotsCount?: number;
  openEnded?: boolean;
  openEndedHorizonDays?: number;
};

function formatHm(value: string): string {
  const trimmed = String(value || "").trim();
  return isValidPlanningTime(trimmed) ? trimmed : "";
}

export function GardiennagePlanningLinesRecap({
  mode,
  isEdit,
  lines,
  lockWeekdaysFromValidityRange,
  validFromDate,
  validFromTime,
  validToDate,
  validToTime,
  perLineCounts,
  totalSlots,
  totalMinutesLabel,
  closedSlotsCount = 0,
  openEnded = false,
  openEndedHorizonDays
}: GardiennagePlanningLinesRecapProps) {
  const fromDate = validFromDate.trim();
  const fromHm = formatHm(validFromTime);
  const toHm = formatHm(validToTime);
  const ponctuelEndDate =
    mode === "ponctuel" && fromDate
      ? resolvePonctuelValidToDate(fromDate, validFromTime, validToTime)
      : validToDate.trim();
  const ponctuelCrossesMidnight =
    mode === "ponctuel" && Boolean(fromDate) && ponctuelEndDate !== fromDate;
  const effectiveToDate = mode === "ponctuel" ? ponctuelEndDate : validToDate.trim();
  const fromFr = formatDateShortFr(fromDate) || "—";
  const toFr = formatDateShortFr(effectiveToDate) || "—";

  return (
    <section className="panel gardiennage-planning-recap" style={{ marginTop: 8, padding: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        {isEdit ? "Récapitulatif de la planification" : "Récapitulatif"}
      </div>

      {mode === "ponctuel" ? (
        <div className="muted gardiennage-planning-recap__line">
          Journée unique : {fromFr}
          {fromHm ? ` ${fromHm}` : ""}
          {" → "}
          {ponctuelCrossesMidnight ? `${toFr} ` : ""}
          {toHm || "—"}
          {" → "}
          {totalSlots} créneau{totalSlots > 1 ? "x" : ""}
        </div>
      ) : null}

      {mode === "h24" ? (
        <div className="muted gardiennage-planning-recap__line">
          Couverture continue → {totalSlots} créneau{totalSlots > 1 ? "x" : ""}
        </div>
      ) : null}

      {mode === "recurring" ? (
        lines.length === 0 ? (
          <div className="muted">Aucune ligne de planification.</div>
        ) : (
          lines.map((line, index) => {
            const count = perLineCounts[index] ?? 0;
            return (
              <div key={`recap-line-${line.id || index}`} className="muted gardiennage-planning-recap__line">
                Ligne {gardiennagePlanningLineDisplayNumber(index, lines.length)}:{" "}
                {formatGardiennagePlanningLineSummary(line, {
                  omitWeekdayRecurrence: lockWeekdaysFromValidityRange
                })}
                {" → "}
                {count} créneau{count > 1 ? "x" : ""}
              </div>
            );
          })
        )
      ) : null}

      {fromDate ? (
        <div style={{ marginTop: 6 }} className="muted">
          Validité : du {fromFr}
          {mode === "ponctuel" || mode === "h24" ? (fromHm ? ` ${fromHm}` : "") : ""}
          {" au "}
          {mode === "ponctuel"
            ? toFr
            : openEnded
              ? "nouvel ordre"
              : toFr}
          {mode === "ponctuel" || mode === "h24" ? (toHm ? ` ${toHm}` : "") : ""}
          {mode === "ponctuel" ? " · Journée unique" : ""}
          {ponctuelCrossesMidnight ? " · Passage minuit" : ""}
          {mode === "h24" && openEnded && openEndedHorizonDays
            ? ` · Horizon glissant ≥ ${openEndedHorizonDays} j`
            : ""}
        </div>
      ) : null}

      <div style={{ marginTop: 6, fontWeight: 600 }}>
        Total : {totalSlots} créneau{totalSlots > 1 ? "x" : ""}
        {totalMinutesLabel ? ` · ${totalMinutesLabel}` : ""}
        {isEdit && closedSlotsCount > 0
          ? ` · dont ${closedSlotsCount} clôturé${closedSlotsCount > 1 ? "s" : ""}`
          : ""}
      </div>
    </section>
  );
}
