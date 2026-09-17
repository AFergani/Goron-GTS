/**
 * Modale fiche ronde (saisie, clôture, intervention liée, référentiels en attente).
 *
 * Hydratation / état : useRondeEntryForm. Orchestration submit + actions statut.
 */

import { type FormEvent } from "react";
import type { InterventionEntry } from "../../intervention/model/intervention.types";
import type { SiteRef, IntervenantRef, Role } from "../../../types";
import {
  type RondeEntry,
  type RondeMotifTypeRef,
  type RondeOriginKind,
  type RondeSavePayload,
  type RondeSource
} from "../model/ronde.types";
import { isRondeManagerRole, isRondePassagePast } from "../utils/rondePassageRules";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { WordExportRowButtons } from "../../common/components/ExportFileButtons";
import { isValidTime, normalizeTimeForSave } from "../../common/utils/timeInput";
import { resolveRondeClosureLabelTemplate } from "../utils/closureLabelTemplate";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";
import type { NotifyToast } from "../../common/model/toast.types";
import { reportTitleWithDailyCode } from "../../common/utils/dailyEntryCode";
import { InterventionLinkedReadonlyPanel } from "./InterventionLinkedReadonlyPanel";
import { RondeEntryRequestSection } from "./RondeEntryRequestSection";
import { RondeEntryExecutionSection } from "./RondeEntryExecutionSection";
import { RondeEntryReasonDialogs } from "./RondeEntryReasonDialogs";
import {
  useRondeEntryForm,
  type RondeEntryCreatePreset,
  type RondeEntryMode
} from "../hooks/useRondeEntryForm";

type Mode = RondeEntryMode;

type RondeEntryModalProps = {
  isOpen: boolean;
  mode: Mode;
  entry: RondeEntry | null;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  rondeMotifs: RondeMotifTypeRef[];
  plannedProfiles: RondePlannedProfileRef[];
  linkedInterventionEntry?: InterventionEntry | null;
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
  requesterRole?: Role;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant: (name: string) => Promise<boolean>;
  /** Toasts copie code site, etc. */
  onNotify?: NotifyToast;
  /** Ouvre la page Intervention sur la fiche liée (traçabilité interne, sans afficher d’id technique). */
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onOpenLinkedRequest?: (payload: {
    source: RondeSource;
    plannedProfileId?: string | null;
    requestDate: string;
    motifTypeId: string | null;
    horairesDemandeObs: string;
    siteId: string | null;
    intervenantId: string | null;
    originInterventionId?: string | null;
    originKind?: RondeOriginKind;
    originDetail?: string;
    planningSnapshot?: RondePlanningSnapshotV1 | null;
    /** Ouverture « Demande liée » depuis une fiche ronde déjà créée */
    anchorRondeId?: string | null;
  }) => void;
  createPreset?: RondeEntryCreatePreset | null;
  onSaveWord?: () => void;
  onOpenWord?: () => void;
  canOpenWord?: boolean;
  lastWordFilePath?: string | null;
};

export function RondeEntryModal({
  isOpen,
  mode,
  entry,
  sites,
  intervenants,
  rondeMotifs,
  plannedProfiles,
  linkedInterventionEntry,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
  onCreatePendingSite,
  onCreatePendingIntervenant,
  onNotify,
  onNavigateToLinkedIntervention,
  onOpenLinkedRequest,
  createPreset,
  requesterRole,
  onSaveWord,
  onOpenWord,
  canOpenWord = false,
  lastWordFilePath = null
}: RondeEntryModalProps) {
  const form = useRondeEntryForm({
    isOpen,
    mode,
    entry,
    sites,
    intervenants,
    rondeMotifs,
    plannedProfiles,
    linkedInterventionEntry,
    createPreset,
    onClose
  });

  const {
    requestDate,
    setRequestDate,
    siteId,
    setSiteId,
    motifTypeId,
    setMotifTypeId,
    motifDetail,
    setMotifDetail,
    horairesDemandeObs,
    setHorairesDemandeObs,
    originKind,
    setOriginKind,
    originDetail,
    setOriginDetail,
    intervenantId,
    setIntervenantId,
    arrivalTime,
    setArrivalTime,
    departureTime,
    setDepartureTime,
    workOrderNumber,
    setWorkOrderNumber,
    report,
    setReport,
    closureCustomValues,
    setClosureCustomValues,
    fieldError,
    setFieldError,
    pendingCode,
    setPendingCode,
    pendingName,
    setPendingName,
    pendingIntervenantName,
    setPendingIntervenantName,
    showPendingSiteForm,
    setShowPendingSiteForm,
    showPendingIntervenantForm,
    setShowPendingIntervenantForm,
    showCancelReasonDialog,
    setShowCancelReasonDialog,
    cancelReasonInput,
    setCancelReasonInput,
    statusActionBusy,
    setStatusActionBusy,
    isCreateMode,
    formLockedClosed,
    formLockedCanceled,
    splitLinkedLayout,
    isPlannedCreatePreset,
    isPureCreateMode,
    useReportModalLayout,
    showExecutionBlock,
    selectedSite,
    selectedIntervenant,
    selectedMotifLabel,
    activePlannedProfile,
    plannedLineRequestedTime,
    durationMinutes,
    logicalDateComputed,
    effectiveLogicalDate,
    hasLogicalDateTransition,
    logicalDateTransitionLabel,
    createCloseGuard
  } = form;

  if (!isOpen) return null;


  const buildPayload = (freshPending?: { siteDisplay?: string; intervenantName?: string }): RondeSavePayload | null => {
    const resolvedSiteDisplay = selectedSite
      ? formatSiteSelectedLabel(selectedSite)
      : (freshPending?.siteDisplay ?? "").trim() || (entry?.siteDisplay || "").trim();
    const resolvedIntervenantName = selectedIntervenant
      ? selectedIntervenant.name
      : (freshPending?.intervenantName ?? "").trim() || (entry?.intervenantName || "").trim();

    if (!resolvedSiteDisplay) {
      setFieldError("Le site est obligatoire.");
      return null;
    }
    if (!resolvedIntervenantName) {
      setFieldError("Le prestataire est obligatoire.");
      return null;
    }
    if (!requestDate) {
      setFieldError("La date de la demande est obligatoire.");
      return null;
    }
    if (!motifTypeId.trim()) {
      setFieldError("Le motif est obligatoire.");
      return null;
    }
    if (originKind === "CLIENT" && !originDetail.trim()) {
      setFieldError("Le nom du client est obligatoire lorsque l'origine est « Client ».");
      return null;
    }

    const arrivalNorm = normalizeTimeForSave(arrivalTime);
    const departureNorm = normalizeTimeForSave(departureTime);
    if (arrivalNorm && !isValidTime(arrivalNorm)) {
      setFieldError("L'heure d'arrivée est invalide.");
      return null;
    }
    if (departureNorm && !isValidTime(departureNorm)) {
      setFieldError("L'heure de départ est invalide.");
      return null;
    }

    const execArrival = isPureCreateMode ? "" : arrivalNorm;
    const execDeparture = isPureCreateMode ? "" : departureNorm;
    const execBon = isPureCreateMode ? "" : workOrderNumber.trim();
    const execReport = isPureCreateMode ? "" : report.trim();
    const execLogicalDate = isPureCreateMode ? "" : effectiveLogicalDate;
    const nextClosureCustomValues = {
      ...closureCustomValues
    };
    if (execLogicalDate) {
      nextClosureCustomValues.date_logique_passage = execLogicalDate;
      nextClosureCustomValues.date_logique = execLogicalDate;
      if (logicalDateTransitionLabel) {
        nextClosureCustomValues.transition_date = logicalDateTransitionLabel;
      } else {
        delete nextClosureCustomValues.transition_date;
      }
    } else {
      delete nextClosureCustomValues.date_logique_passage;
      delete nextClosureCustomValues.date_logique;
      delete nextClosureCustomValues.transition_date;
    }

    return {
      siteId: selectedSite?.id || null,
      siteDisplay: resolvedSiteDisplay,
      requestDate,
      motifTypeId: motifTypeId.trim(),
      motifDetail: motifDetail.trim(),
      horairesDemandeObs: horairesDemandeObs.trim(),
      originKind,
      originDetail: originDetail.trim(),
      intervenantId: selectedIntervenant?.id || null,
      intervenantName: resolvedIntervenantName,
      arrivalTime: execArrival,
      departureTime: execDeparture,
      workOrderNumber: execBon,
      report: execReport,
      closureCustomValues: nextClosureCustomValues
    };
  };

  const resolveLabelTemplate = (template: string) =>
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
    });

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
    // Non effectuée = après passage (opérateur). Responsable = annulation administrative.
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

  const isManagerRole = isRondeManagerRole(requesterRole);
  const cancelIsNonEffectuee = Boolean(entry && !isManagerRole && isRondePassagePast(entry));
  const canShowCancelAction =
    Boolean(entry) &&
    entry!.status === "EN_COURS" &&
    (isManagerRole || (entry!.source !== "PLANIFIE" && isRondePassagePast(entry!)));

  const lockFields = formLockedClosed || formLockedCanceled;
  const lockActions = statusActionBusy !== null;
  /** Rondes « exceptionnelles » (hors planifié) : la demande est figée après création ; seul le terrain / clôture reste éditable. */
  const lockExceptionnelleDemandeSection =
    !isCreateMode &&
    entry != null &&
    (entry.source === "URGENCE" || entry.source === "LIEE_INTERVENTION");
  const lockDemandeFields = lockFields || lockExceptionnelleDemandeSection;

  /** En mode rapport (édition ou passage planifié), masquer la section demande et garder uniquement le CR. */
  const masquerSectionsDemandePlanifiee = useReportModalLayout;

  const demandeFormSections = (
    <RondeEntryRequestSection
      isCreateMode={isCreateMode}
      lockDemandeFields={lockDemandeFields}
      lockFields={lockFields}
      sites={sites}
      intervenants={intervenants}
      rondeMotifs={rondeMotifs}
      selectedSite={selectedSite}
      selectedIntervenant={selectedIntervenant}
      entry={entry}
      requestDate={requestDate}
      motifTypeId={motifTypeId}
      motifDetail={motifDetail}
      horairesDemandeObs={horairesDemandeObs}
      originKind={originKind}
      originDetail={originDetail}
      showPendingSiteForm={showPendingSiteForm}
      showPendingIntervenantForm={showPendingIntervenantForm}
      pendingCode={pendingCode}
      pendingName={pendingName}
      pendingIntervenantName={pendingIntervenantName}
      onNotify={onNotify}
      onRequestDateChange={setRequestDate}
      onMotifTypeIdChange={setMotifTypeId}
      onMotifDetailChange={setMotifDetail}
      onHorairesDemandeObsChange={setHorairesDemandeObs}
      onOriginKindChange={setOriginKind}
      onOriginDetailChange={setOriginDetail}
      onSelectedSiteChange={(site) => setSiteId(site?.id || "")}
      onSelectedIntervenantChange={(item) => setIntervenantId(item?.id || "")}
      onTogglePendingSite={() => setShowPendingSiteForm((c) => !c)}
      onTogglePendingIntervenant={() => setShowPendingIntervenantForm((c) => !c)}
      onPendingCodeChange={setPendingCode}
      onPendingNameChange={setPendingName}
      onPendingIntervenantNameChange={setPendingIntervenantName}
      onClearPendingSiteFields={() => {
        setShowPendingSiteForm(false);
        setPendingCode("");
        setPendingName("");
      }}
      onClearPendingIntervenantFields={() => {
        setShowPendingIntervenantForm(false);
        setPendingIntervenantName("");
      }}
      onIntervenantIdChange={setIntervenantId}
    />
  );

  const formBody = (
    <form className="mc-entry-form" onSubmit={onSubmit}>
      {!masquerSectionsDemandePlanifiee ? demandeFormSections : null}

      {showExecutionBlock ? (
        <RondeEntryExecutionSection
          entry={entry}
          isPlannedCreatePreset={isPlannedCreatePreset}
          createPresetRoundKind={createPreset?.plannedRoundKind}
          selectedMotifLabel={selectedMotifLabel}
          requestDate={requestDate}
          plannedLineRequestedTime={plannedLineRequestedTime}
          selectedSite={selectedSite}
          selectedIntervenant={selectedIntervenant}
          intervenants={intervenants}
          lockFields={lockFields}
          arrivalTime={arrivalTime}
          departureTime={departureTime}
          workOrderNumber={workOrderNumber}
          durationMinutes={durationMinutes}
          report={report}
          formLockedClosed={formLockedClosed}
          logicalDateShiftedAfterMidnight={logicalDateComputed.shiftedAfterMidnight}
          activePlannedProfile={activePlannedProfile}
          closureCustomValues={closureCustomValues}
          showClosureFields={Boolean((!isCreateMode && entry?.source === "PLANIFIE") || isPlannedCreatePreset)}
          resolveFieldLabel={resolveLabelTemplate}
          onNotify={onNotify}
          onArrivalTimeChange={setArrivalTime}
          onDepartureTimeChange={setDepartureTime}
          onWorkOrderNumberChange={setWorkOrderNumber}
          onReportChange={setReport}
          onIntervenantIdChange={setIntervenantId}
          onClosureCustomValuesChange={setClosureCustomValues}
        />
      ) : (
        <p className="muted mc-ref-hint" style={{ marginTop: 12 }}>
          {entry?.source === "PLANIFIE"
            ? "Après création du passage, complétez le compte rendu terrain ici puis clôturez. Le prestataire a été fixé à la création de l'occurrence."
            : "Après création, ouvrez la ronde pour saisir le compte rendu terrain et clôturer."}
        </p>
      )}

      {fieldError ? <p className="error mc-field-error">{fieldError}</p> : null}

      {isPureCreateMode ? (
        <CreateEntryModalFooter
          hintContent={null}
          onCancel={createCloseGuard.requestClose}
          submitDisabled={lockFields || (!rondeMotifs.length && isCreateMode)}
          submitting={lockActions}
        />
      ) : (
        <div className="mc-modal-footer mc-modal-footer-split">
          <div className="mc-modal-footer-start">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fermer
            </button>
          </div>
          <div className="mc-modal-footer-end">
            {onSaveWord &&
            onOpenWord &&
            (entry?.status === "CLOTURE" || entry?.status === "ANNULE") ? (
              <WordExportRowButtons
                variant="modal"
                disabled={lockActions}
                onExportWord={onSaveWord}
                onOpenReport={onOpenWord}
                canOpenReport={canOpenWord}
                lastFilePath={lastWordFilePath}
              />
            ) : null}
            {canShowCancelAction ? (
              <button
                type="button"
                className="btn-danger"
                disabled={lockFields || lockActions}
                onClick={() => {
                  setFieldError("");
                  setCancelReasonInput("");
                  setShowCancelReasonDialog(true);
                }}
              >
                {statusActionBusy === "cancel"
                  ? "Enregistrement…"
                  : cancelIsNonEffectuee
                    ? "Ronde non effectuée"
                    : "Annuler la ronde"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-light"
              disabled={lockFields || entry?.status === "CLOTURE" || lockActions}
              onClick={async () => {
                if (statusActionBusy) return;
                setFieldError("");
                const isPlannedClosure = Boolean(isPlannedCreatePreset || entry?.source === "PLANIFIE");
                if (isPlannedClosure && !report.trim()) {
                  setFieldError("Le compte rendu est obligatoire avant clôture.");
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
              }}
            >
              {statusActionBusy === "close" ? "Clôture…" : "Clôturer la ronde"}
            </button>
            {entry?.status === "CLOTURE" || entry?.status === "ANNULE" ? (
              <button
                type="button"
                className="mc-btn-primary"
                disabled={lockActions}
                onClick={async () => {
                  if (!entry) return;
                  if (statusActionBusy) return;
                  setStatusActionBusy("reopen");
                  const ok = await onSetStatus(entry.id, entry.updatedAt, "EN_COURS");
                  setStatusActionBusy(null);
                  if (ok) onClose();
                }}
              >
                {statusActionBusy === "reopen" ? "Réouverture…" : "Rouvrir"}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </form>
  );

  return (
    <>
      <div className="modal-overlay" onClick={isPureCreateMode ? createCloseGuard.requestClose : onClose}>
      <section
        className={`modal main-log-modal main-courante-entry-modal ronde-entry-modal ${splitLinkedLayout ? "linked-ronde-split-modal" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!useReportModalLayout ? (
          <CreateEntryModalHeader kind="ronde" onCloseRequest={createCloseGuard.requestClose} />
        ) : (
          <header className="mc-modal-head mc-modal-head-compact">
            <h3 className="mc-modal-title">{reportTitleWithDailyCode("Rapport de ronde", entry?.dailyCode)}</h3>
            <div className="row-actions">
              <button
                type="button"
                className="btn-light"
                disabled={(!entry && !isPlannedCreatePreset) || !onOpenLinkedRequest}
                onClick={() => {
                  if (!onOpenLinkedRequest) return;
                  if (entry) {
                    onOpenLinkedRequest({
                      source: entry.source,
                      plannedProfileId: entry.plannedProfileId,
                      requestDate: entry.requestDate,
                      motifTypeId: entry.motifTypeId,
                      horairesDemandeObs: entry.horairesDemandeObs,
                      siteId: entry.siteId,
                      intervenantId: entry.intervenantId,
                      originInterventionId: entry.originInterventionId,
                      originKind: entry.originKind,
                      originDetail: entry.originDetail,
                      planningSnapshot: entry.requestPlanningSnapshot ?? null,
                      anchorRondeId: entry.id
                    });
                    return;
                  }
                  if (isPlannedCreatePreset) {
                    onOpenLinkedRequest({
                      source: "PLANIFIE",
                      plannedProfileId: createPreset?.plannedProfileId ?? null,
                      requestDate,
                      motifTypeId: motifTypeId || null,
                      horairesDemandeObs,
                      siteId: siteId || null,
                      intervenantId: intervenantId || null
                    });
                  }
                }}
              >
                Demande liée
              </button>
              <button
                type="button"
                className="btn-light"
                disabled={!entry?.originInterventionId || !onNavigateToLinkedIntervention}
                onClick={() => {
                  if (!entry?.originInterventionId || !onNavigateToLinkedIntervention) return;
                  onNavigateToLinkedIntervention(entry.originInterventionId);
                  onClose();
                }}
              >
                Intervention liée
              </button>
              <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
                ×
              </button>
            </div>
          </header>
        )}
        {splitLinkedLayout && linkedInterventionEntry ? (
          <div className="linked-ronde-split-layout">
            <InterventionLinkedReadonlyPanel entry={linkedInterventionEntry} onNotify={onNotify} />
            <div className="linked-ronde-form-column">
              <div className="mc-field-section mc-field-section-tight">{formBody}</div>
            </div>
          </div>
        ) : (
          <div className="mc-field-section mc-field-section-tight">{formBody}</div>
        )}
      </section>
    </div>
      <RondeEntryReasonDialogs
        showDiscardConfirm={isPureCreateMode ? createCloseGuard.showDiscardConfirm : false}
        onCancelDiscard={createCloseGuard.cancelDiscard}
        onConfirmDiscard={createCloseGuard.confirmDiscardAndClose}
        showCancelReasonDialog={showCancelReasonDialog}
        cancelIsNonEffectuee={cancelIsNonEffectuee}
        cancelReasonInput={cancelReasonInput}
        onCancelReasonChange={setCancelReasonInput}
        onCloseCancelDialog={() => setShowCancelReasonDialog(false)}
        onConfirmCancellation={() => void submitCancellation()}
      />
    </>
  );
}
