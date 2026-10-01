/**
 * Modale création / édition d’une intervention — orchestration.
 *
 * Sections UI et état formulaire extraits (meta, passage, extras Word, footer, dialogs).
 * Hydratation : `[isOpen, mode, entry?.id]`.
 */

import { type FormEvent } from "react";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import type { InterventionEntry, InterventionSavePayload } from "../model/intervention.types";
import type { NotifyToast } from "../../common/model/toast.types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { isValidTime, normalizeTimeForSave } from "../../common/utils/timeInput";
import { validatePassageDateTimes } from "../utils/interventionPassageDates";
import { getMissingInterventionClosureFields } from "../utils/getMissingInterventionClosureFields";
import { buildInterventionExportExtraPayload } from "../utils/buildInterventionExportExtraPayload";
import { useInterventionEntryForm, type InterventionEntryMode } from "../hooks/useInterventionEntryForm";
import { reportTitleWithDailyCode } from "../../common/utils/dailyEntryCode";
import { InterventionEntryEditHeader } from "./InterventionEntryEditHeader";
import { InterventionRequestMetaSection } from "./InterventionRequestMetaSection";
import { InterventionPassageSection } from "./InterventionPassageSection";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import { InterventionEntryEditFooter } from "./InterventionEntryEditFooter";
import { InterventionEntryReasonDialogs } from "./InterventionEntryReasonDialogs";

type InterventionEntryModalProps = {
  isOpen: boolean;
  mode: InterventionEntryMode;
  entry: InterventionEntry | null;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  requesterRole: Role;
  isResponsable: boolean;
  onClose: () => void;
  onCreate: (payload: InterventionSavePayload) => Promise<boolean>;
  onUpdate: (id: string, expectedUpdatedAt: string, payload: InterventionSavePayload) => Promise<InterventionEntry | null>;
  onSetStatus: (
    id: string,
    expectedUpdatedAt: string,
    status: "EN_COURS" | "CLOTURE" | "ANNULE",
    cancellationReason?: string
  ) => Promise<boolean>;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant: (name: string) => Promise<boolean>;
  onNotify?: NotifyToast;
  onAfterReopen?: () => void;
  canOpenLinkedRonde?: boolean;
  onOpenLinkedRonde?: () => void;
  canOpenLinkedGardiennage?: boolean;
  onOpenLinkedGardiennage?: () => void;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
  onNavigateToLinkedGardiennage?: (gardiennageId: string) => void;
  onSaveWord?: () => void;
  onOpenWord?: () => void;
  canOpenWord?: boolean;
  lastWordFilePath?: string | null;
};

export function InterventionEntryModal({
  isOpen,
  mode,
  entry,
  sites,
  intervenants,
  requesterRole,
  isResponsable,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
  onCreatePendingSite,
  onCreatePendingIntervenant,
  onNotify,
  onAfterReopen,
  canOpenLinkedRonde,
  onOpenLinkedRonde,
  canOpenLinkedGardiennage,
  onOpenLinkedGardiennage,
  onNavigateToLinkedRonde,
  onNavigateToLinkedGardiennage,
  onSaveWord,
  onOpenWord,
  canOpenWord,
  lastWordFilePath
}: InterventionEntryModalProps) {
  const form = useInterventionEntryForm({
    isOpen,
    mode,
    entry,
    sites,
    intervenants,
    requesterRole,
    isResponsable,
    onClose
  });

  if (!isOpen) return null;

  const buildPayload = (freshPending?: { siteDisplay?: string; intervenantName?: string }): InterventionSavePayload | null => {
    const resolvedSiteDisplay = form.selectedSite
      ? formatSiteSelectedLabel(form.selectedSite)
      : (freshPending?.siteDisplay ?? "").trim() || (entry?.siteDisplay || "").trim();
    const resolvedIntervenantName = form.selectedIntervenant
      ? form.selectedIntervenant.name
      : (freshPending?.intervenantName ?? "").trim() || (entry?.intervenantName || "").trim();
    if (!resolvedSiteDisplay) {
      form.setFieldError("Le site est obligatoire.");
      return null;
    }
    if (!resolvedIntervenantName) {
      form.setFieldError("Le prestataire est obligatoire.");
      return null;
    }
    if (!form.requestReason.trim()) {
      form.setFieldError("Le motif est obligatoire.");
      return null;
    }
    if (!form.requestDate) {
      form.setFieldError("La date de demande est obligatoire.");
      return null;
    }
    const requestTimeNorm = normalizeTimeForSave(form.requestTime);
    const arrivalTimeNorm = normalizeTimeForSave(form.arrivalTime);
    const departureTimeNorm = normalizeTimeForSave(form.departureTime);
    if (!isValidTime(requestTimeNorm)) {
      form.setFieldError("L'heure de demande est invalide.");
      return null;
    }
    if (arrivalTimeNorm && !isValidTime(arrivalTimeNorm)) {
      form.setFieldError("L'heure d'arrivée est invalide.");
      return null;
    }
    if (departureTimeNorm && !isValidTime(departureTimeNorm)) {
      form.setFieldError("L'heure de départ est invalide.");
      return null;
    }
    const passageValidation = validatePassageDateTimes({
      requestDate: form.requestDate,
      requestTime: requestTimeNorm,
      arrivalDate: form.passageDatesResolved.arrivalDate,
      arrivalTime: arrivalTimeNorm,
      departureDate: form.passageDatesResolved.departureDate,
      departureTime: departureTimeNorm
    });
    if (passageValidation) {
      form.setFieldError(passageValidation);
      return null;
    }
    return {
      siteId: form.selectedSite?.id || null,
      siteDisplay: resolvedSiteDisplay,
      requestReason: form.requestReason.trim(),
      requestDate: form.requestDate,
      requestTime: requestTimeNorm,
      arrivalDate: form.passageDatesResolved.arrivalDate || null,
      arrivalTime: arrivalTimeNorm,
      departureDate: form.passageDatesResolved.departureDate || null,
      departureTime: departureTimeNorm,
      workOrderNumber: form.workOrderNumber.trim(),
      report: form.report.trim(),
      intervenantId: form.selectedIntervenant?.id || null,
      intervenantName: resolvedIntervenantName,
      exportExtraValues: buildInterventionExportExtraPayload({
        exportExtraValues: form.exportExtraValues,
        effectiveLogicalDate: form.effectiveLogicalDate,
        logicalDateTransitionLabel: form.logicalDateTransitionLabel
      })
    };
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.isActionSubmitting) return;
    if (form.formLockedClosed) return;
    form.setFieldError("");

    let freshPending: { siteDisplay?: string; intervenantName?: string } | undefined;
    if (!entry) {
      const pendingPrep = await createPendingRefsIfNeededForSubmit({
        selectedFromCatalogSite: Boolean(form.selectedSite),
        selectedFromCatalogIntervenant: Boolean(form.selectedIntervenant),
        pendingCode: form.pendingCode,
        pendingName: form.pendingName,
        pendingIntervenantInput: form.pendingIntervenantName,
        onCreatePendingSite,
        onCreatePendingIntervenant
      });
      if (!pendingPrep.ok) {
        if (pendingPrep.errorMessage) form.setFieldError(pendingPrep.errorMessage);
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
      form.setIsActionSubmitting(true);
      let ok = false;
      try {
        ok = await onCreate(payload);
      } finally {
        form.setIsActionSubmitting(false);
      }
      if (ok) onClose();
      return;
    }
    form.setIsActionSubmitting(true);
    let updated: InterventionEntry | null = null;
    try {
      updated = await onUpdate(entry.id, entry.updatedAt, payload);
    } finally {
      form.setIsActionSubmitting(false);
    }
    if (updated) onClose();
  };

  const submitCancellation = async () => {
    if (form.isActionSubmitting || !entry) return;
    const cleanReason = form.cancelReasonInput.trim();
    if (!cleanReason) {
      form.setFieldError("Le motif d'annulation est obligatoire.");
      return;
    }
    form.setFieldError("");
    form.setIsActionSubmitting(true);
    let ok = false;
    try {
      ok = await onSetStatus(entry.id, entry.updatedAt, "ANNULE", cleanReason);
    } finally {
      form.setIsActionSubmitting(false);
    }
    if (ok) {
      form.setShowCancelReasonDialog(false);
      form.setCancelReasonInput("");
      onClose();
    }
  };

  const closeIntervention = async () => {
    if (form.isActionSubmitting || !entry) return;
    form.setFieldError("");
    const missingForClose = getMissingInterventionClosureFields({
      requestDate: form.requestDate,
      arrivalDate: form.passageDatesResolved.arrivalDate,
      arrivalTime: form.arrivalTime,
      departureDate: form.passageDatesResolved.departureDate,
      departureTime: form.departureTime,
      report: form.report
    });
    if (missingForClose.length) {
      form.setFieldError(`Clôture impossible: complétez ${missingForClose.join(", ")}.`);
      return;
    }
    const payload = buildPayload();
    if (!payload) return;
    form.setIsActionSubmitting(true);
    let updated: InterventionEntry | null = null;
    try {
      updated = await onUpdate(entry.id, entry.updatedAt, payload);
    } finally {
      if (!updated) form.setIsActionSubmitting(false);
    }
    if (!updated) return;
    let ok = false;
    try {
      ok = await onSetStatus(updated.id, updated.updatedAt, "CLOTURE");
    } finally {
      form.setIsActionSubmitting(false);
    }
    if (ok) onClose();
  };

  const reopenIntervention = async () => {
    if (form.isActionSubmitting || !entry) return;
    form.setIsActionSubmitting(true);
    let ok = false;
    try {
      ok = await onSetStatus(entry.id, entry.updatedAt, "EN_COURS");
    } finally {
      form.setIsActionSubmitting(false);
    }
    if (ok) onAfterReopen?.();
  };

  return (
    <>
      <div className="modal-overlay" onClick={form.createCloseGuard.requestClose}>
        <section
          className="modal main-log-modal main-courante-entry-modal intervention-entry-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {form.isCreateMode ? (
            <CreateEntryModalHeader kind="intervention" onCloseRequest={form.createCloseGuard.requestClose} />
          ) : (
            <InterventionEntryEditHeader
              title={reportTitleWithDailyCode(
                entry?.status === "CLOTURE" || entry?.status === "ANNULE"
                  ? "Rapport d'intervention"
                  : "Édition intervention",
                entry?.dailyCode
              )}
              linkedRondeId={entry?.linkedRondeId}
              linkedGardiennageId={entry?.linkedGardiennageId}
              onNavigateToLinkedRonde={onNavigateToLinkedRonde}
              onNavigateToLinkedGardiennage={onNavigateToLinkedGardiennage}
              onClose={onClose}
              onCloseRequest={form.createCloseGuard.requestClose}
            />
          )}
          <div className="mc-field-section mc-field-section-tight">
            <form className="mc-entry-form" onSubmit={onSubmit}>
              <InterventionRequestMetaSection
                isCreateMode={form.isCreateMode}
                canFixKnownReferences={form.canFixKnownReferences}
                formLockedClosed={form.formLockedClosed}
                lockCoreFields={form.lockCoreFields}
                sites={sites}
                intervenants={intervenants}
                selectedSite={form.selectedSite}
                selectedIntervenant={form.selectedIntervenant}
                entrySiteDisplay={entry?.siteDisplay}
                entryIntervenantName={entry?.intervenantName}
                requestDate={form.requestDate}
                requestTime={form.requestTime}
                requestReason={form.requestReason}
                pendingCode={form.pendingCode}
                pendingName={form.pendingName}
                pendingIntervenantName={form.pendingIntervenantName}
                showPendingSiteForm={form.showPendingSiteForm}
                showPendingIntervenantForm={form.showPendingIntervenantForm}
                onNotify={onNotify}
                onRequestDateChange={form.setRequestDate}
                onRequestTimeChange={form.setRequestTime}
                onRequestReasonChange={form.setRequestReason}
                onSelectedSiteChange={(site) => form.setSiteId(site?.id || "")}
                onSelectedIntervenantChange={(item) => form.setIntervenantId(item?.id || "")}
                onPendingCodeChange={form.setPendingCode}
                onPendingNameChange={form.setPendingName}
                onPendingIntervenantNameChange={form.setPendingIntervenantName}
                onTogglePendingSite={() => form.setShowPendingSiteForm((current) => !current)}
                onTogglePendingIntervenant={() => form.setShowPendingIntervenantForm((current) => !current)}
                onClearPendingSiteFields={() => {
                  form.setShowPendingSiteForm(false);
                  form.setPendingCode("");
                  form.setPendingName("");
                }}
                onClearPendingIntervenantFields={() => {
                  form.setShowPendingIntervenantForm(false);
                  form.setPendingIntervenantName("");
                }}
                besideMotif={
                  form.requestExtraDefs.length === 1 ? (
                    <FormVariableFields
                      defs={form.requestExtraDefs}
                      values={form.exportExtraValues}
                      onValuesChange={form.setExportExtraValues}
                      disabled={!form.isCreateMode || form.formLockedClosed}
                      compact
                    />
                  ) : null
                }
              />
              {form.requestExtraDefs.length > 1 ? (
                <FormVariableFields
                  defs={form.requestExtraDefs}
                  values={form.exportExtraValues}
                  onValuesChange={form.setExportExtraValues}
                  disabled={!form.isCreateMode || form.formLockedClosed}
                  title="Champs de la demande"
                />
              ) : null}
              {!form.showRequiredFieldsOnly ? (
                <>
                  <InterventionPassageSection
                    arrivalDate={form.arrivalDate}
                    arrivalTime={form.arrivalTime}
                    departureDate={form.departureDate}
                    departureTime={form.departureTime}
                    workOrderNumber={form.workOrderNumber}
                    report={form.report}
                    formLockedClosed={form.formLockedClosed}
                    shiftedAfterMidnight={form.logicalDateComputed.shiftedAfterMidnight}
                    onArrivalDateChange={form.setArrivalDate}
                    onArrivalTimeChange={form.setArrivalTime}
                    onDepartureDateChange={form.setDepartureDate}
                    onDepartureTimeChange={form.setDepartureTime}
                    onWorkOrderNumberChange={form.setWorkOrderNumber}
                    onReportChange={form.setReport}
                  />
                  <FormVariableFields
                    defs={form.closureExtraDefs}
                    values={form.exportExtraValues}
                    onValuesChange={form.setExportExtraValues}
                    disabled={form.formLockedClosed}
                  />
                </>
              ) : null}
              {form.fieldError ? <p className="error mc-field-error">{form.fieldError}</p> : null}
              {form.isCreateMode ? (
                <CreateEntryModalFooter
                  hintContent={null}
                  onCancel={form.createCloseGuard.requestClose}
                  submitting={form.isActionSubmitting}
                />
              ) : entry ? (
                <InterventionEntryEditFooter
                  entry={entry}
                  isActionSubmitting={form.isActionSubmitting}
                  canOpenLinkedRonde={canOpenLinkedRonde}
                  canOpenLinkedGardiennage={canOpenLinkedGardiennage}
                  onClose={form.createCloseGuard.requestClose}
                  onOpenLinkedRonde={onOpenLinkedRonde}
                  onOpenLinkedGardiennage={onOpenLinkedGardiennage}
                  onViewLinkedRonde={
                    entry.linkedRondeId && onNavigateToLinkedRonde
                      ? () => {
                          onNavigateToLinkedRonde(entry.linkedRondeId!);
                          onClose();
                        }
                      : undefined
                  }
                  onViewLinkedGardiennage={
                    entry.linkedGardiennageId && onNavigateToLinkedGardiennage
                      ? () => {
                          onNavigateToLinkedGardiennage(entry.linkedGardiennageId!);
                          onClose();
                        }
                      : undefined
                  }
                  onRequestCancel={() => {
                    form.setFieldError("");
                    form.setCancelReasonInput("");
                    form.setShowCancelReasonDialog(true);
                  }}
                  onCloseIntervention={() => void closeIntervention()}
                  onReopen={() => void reopenIntervention()}
                  onSaveWord={onSaveWord}
                  onOpenWord={onOpenWord}
                  canOpenWord={canOpenWord}
                  lastWordFilePath={lastWordFilePath}
                />
              ) : null}
            </form>
          </div>
        </section>
      </div>
      <DiscardConfirmModal
        isOpen={form.createCloseGuard.showDiscardConfirm}
        kind={form.isCreateMode ? "create" : "edit"}
        onCancel={form.createCloseGuard.cancelDiscard}
        onConfirm={form.createCloseGuard.confirmDiscardAndClose}
      />
      <InterventionEntryReasonDialogs
        showCancelReasonDialog={form.showCancelReasonDialog}
        cancelReasonInput={form.cancelReasonInput}
        onCancelReasonChange={form.setCancelReasonInput}
        onCloseCancelDialog={() => form.setShowCancelReasonDialog(false)}
        onConfirmCancel={() => void submitCancellation()}
      />
    </>
  );
}
