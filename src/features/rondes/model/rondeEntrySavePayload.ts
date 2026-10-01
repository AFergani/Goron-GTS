/**
 * Construction du payload d’enregistrement d’une fiche ronde (validation + champs clôture).
 *
 * Utilisé par `useRondeEntryModalActions` : la modale ne duplique pas ces règles.
 */

import type { IntervenantRef, SiteRef } from "../../../types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import { isValidTime, normalizeTimeForSave } from "../../common/utils/timeInput";
import { computeDurationMinutes, isIsoDate } from "../utils/rondeEntryFormHelpers";
import type { RondeEntry, RondeOriginKind, RondeSavePayload } from "./ronde.types";

/** Entrée de `buildRondeEntrySavePayload`. */
export type RondeEntrySavePayloadInput = {
  selectedSite: SiteRef | null;
  selectedIntervenant: IntervenantRef | null;
  entry: RondeEntry | null;
  freshPending?: { siteDisplay?: string; intervenantName?: string };
  requestDate: string;
  motifTypeId: string;
  motifDetail: string;
  horairesDemandeObs: string;
  originKind: RondeOriginKind;
  originDetail: string;
  arrivalTime: string;
  departureTime: string;
  arrivalDate: string;
  departureDate: string;
  workOrderNumber: string;
  report: string;
  isPureCreateMode: boolean;
  effectiveLogicalDate: string;
  closureCustomValues: Record<string, string>;
  extraValues: Record<string, string>;
  logicalDateTransitionLabel: string;
};

/**
 * Valide la saisie et assemble le payload IPC.
 *
 * @param input - Champs formulaire + pending éventuel créé à l’enregistrement
 * @returns Erreur utilisateur, ou payload prêt pour create/update
 */
export function buildRondeEntrySavePayload(
  input: RondeEntrySavePayloadInput
): { error: string } | { payload: RondeSavePayload } {
  const resolvedSiteDisplay = input.selectedSite
    ? formatSiteSelectedLabel(input.selectedSite)
    : (input.freshPending?.siteDisplay ?? "").trim() || (input.entry?.siteDisplay || "").trim();
  const resolvedIntervenantName = input.selectedIntervenant
    ? input.selectedIntervenant.name
    : (input.freshPending?.intervenantName ?? "").trim() || (input.entry?.intervenantName || "").trim();

  if (!resolvedSiteDisplay) {
    return { error: "Le site est obligatoire." };
  }
  if (!resolvedIntervenantName) {
    return { error: "Le prestataire est obligatoire." };
  }
  if (!input.requestDate) {
    return { error: "La date de la demande est obligatoire." };
  }
  if (!input.motifTypeId.trim()) {
    return { error: "Le motif est obligatoire." };
  }
  if (input.originKind === "CLIENT" && !input.originDetail.trim()) {
    return { error: "Le nom du client est obligatoire lorsque l'origine est « Client »." };
  }

  const arrivalNorm = normalizeTimeForSave(input.arrivalTime);
  const departureNorm = normalizeTimeForSave(input.departureTime);
  const arrivalDate = String(input.arrivalDate || "").trim();
  const departureDate = String(input.departureDate || "").trim();
  if (arrivalNorm && !isValidTime(arrivalNorm)) {
    return { error: "L'heure d'arrivée est invalide." };
  }
  if (departureNorm && !isValidTime(departureNorm)) {
    return { error: "L'heure de départ est invalide." };
  }
  if (!input.isPureCreateMode && arrivalNorm && !isIsoDate(arrivalDate)) {
    return { error: "La date d'arrivée est obligatoire lorsque l'heure d'arrivée est renseignée." };
  }
  if (!input.isPureCreateMode && departureNorm && !isIsoDate(departureDate)) {
    return { error: "La date de départ est obligatoire lorsque l'heure de départ est renseignée." };
  }
  if (
    !input.isPureCreateMode &&
    arrivalNorm &&
    departureNorm &&
    computeDurationMinutes(arrivalDate, arrivalNorm, departureDate, departureNorm) == null
  ) {
    return { error: "La date et l'heure de départ doivent être postérieures à l'arrivée." };
  }

  const execArrival = input.isPureCreateMode ? "" : arrivalNorm;
  const execDeparture = input.isPureCreateMode ? "" : departureNorm;
  const execArrivalDate = input.isPureCreateMode ? "" : arrivalDate;
  const execDepartureDate = input.isPureCreateMode ? "" : departureDate;
  const execBon = input.isPureCreateMode ? "" : input.workOrderNumber.trim();
  const execReport = input.isPureCreateMode ? "" : input.report.trim();
  const execLogicalDate = input.isPureCreateMode ? "" : input.effectiveLogicalDate;
  const nextClosureCustomValues = {
    ...input.closureCustomValues,
    ...input.extraValues
  };
  if (execLogicalDate) {
    nextClosureCustomValues.date_logique_passage = execLogicalDate;
    nextClosureCustomValues.date_logique = execLogicalDate;
    if (input.logicalDateTransitionLabel) {
      nextClosureCustomValues.transition_date = input.logicalDateTransitionLabel;
    } else {
      delete nextClosureCustomValues.transition_date;
    }
  } else {
    delete nextClosureCustomValues.date_logique_passage;
    delete nextClosureCustomValues.date_logique;
    delete nextClosureCustomValues.transition_date;
  }

  return {
    payload: {
      siteId: input.selectedSite?.id || null,
      siteDisplay: resolvedSiteDisplay,
      requestDate: input.requestDate,
      motifTypeId: input.motifTypeId.trim(),
      motifDetail: input.motifDetail.trim(),
      horairesDemandeObs: input.horairesDemandeObs.trim(),
      originKind: input.originKind,
      originDetail: input.originDetail.trim(),
      intervenantId: input.selectedIntervenant?.id || null,
      intervenantName: resolvedIntervenantName,
      arrivalTime: execArrival,
      departureTime: execDeparture,
      arrivalDate: execArrivalDate || null,
      departureDate: execDepartureDate || null,
      workOrderNumber: execBon,
      report: execReport,
      closureCustomValues: nextClosureCustomValues
    }
  };
}
