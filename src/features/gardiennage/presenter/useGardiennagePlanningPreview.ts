/**
 * Prévisualisation des créneaux gardiennage à partir du formulaire de saisie.
 *
 * Utilisé par `GardiennageEntryModal` (snapshot, créneaux, durées, chevauchement).
 */

import { useMemo } from "react";
import { getLocalDateIso } from "../../common/utils/localDateIso";
import type { HolidayRef } from "../../../types";
import type { GardiennageEntry, GardiennagePlanningSnapshotV1 } from "../model/gardiennage.types";
import { isGardiennagePreviewSlotClosed } from "../model/gardiennageClosure";
import { computeGardiennageLinesOverlapError } from "../model/gardiennagePlanningOverlap";
import { buildEffectivePlanningSnapshot, type GardiennagePlanningFormMode } from "../model/gardiennagePlanningForm";
import { buildGardiennageSlotsFromSnapshot } from "../model/gardiennagePlannerEngine";
import type { GardiennageEntryFormState } from "../model/gardiennageEntryForm";

type PreviewParams = {
  form: GardiennageEntryFormState;
  planningMode: GardiennagePlanningFormMode;
  holidays: HolidayRef[];
  batchEntries: GardiennageEntry[];
};

/**
 * Calcule le snapshot effectif, les créneaux générés et le diagnostic de chevauchement.
 *
 * @param params.form - État de saisie
 * @param params.planningMode - Mode UI courant
 * @param params.holidays - Référentiel jours fériés
 * @param params.batchEntries - Fiches du lot (pour compter les créneaux déjà clôturés)
 * @returns Snapshot, créneaux générés, compteurs et diagnostic de chevauchement
 */
export function useGardiennagePlanningPreview({
  form,
  planningMode,
  holidays,
  batchEntries
}: PreviewParams) {
  const planningSnapshot: GardiennagePlanningSnapshotV1 = useMemo(
    () => ({
      ...buildEffectivePlanningSnapshot({
        validFromDate: form.validFromDate || form.recurrenceStartDate,
        validFromTime: form.validFromTime,
        validToDate: planningMode === "h24"
          ? form.validToDate
          : (form.validToDate || form.recurrenceEndDate),
        validToTime: form.validToTime,
        isPonctuel: form.isPonctuel,
        isContinuous: form.isContinuous,
        planningLines: form.planningLines,
        fallbackDate: getLocalDateIso()
      }),
      requestDate: form.requestDate,
      requestTime: form.requestTime
    }),
    [form, planningMode]
  );
  const holidayDateIsos = useMemo(
    () => holidays.map((holiday) => String(holiday.dateIso || "").trim()).filter(Boolean),
    [holidays]
  );
  const previewSlots = useMemo(
    () => buildGardiennageSlotsFromSnapshot(planningSnapshot, { holidayDateIsos }),
    [planningSnapshot, holidayDateIsos]
  );
  const previewTotalMinutes = useMemo(
    () => previewSlots.reduce((acc, slot) => {
      const start = new Date(slot.startIso).getTime();
      const end = new Date(slot.endIso).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return acc;
      return acc + Math.round((end - start) / 60000);
    }, 0),
    [previewSlots]
  );
  const previewPerLineCounts = useMemo(
    () => form.planningLines.map((line) => previewSlots.filter((slot) => slot.lineId === line.id).length),
    [form.planningLines, previewSlots]
  );
  const previewClosedSlotsCount = useMemo(
    () => previewSlots.filter((slot) => isGardiennagePreviewSlotClosed(slot, batchEntries)).length,
    [previewSlots, batchEntries]
  );
  const linesOverlapError = useMemo(
    () => computeGardiennageLinesOverlapError({
      planningMode,
      validFromDate: form.validFromDate,
      validToDate: form.validToDate,
      planningLines: form.planningLines,
      holidayDateIsos
    }),
    [planningMode, form.validFromDate, form.validToDate, form.planningLines, holidayDateIsos]
  );

  return {
    planningSnapshot,
    previewSlots,
    previewTotalMinutes,
    previewPerLineCounts,
    previewClosedSlotsCount,
    linesOverlapError
  };
}
