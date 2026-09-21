/**
 * État formulaire de la modale gardiennage (validité, lignes, demande).
 *
 * Utilisé par `GardiennageEntryModal` et `GardiennagePlanningSection`.
 */

import {
  applyRequestDateTimeChange,
  applyValidFromDateTimeChange,
  type RequestValidityRange
} from "../../common/utils/alignRequestAndValidity";
import { getLocalDateIso, getLocalTimeHm, splitIsoToLocalDateTime } from "../../common/utils/localDateIso";
import { GARDIENNAGE_WEEKDAYS_ALL_MASK } from "./gardiennagePlanningCalendar";
import { resolvePlanningFormMode, type GardiennagePlanningFormMode } from "./gardiennagePlanningForm";
import type { GardiennagePlanningLineV1 } from "./gardiennage.types";

export type GardiennageEntryFormState = {
  siteId: string | null;
  siteDisplay: string;
  startTime: string;
  endTime: string;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  isPonctuel: boolean;
  intervenantId: string | null;
  intervenantName: string;
  notes: string;
  linkedInterventionId: string | null;
  linkedRondeId: string | null;
  validFromDate: string;
  validFromTime: string;
  validToDate: string;
  validToTime: string;
  isContinuous: boolean;
  planningLines: GardiennagePlanningLineV1[];
  requestDate: string;
  requestTime: string;
};

export const EMPTY_GARDIENNAGE_ENTRY_FORM: GardiennageEntryFormState = {
  siteId: null,
  siteDisplay: "",
  startTime: "",
  endTime: "",
  recurrenceStartDate: "",
  recurrenceEndDate: "",
  isPonctuel: false,
  intervenantId: null,
  intervenantName: "",
  notes: "",
  linkedInterventionId: null,
  linkedRondeId: null,
  validFromDate: "",
  validFromTime: "",
  validToDate: "",
  validToTime: "",
  isContinuous: false,
  planningLines: [],
  requestDate: "",
  requestTime: ""
};

/**
 * Crée une ligne de planification vide (récurrente sur toute la validité).
 *
 * @param label - Libellé affiché
 * @param anchorDate - Date optionnelle (vide = toute la période)
 * @returns Ligne avec masque tous jours, hors fériés
 */
export function createDefaultGardiennagePlanningLine(
  label = "Ligne 1",
  anchorDate?: string
): GardiennagePlanningLineV1 {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    anchorDate: anchorDate || "",
    startTime: "",
    endTime: "",
    weekdaysMask: GARDIENNAGE_WEEKDAYS_ALL_MASK,
    includeHolidays: false,
    includeHolidayEves: false
  };
}

/**
 * Durée lisible `XhYY` pour les champs lecture seule et le récap.
 *
 * @param totalMin - Minutes totales
 * @returns Durée `XhYY`, ou `0h00` si invalide
 */
export function formatGardiennageDurationMinutes(totalMin: number): string {
  if (!Number.isFinite(totalMin) || totalMin <= 0) return "0h00";
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

/**
 * Découpe un ISO en date/heure locales, avec repli « maintenant » si invalide.
 *
 * @param iso - Horodatage ISO
 * @returns Date et heure locales, ou l’instant courant
 */
export function dateTimeFromIsoOrNow(iso: string): { date: string; time: string } {
  const split = splitIsoToLocalDateTime(iso);
  if (!split.date) return { date: getLocalDateIso(), time: getLocalTimeHm() };
  return split;
}

function formToValidityRange(form: GardiennageEntryFormState): RequestValidityRange {
  return {
    requestDate: form.requestDate,
    requestTime: form.requestTime,
    validFromDate: form.validFromDate,
    validFromTime: form.validFromTime,
    validToDate: form.validToDate,
    validToTime: form.validToTime
  };
}

function applyValidityRange(
  form: GardiennageEntryFormState,
  range: RequestValidityRange
): GardiennageEntryFormState {
  return {
    ...form,
    requestDate: range.requestDate,
    requestTime: range.requestTime,
    validFromDate: range.validFromDate,
    validFromTime: range.validFromTime,
    validToDate: range.validToDate,
    validToTime: range.validToTime
  };
}

function gardiennageAlignOpts(form: GardiennageEntryFormState) {
  const mode = resolvePlanningFormMode(form.isPonctuel, form.isContinuous);
  return {
    validityHasTime: mode !== "recurring",
    compareEndTimes: false
  };
}

/**
 * Aligne demande + validité après un changement de date/heure de demande.
 *
 * @param form - État courant
 * @param date - Date de demande
 * @param time - Heure de demande
 * @returns Formulaire avec plage de validité réalignée
 */
export function withRequestDateTime(
  form: GardiennageEntryFormState,
  date: string,
  time: string
): GardiennageEntryFormState {
  return applyValidityRange(
    form,
    applyRequestDateTimeChange(formToValidityRange(form), { date, time }, gardiennageAlignOpts(form))
  );
}

/**
 * Aligne demande + validité après un changement du début de validité.
 *
 * @param form - État courant
 * @param date - Date de début de validité
 * @param time - Heure de début (si le mode en a une)
 * @returns Formulaire avec plage de validité réalignée
 */
export function withValidFromDateTime(
  form: GardiennageEntryFormState,
  date: string,
  time: string
): GardiennageEntryFormState {
  return applyValidityRange(
    form,
    applyValidFromDateTimeChange(formToValidityRange(form), { date, time }, gardiennageAlignOpts(form))
  );
}

/**
 * Passe le formulaire d’un mode de planification à un autre (journée / H24 / récurrent).
 *
 * @param form - État courant
 * @param mode - Mode cible
 * @returns Formulaire adapté (lignes vidées ou recréées selon le mode)
 */
export function applyGardiennagePlanningMode(
  form: GardiennageEntryFormState,
  mode: GardiennagePlanningFormMode
): GardiennageEntryFormState {
  if (mode === "ponctuel") {
    const firstLine = form.planningLines[0];
    return {
      ...form,
      isPonctuel: true,
      isContinuous: false,
      recurrenceEndDate: "",
      validFromTime: firstLine?.startTime || form.validFromTime || "",
      validToTime: firstLine?.endTime || form.validToTime || "",
      planningLines: []
    };
  }
  if (mode === "h24") {
    return {
      ...form,
      isPonctuel: false,
      isContinuous: true,
      planningLines: [],
      validToDate: "",
      validToTime: ""
    };
  }
  return {
    ...form,
    isPonctuel: false,
    isContinuous: false,
    planningLines: form.planningLines.length
      ? form.planningLines
      : [createDefaultGardiennagePlanningLine()]
  };
}
