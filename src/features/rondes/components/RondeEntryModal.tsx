/**
 * Modale fiche ronde (saisie, clôture, intervention liée, référentiels en attente).
 *
 * Hydratation / état : useRondeEntryForm. Actions : useRondeEntryModalActions.
 */

import { Link2 } from "lucide-react";
import type { InterventionEntry } from "../../intervention/model/intervention.types";
import type { SiteRef, IntervenantRef, Role } from "../../../types";
import {
  type RondeEntry,
  type RondeMotifTypeRef,
  type RondeOriginKind,
  type RondeSavePayload,
  type RondeSource
} from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { WordExportRowButtons } from "../../common/components/ExportFileButtons";
import type { NotifyToast } from "../../common/model/toast.types";
import { reportTitleWithDailyCode } from "../../common/utils/dailyEntryCode";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import { RondeEntryRequestSection } from "./RondeEntryRequestSection";
import { RondeEntryExecutionSection } from "./RondeEntryExecutionSection";
import { RondeEntryReasonDialogs } from "./RondeEntryReasonDialogs";
import { InterventionLinkedReadonlyPanel } from "./InterventionLinkedReadonlyPanel";
import {
  useRondeEntryForm,
  type RondeEntryCreatePreset,
  type RondeEntryMode
} from "../hooks/useRondeEntryForm";
import { useRondeEntryModalActions } from "../presenter/useRondeEntryModalActions";

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
  /** Ouvre la page Gardiennage sur la fiche liée. */
  onNavigateToLinkedGardiennage?: (gardiennageId: string) => void;
  canOpenLinkedGardiennage?: boolean;
  onOpenLinkedGardiennage?: () => void;
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
  onNavigateToLinkedGardiennage,
  canOpenLinkedGardiennage,
  onOpenLinkedGardiennage,
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
    requesterRole,
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
    arrivalDate,
    setArrivalDate,
    departureDate,
    setDepartureDate,
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
    createCloseGuard,
    requestExtraDefs,
    closureExtraDefs,
    extraValues,
    setExtraValues
  } = form;

  const {
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
  } = useRondeEntryModalActions({
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
  });

  if (!isOpen) return null;

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
      besideMotif={
        requestExtraDefs.length === 1 ? (
          <FormVariableFields
            defs={requestExtraDefs}
            values={extraValues}
            onValuesChange={setExtraValues}
            disabled={!isCreateMode || formLockedClosed}
            compact
          />
        ) : null
      }
    />
  );

  const formBody = (
    <form className="mc-entry-form" onSubmit={onSubmit}>
      {!masquerSectionsDemandePlanifiee ? (
        <>
          {demandeFormSections}
          {requestExtraDefs.length > 1 ? (
            <FormVariableFields
              defs={requestExtraDefs}
              values={extraValues}
              onValuesChange={setExtraValues}
              disabled={!isCreateMode || formLockedClosed}
              title="Champs de la demande"
            />
          ) : null}
        </>
      ) : null}

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
          arrivalDate={arrivalDate}
          departureDate={departureDate}
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
          onArrivalDateChange={setArrivalDate}
          onDepartureDateChange={setDepartureDate}
          onDepartureTimeChange={setDepartureTime}
          onWorkOrderNumberChange={setWorkOrderNumber}
          onReportChange={setReport}
          onIntervenantIdChange={setIntervenantId}
          onClosureCustomValuesChange={setClosureCustomValues}
          requestExtraDefs={masquerSectionsDemandePlanifiee ? requestExtraDefs : []}
          closureExtraDefs={closureExtraDefs}
          extraValues={extraValues}
          onExtraValuesChange={setExtraValues}
          requestExtrasReadOnly={!isCreateMode || formLockedClosed}
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
            <button type="button" className="btn-ghost" onClick={createCloseGuard.requestClose}>
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
            {canOpenLinkedGardiennage && onOpenLinkedGardiennage ? (
              <button type="button" className="btn-light" disabled={lockActions} onClick={onOpenLinkedGardiennage}>
                <span className="mc-footer-btn-with-icon">
                  <Link2 size={16} aria-hidden />
                  Créer un gardiennage
                </span>
              </button>
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
              onClick={() => void closeRonde()}
            >
              {statusActionBusy === "close" ? "Clôture…" : "Clôturer la ronde"}
            </button>
            {entry?.status === "CLOTURE" || entry?.status === "ANNULE" ? (
              <button
                type="button"
                className="mc-btn-primary"
                disabled={lockActions}
                onClick={() => void reopenRonde()}
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
      <div className="modal-overlay" onClick={createCloseGuard.requestClose}>
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
              {entry?.linkedGardiennageId && onNavigateToLinkedGardiennage ? (
                <button
                  type="button"
                  className="btn-light"
                  title="Ouvrir le gardiennage lié"
                  aria-label="Gardiennage lié"
                  onClick={() => {
                    onNavigateToLinkedGardiennage(entry.linkedGardiennageId!);
                    onClose();
                  }}
                >
                  Gardiennage lié
                </button>
              ) : null}
              <button type="button" className="mc-modal-close" onClick={createCloseGuard.requestClose} aria-label="Fermer">
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
        showDiscardConfirm={createCloseGuard.showDiscardConfirm}
        onCancelDiscard={createCloseGuard.cancelDiscard}
        onConfirmDiscard={createCloseGuard.confirmDiscardAndClose}
        discardKind={isCreateMode ? "create" : "edit"}
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
