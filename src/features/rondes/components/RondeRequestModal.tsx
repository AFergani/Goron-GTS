/**
 * Modale de demande de ronde (planifiée, urgence, lot exceptionnel, snapshot planning).
 *
 * Effets de formulaire : `[isOpen, mode]` création ; `[isOpen, mode, entry?.id]` édition.
 */

import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import type { RondeEntry, RondeMotifTypeRef, RondeOriginKind } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import type { RondePlannedProfilePayload, RondePlannedProfileRef } from "../model/rondePlanned.types";
import { isRondeTimeHm } from "../utils/rondeDateTime";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import type { NotifyToast } from "../../common/model/toast.types";
import { mapRequestOriginToApiKind, formatRequestOriginDetail, type RequestOrigin } from "../model/requestOrigin";
import { formatDemandeEmiseContext } from "../utils/formatDemandeEmiseContext";
import { parseDateTimeSafeMs } from "../utils/parseDateTimeSafeMs";
import { prepareRondeRequestLinesForSubmit } from "../utils/prepareRondeRequestLinesForSubmit";
import { buildRondePlanningSnapshotFromDrafts } from "../utils/buildRondePlanningSnapshotFromDrafts";
import { validateRondeRequestLines } from "../utils/validateRondeRequestLines";
import { normalizeRondeHmOr } from "../utils/rondeDateTime";
import { RondeRequestMetaSection } from "./RondeRequestMetaSection";
import { RondeRequestValiditySection } from "./RondeRequestValiditySection";
import { RondeRequestLineEditor } from "./RondeRequestLineEditor";
import { RondeRequestLinesRecap } from "./RondeRequestLinesRecap";
import { RondeRequestEditFooter } from "./RondeRequestEditFooter";
import { RondeLinkedBatchPanel } from "./RondeLinkedBatchPanel";
import { useRondeRequestForm } from "../hooks/useRondeRequestForm";
import { buildRondeProfileLinesFromDrafts } from "../utils/buildRondeProfileLinesFromDrafts";

export type { RequestOrigin } from "../model/requestOrigin";

type RondeRequestModalProps = {
  isOpen: boolean;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  holidays?: HolidayRef[];
  rondeMotifs: RondeMotifTypeRef[];
  requesterRole?: Role;
  /** Profil à éditer — si fourni, la modale s'ouvre en mode édition */
  editProfile?: RondePlannedProfileRef | null;
  /** Actions cycle de vie (édition profil uniquement) — ouvertes via confirmations parent. */
  onStopProfile?: () => void;
  onRequestStopProfile?: () => void;
  onDeleteProfile?: () => void;
  onClose: () => void;
  onNotify?: NotifyToast;
  /** Crée ou met à jour un profil de planification (avec `id` en édition). Retourne le profil enregistré si disponible. */
  onCreateProfile: (
    payload: RondePlannedProfilePayload & { autoValidate?: boolean }
  ) => Promise<RondePlannedProfileRef | void> | RondePlannedProfileRef | void;
  /** Crée une ronde exceptionnelle — optionnel en mode profil seul */
  onCreateEntry?: (payload: {
    siteId: string | null;
    siteDisplay: string;
    requestDate: string;
    motifTypeId: string;
    motifDetail: string;
    horairesDemandeObs: string;
    originKind: "TELESURVEILLANCE" | "CLIENT" | "AUTRE";
    originDetail: string;
    intervenantId: string | null;
    intervenantName: string;
    arrivalTime: string;
    departureTime: string;
    workOrderNumber: string;
    report: string;
    source: "URGENCE" | "LIEE_INTERVENTION";
    originInterventionId?: string | null;
    /** Même valeur pour tout un lot créé depuis la même saisie. */
    requestPlanningSnapshotJson?: string | null;
    requestBatchId?: string | null;
  }) => Promise<boolean>;
  fixedOrigin?: RequestOrigin | null;
  initialRequestDate?: string | null;
  initialMotifTypeId?: string | null;
  initialConsigne?: string | null;
  initialSiteId?: string | null;
  initialSiteDisplay?: string | null;
  initialIntervenantId?: string | null;
  initialIntervenantName?: string | null;
  initialInterventionId?: string | null;
  /** Réhydrate validité/lignes (Demande liée sur ronde exceptionnelle). */
  replayPlanningSnapshot?: RondePlanningSnapshotV1 | null;
  linkedBatchEntries?: RondeEntry[] | null;
  onSaveLinkedBatch?: (payload: {
    entryIds: string[];
    siteId: string | null;
    siteDisplay: string;
    motifTypeId: string;
    motifDetail: string;
    originKind: RondeOriginKind;
    originDetail: string;
    intervenantId: string | null;
    intervenantName: string;
    requestPlanningSnapshotJson?: string | null;
  }) => Promise<boolean>;
  cancelLinkedBatchOne?: (
    entry: RondeEntry,
    reason: string,
    kind: "NON_EFFECTUEE" | "ANNULATION"
  ) => Promise<boolean>;
  bulkCancelLinkedBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; cancelledCount: number; skippedCount: number } | null>;
  bulkDeleteLinkedBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{
    ok: boolean;
    deletedCount: number;
    skippedCount?: number;
    nonEffectueeCount?: number;
    suppressedCount?: number;
  } | null>;
  requestLinkedBatchDelete?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; requestBatchId: string } | null>;
  onOpenLinkedBatchRonde?: (entry: RondeEntry) => void;
  /**
   * Retour contextuel depuis la demande liée
   * (rapport d'ancrage, file de suppression, etc.).
   */
  navigateBack?: {
    label: string;
    title?: string;
    onNavigate: () => void;
  } | null;
  onCreatePendingSite?: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant?: (name: string) => Promise<boolean>;
};

export function RondeRequestModal(props: RondeRequestModalProps) {
  const form = useRondeRequestForm(props);
  const {
    requestDate,
    setRequestDate,
    requestTime,
    setRequestTime,
    siteId,
    setSiteId,
    intervenantId,
    setIntervenantId,
    motifTypeId,
    setMotifTypeId,
    origin,
    setOrigin,
    clientName,
    setClientName,
    consigne,
    setConsigne,
    motifDetail,
    setMotifDetail,
    validFrom,
    setValidFrom,
    validFromTime,
    setValidFromTime,
    validTo,
    setValidTo,
    validToTime,
    setValidToTime,
    isSingleDay,
    setIsSingleDay,
    lines,
    setLines,
    showPendingSiteForm,
    setShowPendingSiteForm,
    showPendingIntervenantForm,
    setShowPendingIntervenantForm,
    pendingCode,
    setPendingCode,
    pendingName,
    setPendingName,
    pendingIntervenantName,
    setPendingIntervenantName,
    error,
    setError,
    submitting,
    setSubmitting,
    isEdit,
    isManager,
    isProgrammingReadOnly,
    isLinkedExistingBatch,
    selectedSite,
    selectedIntervenant,
    selectedMotifMeta,
    isContract,
    isOriginFixed,
    originLabel,
    canCreatePendingRefs,
    updateLine,
    addLine,
    exceptionalPreview,
    lockWeekdaysFromValidityRange
  } = form;

  if (!props.isOpen) return null;

  const onSubmit = async () => {
    if (isProgrammingReadOnly) return;
    setError("");
    const effectiveValidTo = isSingleDay ? validFrom.trim() : validTo.trim();
    const linesForSubmit = prepareRondeRequestLinesForSubmit(lines, {
      isSingleDay,
      validFrom,
      effectiveValidTo
    });
    let pendingSiteDisplay: string | null = null;
    let pendingIntervenantDisplay: string | null = null;
    const isExceptionalCreate = !isContract && !isEdit && !isLinkedExistingBatch && Boolean(props.onCreateEntry);
    if (isExceptionalCreate && canCreatePendingRefs && props.onCreatePendingSite && props.onCreatePendingIntervenant) {
      const pendingResult = await createPendingRefsIfNeededForSubmit({
        selectedFromCatalogSite: Boolean(selectedSite),
        selectedFromCatalogIntervenant: Boolean(selectedIntervenant),
        pendingCode,
        pendingName,
        pendingIntervenantInput: pendingIntervenantName,
        onCreatePendingSite: props.onCreatePendingSite,
        onCreatePendingIntervenant: props.onCreatePendingIntervenant
      });
      if (!pendingResult.ok) {
        if (pendingResult.errorMessage) setError(pendingResult.errorMessage);
        return;
      }
      pendingSiteDisplay = pendingResult.createdSiteDisplay;
      pendingIntervenantDisplay = pendingResult.createdIntervenantName;
    }
    if (!selectedSite && !pendingSiteDisplay) return setError("Sélectionnez un site.");
    if (!selectedIntervenant && !pendingIntervenantDisplay) return setError("Sélectionnez un intervenant.");
    if (!motifTypeId.trim()) return setError("Sélectionnez un motif.");
    if (isLinkedExistingBatch && !isContract && selectedMotifMeta?.requiresFreeText && !motifDetail.trim()) {
      return setError("Complétez le détail du motif.");
    }
    if (!requestDate.trim()) return setError("La date de la demande est obligatoire.");
    if (origin === "APPEL_CLIENT" && !clientName.trim()) {
      return setError("Le nom du client est obligatoire lorsque l'origine est « Client ».");
    }
    const requestTimeNorm = requestTime.trim() || "00:00";
    if (!isRondeTimeHm(requestTimeNorm)) return setError("Indiquez une heure de demande valide (HH:mm).");
    if (!validFrom.trim()) return setError("La date de début de validité est obligatoire.");
    const validFromTimeNorm = normalizeRondeHmOr(validFromTime, "00:00");
    const validToTimeNorm = normalizeRondeHmOr(validToTime, "23:59");
    const validStartMs = parseDateTimeSafeMs(validFrom.trim(), validFromTimeNorm);
    const validEndMs = parseDateTimeSafeMs(effectiveValidTo || validFrom.trim(), validToTimeNorm);
    if (validStartMs == null || validEndMs == null || validEndMs < validStartMs) {
      return setError("La période de validité est invalide (date/heure de fin < date/heure de début).");
    }
    const linesError = validateRondeRequestLines(linesForSubmit, {
      requireValidityEndForIntervalWithoutWindow: !isContract && !isEdit,
      effectiveValidTo
    });
    if (linesError) return setError(linesError);

    setSubmitting(true);
    try {
      const fromIntervention = origin === "SUITE_INTERVENTION" && Boolean(props.initialInterventionId);
      const originDetail = formatRequestOriginDetail(origin, { consigne, clientName });
      const needsPlanningSnapshot =
        (isLinkedExistingBatch && Boolean(props.onSaveLinkedBatch) && Boolean(props.linkedBatchEntries?.length) && !isEdit) ||
        (!isContract && !isEdit && !isLinkedExistingBatch && Boolean(props.onCreateEntry));
      const planningSnapshotPayload = needsPlanningSnapshot
        ? buildRondePlanningSnapshotFromDrafts({
            requestDate,
            requestTime: requestTimeNorm,
            validFrom,
            validFromTime: validFromTimeNorm,
            validTo: effectiveValidTo,
            validToTime: validToTimeNorm,
            isSingleDay,
            origin,
            motifTypeId,
            consigne,
            siteId: selectedSite?.id ?? null,
            intervenantId: selectedIntervenant?.id ?? "",
            lines: linesForSubmit,
            originInterventionId: fromIntervention ? props.initialInterventionId ?? null : null
          })
        : null;

      /* Mise à jour d'un lot exceptionnel existant (même modale + fiches en dessous) */
      if (isLinkedExistingBatch && props.onSaveLinkedBatch && props.linkedBatchEntries?.length && !isEdit) {
        const mappedOriginKind = mapRequestOriginToApiKind(origin);
        const ok = await props.onSaveLinkedBatch({
          entryIds: props.linkedBatchEntries.map((e) => e.id),
          siteId: selectedSite?.id ?? null,
          siteDisplay: selectedSite ? formatSiteSelectedLabel(selectedSite) : pendingSiteDisplay || "",
          motifTypeId: motifTypeId.trim(),
          motifDetail: motifDetail.trim(),
          originKind: mappedOriginKind,
          originDetail,
          intervenantId: selectedIntervenant?.id ?? null,
          intervenantName: selectedIntervenant?.name || pendingIntervenantDisplay || "",
          requestPlanningSnapshotJson: JSON.stringify(planningSnapshotPayload)
        });
        if (ok) props.onNotify?.("Demande mise à jour sur toutes les fiches du lot.");
        if (ok) props.onClose();
        return;
      }

      /* Ronde exceptionnelle (non-contrat, hors mode édition) */
      if (!isContract && !isEdit && !isLinkedExistingBatch && props.onCreateEntry) {
        const mappedOrigin = mapRequestOriginToApiKind(origin);
        const payloads = exceptionalPreview.items.map((item) => ({ requestDate: item.requestDate, requestedTime: item.requestedTime }));

        if (!payloads.length) {
          return setError("Aucune ronde n'a été générée avec les paramètres saisis.");
        }

        const requestPlanningSnapshotJson = JSON.stringify(planningSnapshotPayload);
        const requestBatchId =
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rbatch-${Date.now()}`;

        let allOk = true;
        const demandeCtx = formatDemandeEmiseContext(requestDate.trim(), requestTimeNorm);
        for (const planned of payloads) {
          const scheduleDetails = [
            demandeCtx,
            planned.requestedTime ? `Heure demandée: ${planned.requestedTime}` : "",
            consigne.trim()
          ]
            .filter(Boolean)
            .join(" — ");
          const ok = await props.onCreateEntry({
            source: fromIntervention ? "LIEE_INTERVENTION" : "URGENCE",
            originInterventionId: fromIntervention ? props.initialInterventionId ?? null : null,
            siteId: selectedSite?.id ?? null,
            siteDisplay: selectedSite ? formatSiteSelectedLabel(selectedSite) : pendingSiteDisplay || "",
            requestDate: planned.requestDate,
            motifTypeId,
            motifDetail: motifDetail.trim(),
            horairesDemandeObs: scheduleDetails,
            originKind: mappedOrigin,
            originDetail,
            intervenantId: selectedIntervenant?.id ?? "",
            intervenantName: selectedIntervenant?.name || pendingIntervenantDisplay || "",
            arrivalTime: "",
            departureTime: "",
            workOrderNumber: "",
            report: "",
            requestPlanningSnapshotJson,
            requestBatchId
          });
          if (!ok) {
            allOk = false;
            break;
          }
        }
        if (allOk) props.onClose();
        return;
      }

      /* Création ou édition d'un profil de planification */
      const profileLines = buildRondeProfileLinesFromDrafts(linesForSubmit, motifTypeId);
      await Promise.resolve(
        props.onCreateProfile({
          /* Identifiant inclus en édition */
          ...(isEdit && props.editProfile ? { id: props.editProfile.id } : {}),
          label: selectedSite ? formatSiteSelectedLabel(selectedSite) : pendingSiteDisplay || "",
          siteId: selectedSite?.id ?? null,
          intervenantId: selectedIntervenant?.id ?? "",
          notes: consigne.trim(),
          planningValidFrom: validFrom,
          planningValidTo: effectiveValidTo,
          createRoundsEnabled: true,
          closureFormEnabled: false,
          closureFields: [],
          lines: profileLines,
          /* Auto-validation à la création pour les responsables/dev */
          ...(!isEdit && isManager ? { autoValidate: true } : {})
        })
      );
      if (!isEdit) {
        props.onNotify?.("Profil de programmation enregistré.");
        props.onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <section className="modal fransor-help-modal ronde-planned-rule-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mc-modal-head mc-modal-head-compact">
          <h3 className="mc-modal-title">
            {isLinkedExistingBatch
              ? "Modifier la demande (lot)"
              : isProgrammingReadOnly
                ? "Consulter la programmation"
                : isEdit
                  ? "Modifier la programmation"
                  : "Planifier une ronde"}
          </h3>
          <div className="row-actions">
            {props.navigateBack ? (
              <button
                type="button"
                className="btn-light"
                title={props.navigateBack.title || props.navigateBack.label}
                aria-label={props.navigateBack.label}
                onClick={props.navigateBack.onNavigate}
              >
                {props.navigateBack.label}
              </button>
            ) : null}
            <button type="button" className="mc-modal-close" onClick={props.onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </header>
        <div className="form">
          {isProgrammingReadOnly ? (
            <p className="muted" style={{ marginTop: 0 }}>
              {props.editProfile?.cancellationRequestedAt
                ? "Demande d’arrêt déjà envoyée. La programmation n’est pas modifiable."
                : "Consultation seule : vous pouvez demander l’arrêt, sans modifier la programmation."}
            </p>
          ) : null}
          <RondeRequestMetaSection
            requestDate={requestDate}
            requestTime={requestTime}
            motifTypeId={motifTypeId}
            origin={origin}
            originLabel={originLabel}
            isOriginFixed={isOriginFixed}
            isEdit={isEdit}
            isLinkedExistingBatch={isLinkedExistingBatch}
            isContract={isContract}
            readOnly={isProgrammingReadOnly}
            canCreatePendingRefs={canCreatePendingRefs}
            sites={props.sites}
            intervenants={props.intervenants}
            rondeMotifs={props.rondeMotifs}
            selectedSite={selectedSite}
            selectedIntervenant={selectedIntervenant}
            showPendingSiteForm={showPendingSiteForm}
            showPendingIntervenantForm={showPendingIntervenantForm}
            pendingCode={pendingCode}
            pendingName={pendingName}
            pendingIntervenantName={pendingIntervenantName}
            clientName={clientName}
            consigne={consigne}
            motifDetail={motifDetail}
            onNotify={props.onNotify}
            onRequestDateChange={setRequestDate}
            onRequestTimeChange={setRequestTime}
            onMotifTypeIdChange={setMotifTypeId}
            onOriginChange={setOrigin}
            onClientNameChange={setClientName}
            onConsigneChange={setConsigne}
            onMotifDetailChange={setMotifDetail}
            onSiteIdChange={setSiteId}
            onIntervenantIdChange={setIntervenantId}
            onTogglePendingSite={() => setShowPendingSiteForm((c) => !c)}
            onTogglePendingIntervenant={() => setShowPendingIntervenantForm((c) => !c)}
            onPendingCodeChange={setPendingCode}
            onPendingNameChange={setPendingName}
            onPendingIntervenantNameChange={setPendingIntervenantName}
            onClearPendingSite={() => {
              setShowPendingSiteForm(false);
              setPendingCode("");
              setPendingName("");
            }}
            onClearPendingIntervenant={() => {
              setShowPendingIntervenantForm(false);
              setPendingIntervenantName("");
            }}
          />
          <RondeRequestValiditySection
            validFrom={validFrom}
            validFromTime={validFromTime}
            validTo={validTo}
            validToTime={validToTime}
            isSingleDay={isSingleDay}
            readOnly={isProgrammingReadOnly}
            onValidFromChange={setValidFrom}
            onValidFromTimeChange={setValidFromTime}
            onValidToChange={setValidTo}
            onValidToTimeChange={setValidToTime}
          />
          <RondeRequestLineEditor
            lines={lines}
            isSingleDay={isSingleDay}
            lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
            readOnly={isProgrammingReadOnly}
            onAddLine={addLine}
            onRemoveLine={(index) => setLines((prev) => prev.filter((_, i) => i !== index))}
            onUpdateLine={updateLine}
            onSingleDayChange={setIsSingleDay}
          />
          {!isLinkedExistingBatch ? (
            <RondeRequestLinesRecap
              lines={lines}
              isEdit={isEdit}
              isContract={isContract}
              isSingleDay={isSingleDay}
              lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
              validFrom={validFrom}
              validFromTime={validFromTime}
              validTo={validTo}
              validToTime={validToTime}
              exceptionalPerLine={exceptionalPreview.perLine}
              exceptionalTotal={exceptionalPreview.items.length}
            />
          ) : null}
          {isLinkedExistingBatch &&
          props.requesterRole &&
          props.onOpenLinkedBatchRonde &&
          props.cancelLinkedBatchOne &&
          props.linkedBatchEntries?.length ? (
            <RondeLinkedBatchPanel
              entries={props.linkedBatchEntries}
              requesterRole={props.requesterRole}
              onOpenRonde={props.onOpenLinkedBatchRonde}
              onNotify={props.onNotify}
              onCancelOne={props.cancelLinkedBatchOne}
              bulkCancelBatch={isManager ? props.bulkCancelLinkedBatch : undefined}
              bulkDeleteBatch={isManager ? props.bulkDeleteLinkedBatch : undefined}
              requestBatchDelete={!isManager ? props.requestLinkedBatchDelete : undefined}
              onBatchDestructiveDone={props.onClose}
            />
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
        <RondeRequestEditFooter
          submitting={submitting}
          isEdit={isEdit}
          isLinkedExistingBatch={isLinkedExistingBatch}
          hideSubmit={isProgrammingReadOnly}
          onClose={props.onClose}
          onSubmit={() => void onSubmit()}
          onStopProfile={props.onStopProfile}
          onRequestStopProfile={props.onRequestStopProfile}
          onDeleteProfile={props.onDeleteProfile}
        />
      </section>
    </div>
  );
}
