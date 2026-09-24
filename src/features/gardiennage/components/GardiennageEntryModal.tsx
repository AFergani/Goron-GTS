/**
 * Modale création / édition gardiennage (planification versionnée, prévisualisation créneaux).
 *
 * Modes ponctuel, récurrent (lignes type ronde), H24. Site / prestataire, liens intervention
 * et ronde, annulation avec motif, garde fermeture en création (`useCreateModalCloseGuard`).
 * Lignes récurrentes : ajout en tête, numérotation chronologique, scroll/highlight, veilles JF,
 * verrou jours sur plage ≤ 7 j, pending refs via `createPendingRefsIfNeededForSubmit`.
 * Hydratation formulaire : `[isOpen, mode, entry?.id]` — pas de reset sur refresh listes.
 * Planification extraite dans `GardiennagePlanningSection`.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import {
  isGardiennageAutoClosureReport,
  type GardiennageEntry,
  type GardiennageSavePayload,
  type GardiennageStatus
} from "../model/gardiennage.types";
import {
  inferPlanningModeFromSnapshot,
  isPlanningFormValid,
  isValidPlanningTime,
  resolvePlanningFormMode,
  resolvePonctuelValidToDate
} from "../model/gardiennagePlanningForm";
import {
  GARDIENNAGE_WEEKDAYS_ALL_MASK,
  isIsoDate as isPlanningIsoDate
} from "../model/gardiennagePlanningCalendar";
import { normalizeGardiennagePlanningLinesNewestFirst } from "../utils/gardiennagePlanningLineOrder";
import { resolveGardiennageValidityWeekdayLock } from "../utils/resolveGardiennageValidityWeekdayLock";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { SearchEntry } from "../../common/components/SearchEntry";
import { PendingIntervenantInlineField, PendingSiteInlineFields } from "../../common/components/PendingRefInlineFields";
import { getLocalDateIso, getLocalTimeHm } from "../../common/utils/localDateIso";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import { useFormVariableFields } from "../../common/hooks/useFormVariableFields";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { RequestDateTimeField } from "../../common/components/RequestDateTimeField";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import {
  createDefaultGardiennagePlanningLine,
  dateTimeFromIsoOrNow,
  EMPTY_GARDIENNAGE_ENTRY_FORM,
  withRequestDateTime,
  type GardiennageEntryFormState
} from "../model/gardiennageEntryForm";
import { GardiennagePlanningSection } from "./GardiennagePlanningSection";
import type { NotifyToast } from "../../common/model/toast.types";
import { reportTitleWithDailyCode } from "../../common/utils/dailyEntryCode";
import { useGardiennagePlanningPreview } from "../presenter/useGardiennagePlanningPreview";

export type GardiennageModalMode = "create" | "edit";

/** Données pré-remplies lors d'une création depuis un contexte extérieur (ex. intervention liée). */
export type GardiennageCreatePreset = {
  siteId: string | null;
  siteDisplay: string;
  intervenantId: string | null;
  intervenantName: string;
  linkedInterventionId: string | null;
  linkedRondeId?: string | null;
};

type GardiennageEntryModalProps = {
  isOpen: boolean;
  mode: GardiennageModalMode;
  entry: GardiennageEntry | null;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  holidays?: HolidayRef[];
  requesterRole: Role;
  /** Fiches du même lot (coches de clôture dans l'aperçu). */
  batchEntries?: GardiennageEntry[];
  createPreset?: GardiennageCreatePreset | null;
  onClose: () => void;
  onCreate: (payload: GardiennageSavePayload) => Promise<boolean>;
  onUpdate: (id: string, expectedUpdatedAt: string, payload: GardiennageSavePayload) => Promise<GardiennageEntry | null>;
  onSetStatus?: (id: string, expectedUpdatedAt: string, status: GardiennageStatus, cancellationReason?: string) => Promise<boolean>;
  onReopenEntry?: (id: string, expectedUpdatedAt: string) => Promise<boolean>;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
  onCreatePendingSite?: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant?: (name: string) => Promise<boolean>;
  onNotify?: NotifyToast;
};

export function GardiennageEntryModal({
  isOpen,
  mode,
  entry,
  sites,
  intervenants,
  holidays = [],
  requesterRole,
  batchEntries = [],
  createPreset,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
  onReopenEntry,
  onNavigateToLinkedIntervention,
  onNavigateToLinkedRonde,
  onCreatePendingSite,
  onCreatePendingIntervenant,
  onNotify
}: GardiennageEntryModalProps) {
  const [form, setForm] = useState<GardiennageEntryFormState>(EMPTY_GARDIENNAGE_ENTRY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [initialForm, setInitialForm] = useState<GardiennageEntryFormState>(EMPTY_GARDIENNAGE_ENTRY_FORM);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const [showPendingIntervenantForm, setShowPendingIntervenantForm] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingIntervenantName, setPendingIntervenantName] = useState("");
  const newestLineRef = useRef<HTMLFieldSetElement | null>(null);
  const prevNewestLineIdRef = useRef<string | null>(null);
  const [highlightNewestLineId, setHighlightNewestLineId] = useState<string | null>(null);

  const isCreateMode = mode === "create";
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } =
    useCreateModalCloseGuard({ enabled: isOpen, isDirty, onClose });

  /* Initialisation à l'ouverture en mode création */
  useEffect(() => {
    if (!isOpen || !isCreateMode) return;
    const init: GardiennageEntryFormState = {
      ...EMPTY_GARDIENNAGE_ENTRY_FORM,
      recurrenceStartDate: getLocalDateIso(),
      validFromDate: getLocalDateIso(),
      validToDate: "",
      planningLines: [createDefaultGardiennagePlanningLine()],
      requestDate: getLocalDateIso(),
      requestTime: getLocalTimeHm(),
      ...(createPreset ? {
        siteId: createPreset.siteId,
        siteDisplay: createPreset.siteDisplay,
        intervenantId: createPreset.intervenantId,
        intervenantName: createPreset.intervenantName,
        linkedInterventionId: createPreset.linkedInterventionId,
        linkedRondeId: createPreset.linkedRondeId ?? null
      } : {})
    };
    setForm(init);
    setInitialForm(init);
    setCancelReason("");
    const hasPendingSite = createPreset && !createPreset.siteId && Boolean(createPreset.siteDisplay);
    const hasPendingIntervenant = createPreset && !createPreset.intervenantId && Boolean(createPreset.intervenantName);
    if (hasPendingSite) {
      const codeMatch = (createPreset.siteDisplay ?? "").match(/\(([^()]+)\)/);
      setPendingCode(codeMatch?.[1]?.trim() ?? "");
      setPendingName((createPreset.siteDisplay ?? "").replace(/\s*\([^()]+\)\s*$/, "").trim());
      setShowPendingSiteForm(true);
    } else {
      setShowPendingSiteForm(false);
      setPendingCode("");
      setPendingName("");
    }
    if (hasPendingIntervenant) {
      setPendingIntervenantName(createPreset.intervenantName ?? "");
      setShowPendingIntervenantForm(true);
    } else {
      setShowPendingIntervenantForm(false);
      setPendingIntervenantName("");
    }
  }, [isOpen, isCreateMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Hydratation depuis l'entrée existante en mode édition */
  useEffect(() => {
    if (!isOpen || isCreateMode || !entry) return;
    const snap = entry.planningSnapshot;
    const planningModeFromSnap = snap ? inferPlanningModeFromSnapshot(snap) : resolvePlanningFormMode(Boolean(entry.isPonctuel), false);
    const isContinuous = planningModeFromSnap === "h24";
    const isPonctuel = planningModeFromSnap === "ponctuel";
    const firstLine = snap?.lines?.[0];
    const h24OpenEnded = Boolean(snap?.isOpenEnded);
    const created = dateTimeFromIsoOrNow(entry.createdAt);
    const hydrated: GardiennageEntryFormState = {
      siteId: entry.siteId,
      siteDisplay: entry.siteDisplay,
      startTime: entry.startTime,
      endTime: entry.endTime,
      recurrenceStartDate: entry.recurrenceStartDate,
      recurrenceEndDate: entry.recurrenceEndDate,
      isPonctuel,
      intervenantId: entry.intervenantId,
      intervenantName: entry.intervenantName,
      notes: entry.notes,
      linkedInterventionId: entry.linkedInterventionId,
      linkedRondeId: entry.linkedRondeId,
      validFromDate: snap?.validFromDate || entry.recurrenceStartDate,
      validFromTime: isPonctuel
        ? (firstLine?.startTime || entry.startTime || "")
        : (snap?.validFromTime || entry.startTime || ""),
      validToDate: h24OpenEnded ? "" : (snap?.userValidToDate || snap?.validToDate || entry.recurrenceEndDate || entry.recurrenceStartDate),
      validToTime: isPonctuel
        ? (firstLine?.endTime || entry.endTime || "")
        : (h24OpenEnded ? "" : (snap?.validToTime || entry.endTime || "")),
      isContinuous,
      requestDate: String(snap?.requestDate || "").trim() || created.date,
      requestTime: String(snap?.requestTime || "").trim() || created.time,
      clientName: String(snap?.clientName || "").trim(),
      planningLines: isContinuous || isPonctuel
        ? []
        : (snap?.lines?.length
          ? normalizeGardiennagePlanningLinesNewestFirst(snap.lines)
          : [{
            id: "legacy-line",
            label: "Ligne 1",
            anchorDate: "",
            startTime: entry.startTime || "",
            endTime: entry.endTime || "",
            weekdaysMask: GARDIENNAGE_WEEKDAYS_ALL_MASK,
            includeHolidays: false,
            includeHolidayEves: false
          }])
    };
    setForm(hydrated);
    setInitialForm(hydrated);
    setCancelReason("");
    setShowPendingSiteForm(false);
    setShowPendingIntervenantForm(false);
    setPendingCode("");
    setPendingName("");
    setPendingIntervenantName("");
  }, [isOpen, mode, entry?.id]);

  const selectedSite = form.siteId ? (sites.find((s) => s.id === form.siteId) ?? null) : null;
  const extras = useFormVariableFields({
    isOpen,
    requesterRole,
    formTarget: "GARDIENNAGE",
    site: selectedSite,
    seedValues: isCreateMode ? {} : entry?.exportExtraValues,
    seedKey: isCreateMode ? "create" : entry?.id
  });
  const selectedIntervenant =
    form.intervenantId ? (intervenants.find((i) => i.id === form.intervenantId) ?? null) : null;

  const planningMode = resolvePlanningFormMode(form.isPonctuel, form.isContinuous);

  const validityRangeWeekdayLock = useMemo(() => {
    if (planningMode !== "recurring") return null;
    return resolveGardiennageValidityWeekdayLock({
      validFrom: form.validFromDate,
      validTo: form.validToDate
    });
  }, [planningMode, form.validFromDate, form.validToDate]);
  const lockWeekdaysFromValidityRange = validityRangeWeekdayLock != null;

  useEffect(() => {
    if (validityRangeWeekdayLock == null) return;
    setForm((prev) => {
      let changed = false;
      const nextLines = prev.planningLines.map((line) => {
        if (isPlanningIsoDate(line.anchorDate)) return line;
        let draft = line;
        if (draft.weekdaysMask !== validityRangeWeekdayLock) {
          draft = { ...draft, weekdaysMask: validityRangeWeekdayLock };
          changed = true;
        }
        if (draft.includeHolidays || draft.includeHolidayEves) {
          draft = { ...draft, includeHolidays: false, includeHolidayEves: false };
          changed = true;
        }
        return draft;
      });
      return changed ? { ...prev, planningLines: nextLines } : prev;
    });
  }, [validityRangeWeekdayLock]);

  useEffect(() => {
    if (!isOpen || planningMode !== "recurring") {
      prevNewestLineIdRef.current = null;
      setHighlightNewestLineId(null);
      return;
    }
    const newestId = form.planningLines[0]?.id ?? null;
    if (!newestId || newestId === prevNewestLineIdRef.current) {
      prevNewestLineIdRef.current = newestId;
      return;
    }
    const isAddition = prevNewestLineIdRef.current != null && form.planningLines.length > 1;
    prevNewestLineIdRef.current = newestId;
    if (!isAddition) return;
    setHighlightNewestLineId(newestId);
    newestLineRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = window.setTimeout(() => setHighlightNewestLineId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [isOpen, planningMode, form.planningLines]);

  const {
    planningSnapshot,
    previewSlots,
    previewTotalMinutes,
    previewPerLineCounts,
    previewClosedSlotsCount,
    linesOverlapError
  } = useGardiennagePlanningPreview({
    form,
    planningMode,
    holidays,
    batchEntries
  });

  if (!isOpen) return null;

  const isAnnule = entry?.status === "ANNULE";
  const isCloture = entry?.status === "CLOTURE";
  /** Restriction rôle uniquement hors création (la création reste ouverte à tous). */
  const isOperatorMode = requesterRole === "OPERATEUR";
  const isReadOnlyByRole = !isCreateMode && isOperatorMode;
  /** Fiche clôturée ou annulée : consultation, jusqu’à une réouverture. */
  const isConsultation = isCloture || isAnnule;
  const fieldsLocked = isSaving || isConsultation || isReadOnlyByRole;
  const canCreatePendingRefs = isCreateMode;

  const canReopen = !isCreateMode && (isCloture || isAnnule) && Boolean(onReopenEntry) && Boolean(entry) && !isReadOnlyByRole;
  const canCancel = !isCreateMode && !isAnnule && !isCloture && Boolean(onSetStatus);

  const isSubmitDisabled =
    isSaving ||
    (!form.siteId && !(canCreatePendingRefs && (pendingCode.trim() || pendingName.trim()))) ||
    (!form.intervenantId && !(canCreatePendingRefs && pendingIntervenantName.trim())) ||
    !isPlanningFormValid({
      validFromDate: form.validFromDate,
      validFromTime: form.validFromTime,
      validToDate: form.validToDate,
      validToTime: form.validToTime,
      isPonctuel: form.isPonctuel,
      isContinuous: form.isContinuous,
      planningLines: form.planningLines
    }) ||
    Boolean(linesOverlapError);

  const ponctuelCrossesMidnight = planningMode === "ponctuel"
    && Boolean(form.validFromDate)
    && isValidPlanningTime(form.validFromTime)
    && isValidPlanningTime(form.validToTime)
    && resolvePonctuelValidToDate(form.validFromDate, form.validFromTime, form.validToTime) !== form.validFromDate;

  const buildPayload = (overrides?: {
    siteId?: string | null;
    siteDisplay?: string;
    intervenantId?: string | null;
    intervenantName?: string;
  }): GardiennageSavePayload => {
    const firstSlot = previewSlots[0];
    const lastSlot = previewSlots[previewSlots.length - 1];
    return ({
    siteId: overrides?.siteId ?? form.siteId,
    siteDisplay: overrides?.siteDisplay ?? form.siteDisplay,
    startTime: firstSlot?.startTime || form.validFromTime,
    endTime: firstSlot?.endTime || form.validToTime,
    crossesMidnight: Boolean(firstSlot?.crossesMidnight),
    recurrenceStartDate: firstSlot?.startDate || form.validFromDate,
    recurrenceEndDate: form.isPonctuel
      ? (firstSlot?.startDate || form.validFromDate)
      : (lastSlot?.endDate || form.validToDate),
    isPonctuel: form.isPonctuel,
    intervenantId: overrides?.intervenantId ?? form.intervenantId,
    intervenantName: overrides?.intervenantName ?? form.intervenantName,
    notes: form.notes,
    linkedInterventionId: form.linkedInterventionId,
    linkedRondeId: form.linkedRondeId,
    planningSnapshot,
    exportExtraValues: extras.values
  });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled || isConsultation) return;
    setIsSaving(true);
    try {
      let ok = false;
      if (isCreateMode) {
        let pendingSiteDisplay: string | null = null;
        let pendingIntervenantDisplay: string | null = null;
        if (canCreatePendingRefs && onCreatePendingSite && onCreatePendingIntervenant) {
          const pendingResult = await createPendingRefsIfNeededForSubmit({
            selectedFromCatalogSite: Boolean(selectedSite),
            selectedFromCatalogIntervenant: Boolean(selectedIntervenant),
            pendingCode,
            pendingName,
            pendingIntervenantInput: pendingIntervenantName,
            onCreatePendingSite,
            onCreatePendingIntervenant
          });
          if (!pendingResult.ok) {
            if (pendingResult.errorMessage) {
              onNotify?.(pendingResult.errorMessage, "warning");
            }
            return;
          }
          pendingSiteDisplay = pendingResult.createdSiteDisplay;
          pendingIntervenantDisplay = pendingResult.createdIntervenantName;
        } else if (!selectedSite && (pendingCode.trim() || pendingName.trim())) {
          if (!pendingCode.trim() || !pendingName.trim()) {
            onNotify?.("Pour \"Site introuvable\", renseignez le code et le nom.", "warning");
            return;
          }
          pendingSiteDisplay = `${pendingName.trim()} (${pendingCode.trim()})`;
        }
        const finalSiteId = selectedSite?.id ?? null;
        const finalSiteDisplay = selectedSite
          ? `${selectedSite.name} (${selectedSite.code})`
          : pendingSiteDisplay || "";
        const finalIntervenantId = selectedIntervenant?.id ?? null;
        const finalIntervenantName = selectedIntervenant?.name
          || pendingIntervenantDisplay
          || pendingIntervenantName.trim();
        if (!finalSiteId && !finalSiteDisplay) {
          onNotify?.("Sélectionnez un site ou utilisez le bloc \"Site introuvable\".", "warning");
          return;
        }
        if (!finalIntervenantId && !finalIntervenantName) {
          onNotify?.("Sélectionnez un intervenant ou utilisez le bloc \"Intervenant introuvable\".", "warning");
          return;
        }
        ok = await onCreate(buildPayload({
          siteId: finalSiteId,
          siteDisplay: finalSiteDisplay,
          intervenantId: finalIntervenantId,
          intervenantName: finalIntervenantName
        }));
      } else if (entry) {
        const updated = await onUpdate(entry.id, entry.updatedAt, buildPayload());
        ok = updated !== null;
      }
      if (ok) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelGardiennage = async () => {
    if (!entry || !onSetStatus || !cancelReason.trim()) return;
    setIsSaving(true);
    try {
      const ok = await onSetStatus(entry.id, entry.updatedAt, "ANNULE", cancelReason.trim());
      if (ok) onClose();
    } finally {
      setIsSaving(false);
      setShowCancelConfirm(false);
      setCancelReason("");
    }
  };

  const handleReopenGardiennage = async () => {
    if (!entry || !onReopenEntry) return;
    setIsSaving(true);
    try {
      const ok = await onReopenEntry(entry.id, entry.updatedAt);
      if (ok) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const canNavigateIntervention = Boolean(form.linkedInterventionId) && Boolean(onNavigateToLinkedIntervention);
  const canNavigateRonde = Boolean(form.linkedRondeId) && Boolean(onNavigateToLinkedRonde);

  const headerTitle = isCreateMode
    ? "Nouveau Gardiennage"
    : reportTitleWithDailyCode(
        isCloture ? "Gardiennage clôturé" : isAnnule ? "Gardiennage annulé" : "Édition Gardiennage",
        entry?.dailyCode
      );

  return (
    <>
      <div className="modal-overlay" onClick={requestClose}>
        <section className="modal main-log-modal main-courante-entry-modal" onClick={(e) => e.stopPropagation()}>

          {/* HEADER */}
          <header className="mc-modal-head mc-modal-head-compact">
            <h3 className="mc-modal-title">{headerTitle}</h3>
            <div className="row-actions">
              {canNavigateRonde && (
                <button
                  type="button"
                  className="btn-light"
                  title="Ouvrir la ronde liée"
                  aria-label="Ronde liée"
                  onClick={() => {
                    if (!form.linkedRondeId || !onNavigateToLinkedRonde) return;
                    onNavigateToLinkedRonde(form.linkedRondeId);
                    onClose();
                  }}
                >
                  Ronde liée
                </button>
              )}
              <button
                type="button"
                className="btn-light"
                disabled={!canNavigateIntervention}
                title={canNavigateIntervention ? "Ouvrir l'intervention liée" : "Aucune intervention liée"}
                aria-label="Intervention liée"
                onClick={() => {
                  if (!form.linkedInterventionId || !onNavigateToLinkedIntervention) return;
                  onNavigateToLinkedIntervention(form.linkedInterventionId);
                  onClose();
                }}
              >
                Intervention liée
              </button>
              <button type="button" className="mc-modal-close" onClick={requestClose} aria-label="Fermer">
                ×
              </button>
            </div>
          </header>

          <div className="mc-field-section mc-field-section-tight">
            <form className="mc-entry-form" onSubmit={(e) => void onSubmit(e)}>

              <div className="request-head-row">
                <RequestDateTimeField
                  date={form.requestDate}
                  time={form.requestTime}
                  disabled={fieldsLocked}
                  onDateChange={(value) => setForm((f) => withRequestDateTime(f, value, f.requestTime))}
                  onTimeChange={(value) => setForm((f) => withRequestDateTime(f, f.requestDate, value))}
                />
                <SearchEntry
                  className="request-head-row__refs"
                  disabled={fieldsLocked}
                  sites={sites}
                intervenants={intervenants}
                selectedSite={selectedSite}
                selectedIntervenant={selectedIntervenant}
                onSelectedSiteChange={(site) => {
                  if (site) {
                    setShowPendingSiteForm(false);
                    setPendingCode("");
                    setPendingName("");
                  }
                  setForm((f) => ({
                    ...f,
                    siteId: site?.id ?? null,
                    siteDisplay: site ? `${site.name} (${site.code})` : ""
                  }));
                }}
                onSelectedIntervenantChange={(intervenant) => {
                  if (intervenant) {
                    setShowPendingIntervenantForm(false);
                    setPendingIntervenantName("");
                  }
                  setForm((f) => ({
                    ...f,
                    intervenantId: intervenant?.id ?? null,
                    intervenantName: intervenant?.name ?? ""
                  }));
                }}
                showPendingSiteForm={canCreatePendingRefs && showPendingSiteForm}
                showPendingIntervenantForm={canCreatePendingRefs && showPendingIntervenantForm}
                onTogglePendingSite={() => setShowPendingSiteForm((current) => !current)}
                onTogglePendingIntervenant={() => setShowPendingIntervenantForm((current) => !current)}
                pendingSiteForm={(
                  <PendingSiteInlineFields
                    code={pendingCode}
                    name={pendingName}
                    onCodeChange={setPendingCode}
                    onNameChange={setPendingName}
                  />
                )}
                pendingIntervenantForm={(
                  <PendingIntervenantInlineField
                    name={pendingIntervenantName}
                    onNameChange={setPendingIntervenantName}
                    label="Nouvel intervenant"
                  />
                )}
                onNotify={onNotify}
                showSiteAction={canCreatePendingRefs ? !form.siteId : false}
                showIntervenantAction={canCreatePendingRefs ? !form.intervenantId : false}
              />
              </div>

              <GardiennagePlanningSection
                form={form}
                setForm={setForm}
                planningMode={planningMode}
                locked={fieldsLocked}
                isCreateMode={isCreateMode}
                isCloture={isCloture}
                isAnnule={isAnnule}
                entry={entry}
                ponctuelCrossesMidnight={ponctuelCrossesMidnight}
                lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
                linesOverlapError={linesOverlapError}
                previewPerLineCounts={previewPerLineCounts}
                previewSlotsCount={previewSlots.length}
                previewTotalMinutes={previewTotalMinutes}
                previewClosedSlotsCount={previewClosedSlotsCount}
                highlightNewestLineId={highlightNewestLineId}
                newestLineRef={newestLineRef}
              />

              {/* CONSIGNE */}
              <CreateFormSection title="Demande">
                <label className="mc-field mc-field-full">
                  <span>Nom du client</span>
                  <input
                    type="text"
                    value={form.clientName}
                    disabled={fieldsLocked}
                    maxLength={200}
                    placeholder="Vide : demande télésurveillance"
                    aria-label="Nom du client"
                    onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                  />
                </label>
              </CreateFormSection>
              <CreateFormSection title="Consigne">
                <div
                  className={
                    extras.requestDefs.length === 1
                      ? "request-motif-row request-motif-row--with-extra"
                      : undefined
                  }
                >
                  <label className={`mc-field ${extras.requestDefs.length === 1 ? "request-motif-row__motif" : "mc-field-full"}`}>
                    <textarea
                      rows={3}
                      value={form.notes}
                      disabled={fieldsLocked}
                      maxLength={2000}
                      placeholder="Consignes particulières, observations…"
                      className="mc-textarea"
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </label>
                  {extras.requestDefs.length === 1 ? (
                    <FormVariableFields
                      defs={extras.requestDefs}
                      values={extras.values}
                      onValuesChange={extras.setValues}
                      disabled={fieldsLocked}
                      compact
                    />
                  ) : null}
                </div>
                {extras.requestDefs.length > 1 ? (
                  <FormVariableFields
                    defs={extras.requestDefs}
                    values={extras.values}
                    onValuesChange={extras.setValues}
                    disabled={fieldsLocked}
                    title="Champs de la demande"
                  />
                ) : null}
              </CreateFormSection>

              {/* Info clôture (lecture seule, visible en mode CLOTURE) */}
              {!isCreateMode && isCloture && (entry?.closureReport || entry?.actualStartTime || entry?.workOrderNumber) && (
                <CreateFormSection title="Clôture enregistrée">
                  <div className="gardiennage-closure-summary">
                    {entry.closureReport && isGardiennageAutoClosureReport(entry.closureReport) && (
                      <p className="muted mc-ref-hint">
                        Clôture automatique (horaire de fin dépassé). Utilisez <strong>Rouvrir</strong> puis reclôturez pour saisir les
                        heures effectives, le n° de bon ou un compte rendu terrain.
                      </p>
                    )}
                    {entry.actualStartTime && (
                      <p className="muted mc-ref-hint">
                        Effectif : <strong>{entry.actualStartTime} → {entry.actualEndTime || "—"}</strong>
                        {entry.workOrderNumber ? <> · N° bon : <strong>{entry.workOrderNumber}</strong></> : null}
                      </p>
                    )}
                    {entry.closureReport && (
                      <p className="muted mc-ref-hint">{entry.closureReport}</p>
                    )}
                  </div>
                </CreateFormSection>
              )}

              {/* Info annulation */}
              {!isCreateMode && isAnnule && entry?.cancellationReason && (
                <CreateFormSection title="Annulation">
                  <p className="muted mc-ref-hint">
                    <strong>Motif :</strong> {entry.cancellationReason}
                  </p>
                </CreateFormSection>
              )}

              {/* FOOTER */}
              <div className="mc-modal-footer mc-modal-footer-split">
                <div className="mc-modal-footer-start">
                  <button type="button" className="btn-ghost" onClick={requestClose}>
                    Fermer
                  </button>
                </div>
                <div className="mc-modal-footer-end">
                  {canReopen && (
                    <button
                      type="button"
                      className="mc-btn-primary"
                      disabled={isSaving}
                      title="Rouvrir ce gardiennage pour modification"
                      onClick={() => void handleReopenGardiennage()}
                    >
                      {isSaving ? "Réouverture…" : "Rouvrir"}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={isSaving}
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      Annuler le gardiennage
                    </button>
                  )}
                  {!isConsultation && !isReadOnlyByRole && (
                    <button type="submit" className="mc-btn-primary entry-create-submit" disabled={isSubmitDisabled}>
                      {isSaving ? "Enregistrement…" : isCreateMode ? "Créer" : "Enregistrer"}
                    </button>
                  )}
                </div>
              </div>

            </form>
          </div>
        </section>
      </div>

      {/* Confirmation abandon de saisie */}
      <DiscardConfirmModal
        isOpen={showDiscardConfirm}
        kind={isCreateMode ? "create" : "edit"}
        onCancel={cancelDiscard}
        onConfirm={confirmDiscardAndClose}
      />

      {/* Annulation avec motif obligatoire */}
      <ConfirmModal
        isOpen={showCancelConfirm}
        title="Annuler le gardiennage ?"
        message="L'annulation est définitive. Un motif est obligatoire."
        confirmLabel="Confirmer l'annulation"
        confirmClassName="btn-danger"
        confirmDisabled={!cancelReason.trim()}
        onCancel={() => { setShowCancelConfirm(false); setCancelReason(""); }}
        onConfirm={() => void handleCancelGardiennage()}
      >
        <label className="mc-field mc-field-full" style={{ marginTop: 12 }}>
          <span className="muted" style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Motif d'annulation *
          </span>
          <textarea
            rows={3}
            value={cancelReason}
            maxLength={500}
            placeholder="Ex. Motif exemple"
            className="mc-textarea"
            autoFocus
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </label>
      </ConfirmModal>
    </>
  );
}
