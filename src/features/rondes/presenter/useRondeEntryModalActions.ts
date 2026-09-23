/**
 * Actions métier de la fiche ronde (submit, clôture, annulation, réouverture).
 *
 * Utilisé par `RondeEntryModal` : le JSX ne porte plus buildPayload / onSubmit.
 */

import { type FormEvent, useCallback } from "react";
import type { InterventionEntry } from "../../intervention/model/intervention.types";
import type { Role } from "../../../types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { resolveRondeClosureLabelTemplate } from "../utils/closureLabelTemplate";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";
import type { RondeEntry, RondeSavePayload, RondeSource } from "../model/ronde.types";
import { isRondeManagerRole, isRondePassagePast, plannedContractualClosureRefusal } from "../utils/rondePassageRules";
import { buildRondeEntrySavePayload } from "../model/rondeEntrySavePayload";
import type { RondeEntryCreatePreset, useRondeEntryForm } from "../hooks/useRondeEntryForm";

type RondeEntryFormApi = ReturnType<typeof useRondeEntryForm>;

type UseRondeEntryModalActionsParams = {
  form: RondeEntryFormApi;
  entry: RondeEntry | null;
  linkedInterventionEntry?: InterventionEntry | null;
  createPreset?: RondeEntryCreatePreset | null;
  requesterRole?: Role;
  onClose: () => void;
  onCreate: (
    payload: RondeSavePayload & {
      source: RondeSource;
      originInterventionId?: string | null;
      plannedProfileId?: string | null;
      plannedRoundKind?: string | null;
      plannedSlotKey?: string | null;
      initialStatus?: "EN_COURS" | "CLOTURE" | "ANNULE";
      cancellationReason?: string;
    }
  ) => Promise<boolean>;
  onUpdate: (id: string, expectedUpdatedAt: string, payload: RondeSavePayload) => Promise<RondeEntry | null>;
  onSetStatus: (
    id: string,
    expectedUpdatedAt: string,
    status: "EN_COURS" | "CLOTURE" | "ANNULE",
    cancellationReason?: string,
    cancellationKind?: "NON_EFFECTUEE" | "ANNULATION"
  ) => Promise<boolean>;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant: (name: string) => Promise<boolean>;
};

/**
 * @param params.form - État du formulaire (`useRondeEntryForm`)
 * @returns Handlers de soumission / statut et drapeaux de verrouillage
 */
export function useRondeEntryModalActions({
  form,
  entry,
  linkedInterventionEntry,
  createPreset,
  requesterRole,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
  onCreatePendingSite,
  onCreatePendingIntervenant
}: UseRondeEntryModalActionsParams) {
  const {
    selectedSite,
    selectedIntervenant,
    requestDate,
    motifTypeId,
    motifDetail,
    horairesDemandeObs,
    originKind,
    originDetail,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    isPureCreateMode,
    isPlannedCreatePreset,
    effectiveLogicalDate,
    closureCustomValues,
    extraValues,
    logicalDateTransitionLabel,
    pendingCode,
    pendingName,
    pendingIntervenantName,
    statusActionBusy,
    setStatusActionBusy,
    setFieldError,
    formLockedClosed,
    formLockedCanceled,
    isCreateMode,
    cancelReasonInput,
    setShowCancelReasonDialog,
    setCancelReasonInput,
    activePlannedProfile,
    plannedLineRequestedTime
  } = form;

  const buildPayload = useCallback(
    (freshPending?: { siteDisplay?: string; intervenantName?: string }): RondeSavePayload | null => {
      const result = buildRondeEntrySavePayload({
        selectedSite,
        selectedIntervenant,
        entry,
        freshPending,
        requestDate,
        motifTypeId,
        motifDetail,
        horairesDemandeObs,
        originKind,
        originDetail,
        arrivalTime,
        departureTime,
        workOrderNumber,
        report,
        isPureCreateMode,
        effectiveLogicalDate,
        closureCustomValues,
        extraValues,
        logicalDateTransitionLabel
      });
      if ("error" in result) {
        setFieldError(result.error);
        return null;
      }
      return result.payload;
    },
    [
      selectedSite,
      selectedIntervenant,
      entry,
      requestDate,
      motifTypeId,
      motifDetail,
      horairesDemandeObs,
      originKind,
      originDetail,
      arrivalTime,
      departureTime,
      workOrderNumber,
      report,
      isPureCreateMode,
      effectiveLogicalDate,
      closureCustomValues,
      extraValues,
      logicalDateTransitionLabel,
      setFieldError
    ]
  );

  const resolveLabelTemplate = useCallback(
    (template: string) =>
      resolveRondeClosureLabelTemplate(template, {
        siteCode: selectedSite?.code || "",
        siteName: selectedSite?.name || "",
        siteLabel: selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || "",
        profileLabel: activePlannedProfile?.label || "",
        prestataire: selectedIntervenant?.name || entry?.intervenantName || "",
        typePassage:
          entry?.source === "PLANIFIE" && entry?.plannedRoundKind
            ? formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind)
            : "",
        heureDemandee: plannedLineRequestedTime || "",
        dateDuJour: formatDateShortFr(requestDate),
        heureArrivee: arrivalTime.trim(),
        heureDepart: departureTime.trim(),
        numeroBon: workOrderNumber.trim(),
        compteRendu: report.trim()
      }),
    [
      selectedSite,
      selectedIntervenant,
      entry,
      activePlannedProfile,
      plannedLineRequestedTime,
      requestDate,
      arrivalTime,
      departureTime,
      workOrderNumber,
      report
    ]
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (statusActionBusy) return;
    if (formLockedClosed || formLockedCanceled) return;
    setFieldError("");

    let freshPending: { siteDisplay?: string; intervenantName?: string } | undefined;
    if (!entry) {
      const pendingPrep = await createPendingRefsIfNeededForSubmit({
        selectedFromCatalogSite: Boolean(selectedSite),
        selectedFromCatalogIntervenant: Boolean(selectedIntervenant),
        pendingCode,
        pendingName,
        pendingIntervenantInput: pendingIntervenantName,
        onCreatePendingSite,
        onCreatePendingIntervenant
      });
      if (!pendingPrep.ok) {
        if (pendingPrep.errorMessage) setFieldError(pendingPrep.errorMessage);
        return;
      }
      if (pendingPrep.createdSiteDisplay || pendingPrep.createdIntervenantName) {
        freshPending = {
          ...(pendingPrep.createdSiteDisplay ? { siteDisplay: pendingPrep.createdSiteDisplay } : {}),
          ...(pendingPrep.createdIntervenantName ? { intervenantName: pendingPrep.createdIntervenantName } : {})
        };
      }
    }

    const payload = buildPayload(freshPending);
    if (!payload) return;

    if (!entry) {
      setStatusActionBusy("save");
      const source: RondeSource =
        createPreset?.source === "PLANIFIE" ? "PLANIFIE" : linkedInterventionEntry?.id ? "LIEE_INTERVENTION" : "URGENCE";
      let ok = false;
      try {
        ok = await onCreate({
          ...payload,
          source,
          originInterventionId: linkedInterventionEntry?.id || null,
          plannedProfileId: createPreset?.source === "PLANIFIE" ? createPreset.plannedProfileId : null,
          plannedRoundKind: createPreset?.source === "PLANIFIE" ? createPreset.plannedRoundKind : null,
          plannedSlotKey: createPreset?.source === "PLANIFIE" ? createPreset.plannedSlotKey : null
        });
      } finally {
        setStatusActionBusy(null);
      }
      if (ok) onClose();
      return;
    }

    setStatusActionBusy("save");
    let updated: RondeEntry | null = null;
    try {
      updated = await onUpdate(entry.id, entry.updatedAt, payload);
    } finally {
      setStatusActionBusy(null);
    }
    if (updated) onClose();
  };

  const submitCancellation = async () => {
    if (!entry) return;
    if (statusActionBusy) return;
    const cleanReason = cancelReasonInput.trim();
    if (!cleanReason) {
      setFieldError("Le motif est obligatoire.");
      return;
    }
    const isManager = isRondeManagerRole(requesterRole);
    const past = isRondePassagePast(entry);
    const kind: "NON_EFFECTUEE" | "ANNULATION" = isManager ? "ANNULATION" : "NON_EFFECTUEE";
    if (!isManager && !past) {
      setFieldError("Une ronde ne peut être marquée non effectuée qu'après l'heure de passage.");
      return;
    }
    setFieldError("");
    setStatusActionBusy("cancel");
    const ok = await onSetStatus(entry.id, entry.updatedAt, "ANNULE", cleanReason, kind);
    setStatusActionBusy(null);
    if (ok) {
      setShowCancelReasonDialog(false);
      setCancelReasonInput("");
      onClose();
    }
  };

  const closeRonde = async () => {
    if (statusActionBusy) return;
    setFieldError("");
    const isPlannedClosure = Boolean(isPlannedCreatePreset || entry?.source === "PLANIFIE");
    const closureRefusal = plannedContractualClosureRefusal({
      source: isPlannedClosure ? "PLANIFIE" : entry?.source,
      requestDate,
      horairesDemandeObs,
      requestPlanningSnapshot: entry?.requestPlanningSnapshot,
      report,
      arrivalTime,
      departureTime
    });
    if (closureRefusal) {
      setFieldError(closureRefusal);
      return;
    }
    const payload = buildPayload();
    if (!payload) return;
    setStatusActionBusy("close");
    if (!entry && isPlannedCreatePreset) {
      const ok = await onCreate({
        ...payload,
        source: "PLANIFIE",
        originInterventionId: null,
        plannedProfileId: createPreset?.plannedProfileId ?? null,
        plannedRoundKind: createPreset?.plannedRoundKind ?? null,
        plannedSlotKey: createPreset?.plannedSlotKey ?? null,
        initialStatus: "CLOTURE"
      });
      setStatusActionBusy(null);
      if (ok) onClose();
      return;
    }
    if (!entry) {
      setStatusActionBusy(null);
      return;
    }
    const updated = await onUpdate(entry.id, entry.updatedAt, payload);
    if (!updated) {
      setStatusActionBusy(null);
      return;
    }
    const ok = await onSetStatus(updated.id, updated.updatedAt, "CLOTURE");
    setStatusActionBusy(null);
    if (ok) onClose();
  };

  const reopenRonde = async () => {
    if (!entry) return;
    if (statusActionBusy) return;
    setStatusActionBusy("reopen");
    const ok = await onSetStatus(entry.id, entry.updatedAt, "EN_COURS");
    setStatusActionBusy(null);
    if (ok) setFieldError("");
  };

  const isManagerRole = isRondeManagerRole(requesterRole);
  const cancelIsNonEffectuee = Boolean(entry && !isManagerRole && isRondePassagePast(entry));
  const canShowCancelAction =
    Boolean(entry) &&
    entry!.status === "EN_COURS" &&
    (isManagerRole || (entry!.source !== "PLANIFIE" && isRondePassagePast(entry!)));

  const lockFields = formLockedClosed || formLockedCanceled;
  const lockActions = statusActionBusy !== null;
  const lockExceptionnelleDemandeSection =
    !isCreateMode &&
    entry != null &&
    (entry.source === "URGENCE" || entry.source === "LIEE_INTERVENTION");
  const lockDemandeFields = lockFields || lockExceptionnelleDemandeSection;

  return {
    onSubmit,
    submitCancellation,
    closeRonde,
    reopenRonde,
    resolveLabelTemplate,
    cancelIsNonEffectuee,
    canShowCancelAction,
    lockFields,
    lockActions,
    lockDemandeFields
  };
}
