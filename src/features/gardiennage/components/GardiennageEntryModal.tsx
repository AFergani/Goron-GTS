/**
 * Modale création / édition gardiennage (planification versionnée, prévisualisation créneaux).
 *
 * Modes ponctuel, récurrent (lignes type ronde), H24. Site / prestataire, liens intervention
 * et ronde, annulation avec motif, garde fermeture en création (`useCreateModalCloseGuard`).
 * Hydratation formulaire : `[isOpen, mode, entry?.id]` — pas de reset sur refresh listes.
 *
 * Fichier volumineux (~1000 lignes) : candidat à un découpage (sections planning / statut).
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import {
  isGardiennageAutoClosureReport,
  type GardiennageEntry,
  type GardiennagePlanningLineV1,
  type GardiennagePlanningSnapshotV1,
  type GardiennageSavePayload,
  type GardiennageStatus
} from "../model/gardiennage.types";
import { buildGardiennageSlotsFromSnapshot } from "../model/gardiennagePlannerEngine";
import {
  buildEffectivePlanningSnapshot,
  GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT,
  GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
  inferPlanningModeFromSnapshot,
  isPlanningFormValid,
  isValidPlanningTime,
  resolvePlanningFormMode,
  resolvePonctuelValidToDate,
  shiftIsoDate,
  type GardiennagePlanningFormMode
} from "../model/gardiennagePlanningForm";
import {
  buildHolidayMatchers,
  collectActiveDatesForLine,
  GARDIENNAGE_WEEKDAYS_ALL_MASK,
  isIsoDate as isPlanningIsoDate
} from "../model/gardiennagePlanningCalendar";
import { SiteSearchInput } from "../../mainCourante/components/SiteSearchInput";
import { IntervenantSearchInput } from "../../intervention/components/IntervenantSearchInput";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { PendingSiteIntervenantRefActions } from "../../common/components/PendingSiteIntervenantRefActions";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { GardiennagePlanningLineWeekdays } from "./GardiennagePlanningLineWeekdays";
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
  createPreset?: GardiennageCreatePreset | null;
  onClose: () => void;
  onCreate: (payload: GardiennageSavePayload) => Promise<boolean>;
  onUpdate: (id: string, expectedUpdatedAt: string, payload: GardiennageSavePayload) => Promise<GardiennageEntry | null>;
  onSetStatus?: (id: string, expectedUpdatedAt: string, status: GardiennageStatus, cancellationReason?: string) => Promise<boolean>;
  onReopenEntry?: (id: string, expectedUpdatedAt: string) => Promise<boolean>;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
  onNotify?: (message: string) => void;
};

type FormState = {
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
};

const EMPTY_FORM: FormState = {
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
  planningLines: []
};

function formatNowDate() {
  return new Date().toISOString().slice(0, 10);
}

function isValidTime(value: string) {
  return isValidPlanningTime(value);
}

function formatDurationMinutes(totalMin: number): string {
  if (!Number.isFinite(totalMin) || totalMin <= 0) return "0h00";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatIsoFrDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function parseTimeToMin(hhmm: string): number {
  if (!isValidTime(hhmm)) return -1;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function GardiennageEntryModal({
  isOpen,
  mode,
  entry,
  sites,
  intervenants,
  holidays = [],
  requesterRole,
  createPreset,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
  onReopenEntry,
  onNavigateToLinkedIntervention,
  onNavigateToLinkedRonde,
  onNotify
}: GardiennageEntryModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const [showPendingIntervenantForm, setShowPendingIntervenantForm] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingIntervenantName, setPendingIntervenantName] = useState("");

  const createDefaultLine = (label = "Ligne 1", anchorDate?: string): GardiennagePlanningLineV1 => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    // Date optionnelle : vide = ligne récurrente sur toute la validité (selon weekdaysMask).
    anchorDate: anchorDate || "",
    startTime: "",
    endTime: "",
    weekdaysMask: GARDIENNAGE_WEEKDAYS_ALL_MASK,
    includeHolidays: true,
    includeHolidayEves: false
  });

  const isCreateMode = mode === "create";
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } =
    useCreateModalCloseGuard({ enabled: isOpen, isDirty, onClose });

  /* Initialisation à l'ouverture en mode création */
  useEffect(() => {
    if (!isOpen || !isCreateMode) return;
    const init: FormState = {
      ...EMPTY_FORM,
      recurrenceStartDate: formatNowDate(),
      validFromDate: formatNowDate(),
      validToDate: formatNowDate(),
      planningLines: [createDefaultLine()],
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
    const hydrated: FormState = {
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
      validToDate: h24OpenEnded ? "" : (snap?.validToDate || entry.recurrenceEndDate || entry.recurrenceStartDate),
      validToTime: isPonctuel
        ? (firstLine?.endTime || entry.endTime || "")
        : (h24OpenEnded ? "" : (snap?.validToTime || entry.endTime || "")),
      isContinuous,
      planningLines: isContinuous || isPonctuel
        ? []
        : (snap?.lines?.length
          ? snap.lines
          : [{
            id: "legacy-line",
            label: "Ligne 1",
            anchorDate: "",
            startTime: entry.startTime || "",
            endTime: entry.endTime || "",
            weekdaysMask: GARDIENNAGE_WEEKDAYS_ALL_MASK,
            includeHolidays: true,
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
  const selectedIntervenant =
    form.intervenantId ? (intervenants.find((i) => i.id === form.intervenantId) ?? null) : null;

  const planningMode = resolvePlanningFormMode(form.isPonctuel, form.isContinuous);

  const applyPlanningMode = (mode: GardiennagePlanningFormMode) => {
    setForm((f) => {
      if (mode === "ponctuel") {
        const firstLine = f.planningLines[0];
        return {
          ...f,
          isPonctuel: true,
          isContinuous: false,
          recurrenceEndDate: "",
          validFromTime: firstLine?.startTime || f.validFromTime || "",
          validToTime: firstLine?.endTime || f.validToTime || "",
          planningLines: []
        };
      }
      if (mode === "h24") {
        return {
          ...f,
          isPonctuel: false,
          isContinuous: true,
          planningLines: [],
          validToDate: "",
          validToTime: ""
        };
      }
      return {
        ...f,
        isPonctuel: false,
        isContinuous: false,
        validToDate: f.validToDate.trim() || f.validFromDate || formatNowDate(),
        planningLines: f.planningLines.length ? f.planningLines : [createDefaultLine()]
      };
    });
  };
  const planningSnapshot: GardiennagePlanningSnapshotV1 = useMemo(
    () => buildEffectivePlanningSnapshot({
      validFromDate: form.validFromDate || form.recurrenceStartDate,
      validFromTime: form.validFromTime,
      validToDate: planningMode === "h24"
        ? form.validToDate
        : (form.validToDate || form.recurrenceEndDate),
      validToTime: form.validToTime,
      isPonctuel: form.isPonctuel,
      isContinuous: form.isContinuous,
      planningLines: form.planningLines,
      fallbackDate: formatNowDate()
    }),
    [form]
  );
  const holidayDateIsos = useMemo(
    () => holidays.map((h) => String(h.dateIso || "").trim()).filter(Boolean),
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
  const linesOverlapError = useMemo(() => {
    if (planningMode !== "recurring" || form.planningLines.length <= 1) return "";
    const holiday = buildHolidayMatchers(holidayDateIsos);
    const anchoredStartDates = new Set(
      form.planningLines
        .map((line) => (isPlanningIsoDate(line.anchorDate) ? line.anchorDate : ""))
        .filter((value) => Boolean(value))
    );
    const daySegments: Record<string, Array<{ start: number; end: number }>> = {};
    const pushDaySegment = (isoDate: string, segment: { start: number; end: number }) => {
      if (!daySegments[isoDate]) daySegments[isoDate] = [];
      daySegments[isoDate].push(segment);
    };
    for (const line of form.planningLines) {
      const start = parseTimeToMin(line.startTime);
      const end = parseTimeToMin(line.endTime);
      if (start < 0 || end < 0) continue;
      const activeDates = collectActiveDatesForLine(
        line,
        form.validFromDate,
        form.validToDate,
        anchoredStartDates,
        holiday
      );
      for (const activeDate of activeDates) {
        if (end > start) {
          pushDaySegment(activeDate, { start, end });
        } else if (end < start) {
          pushDaySegment(activeDate, { start, end: 24 * 60 });
          pushDaySegment(shiftIsoDate(activeDate, 1), { start: 0, end });
        } else {
          pushDaySegment(activeDate, { start: 0, end: 24 * 60 });
        }
      }
    }
    for (const isoDate of Object.keys(daySegments)) {
      const segments = daySegments[isoDate].sort((a, b) => a.start - b.start);
      for (let i = 1; i < segments.length; i += 1) {
        const prev = segments[i - 1];
        const current = segments[i];
        // On autorise la continuité stricte (current.start === prev.end).
        if (current.start < prev.end) {
          return "Chevauchement détecté entre lignes de planification. Ajustez les horaires.";
        }
      }
    }
    return "";
  }, [planningMode, form.validFromDate, form.validToDate, form.planningLines, holidayDateIsos]);

  if (!isOpen) return null;

  const isAnnule = entry?.status === "ANNULE";
  const isCloture = entry?.status === "CLOTURE";
  /** Restriction rôle uniquement hors création (la création reste ouverte à tous). */
  const isOperatorMode = requesterRole === "OPERATEUR";
  const isReadOnlyByRole = !isCreateMode && isOperatorMode;
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

  const showPlanningLines = planningMode === "recurring";
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
    planningSnapshot
  });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled || isAnnule) return;
    setIsSaving(true);
    try {
      let ok = false;
      if (isCreateMode) {
        let pendingSiteDisplay: string | null = null;
        if (!selectedSite && (pendingCode.trim() || pendingName.trim())) {
          if (!pendingCode.trim() || !pendingName.trim()) {
            onNotify?.("Pour \"Site introuvable\", renseignez le code et le nom.");
            return;
          }
          pendingSiteDisplay = `${pendingName.trim()} (${pendingCode.trim()})`;
        }
        const finalSiteId = selectedSite?.id ?? null;
        const finalSiteDisplay = selectedSite
          ? `${selectedSite.name} (${selectedSite.code})`
          : pendingSiteDisplay || "";
        const finalIntervenantId = selectedIntervenant?.id ?? null;
        const finalIntervenantName = selectedIntervenant?.name || pendingIntervenantName.trim();
        if (!finalSiteId && !finalSiteDisplay) {
          onNotify?.("Sélectionnez un site ou utilisez le bloc \"Site introuvable\".");
          return;
        }
        if (!finalIntervenantId && !finalIntervenantName) {
          onNotify?.("Sélectionnez un intervenant ou utilisez le bloc \"Intervenant introuvable\".");
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
    : isCloture
      ? "Gardiennage clôturé"
      : isAnnule
        ? "Gardiennage annulé"
        : "Édition Gardiennage";

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

              {/* SITE + PRESTATAIRE — même ligne */}
              <CreateFormSection title="Site * / Prestataire *">
                <div className="gardiennage-site-presta-row">
                  <div className="gardiennage-site-presta-col">
                    <SiteSearchInput
                      sites={sites}
                      selectedSite={selectedSite}
                      copyNotify={onNotify}
                      disabled={isSaving || isAnnule || isReadOnlyByRole}
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
                    />
                    {!form.siteId && (
                      <p className="muted mc-ref-hint">Le site est obligatoire.</p>
                    )}
                  </div>
                  <div className="gardiennage-site-presta-col">
                    <IntervenantSearchInput
                      intervenants={intervenants}
                      selectedIntervenant={selectedIntervenant}
                      disabled={isSaving || isAnnule || isReadOnlyByRole}
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
                    />
                    {!form.intervenantId && (
                      <p className="muted mc-ref-hint">Le prestataire est obligatoire.</p>
                    )}
                  </div>
                </div>
                {canCreatePendingRefs ? (
                  <PendingSiteIntervenantRefActions
                    selectedSite={selectedSite}
                    selectedIntervenant={selectedIntervenant}
                    showPendingSiteForm={showPendingSiteForm}
                    showPendingIntervenantForm={showPendingIntervenantForm}
                    onTogglePendingSite={() => setShowPendingSiteForm((current) => !current)}
                    onTogglePendingIntervenant={() => setShowPendingIntervenantForm((current) => !current)}
                    pendingSiteForm={(
                      <div className="mc-form-grid mc-form-grid-main">
                        <label className="mc-field">
                          <span>Nouveau code site</span>
                          <input value={pendingCode} onChange={(e) => setPendingCode(e.target.value)} />
                        </label>
                        <label className="mc-field">
                          <span>Nouveau nom de site</span>
                          <input value={pendingName} onChange={(e) => setPendingName(e.target.value)} />
                        </label>
                      </div>
                    )}
                    pendingIntervenantForm={(
                      <div className="mc-form-grid mc-form-grid-main">
                        <label className="mc-field mc-field-full">
                          <span>Nouvel intervenant</span>
                          <input value={pendingIntervenantName} onChange={(e) => setPendingIntervenantName(e.target.value)} />
                        </label>
                      </div>
                    )}
                  />
                ) : null}
              </CreateFormSection>

              {/* PLANIFICATION */}
              <CreateFormSection title="Planification">
                <div className="gardiennage-planning-toggles">
                  <ToggleSwitch
                    label="Planification libre"
                    checked={planningMode === "recurring"}
                    disabled={isSaving || isAnnule || isReadOnlyByRole}
                    labelFirst
                    onChange={(next) => next && applyPlanningMode("recurring")}
                  />
                  <ToggleSwitch
                    label="Journée unique"
                    checked={planningMode === "ponctuel"}
                    disabled={isSaving || isAnnule || isReadOnlyByRole}
                    labelFirst
                    onChange={(next) => next && applyPlanningMode("ponctuel")}
                  />
                  <ToggleSwitch
                    label="H24"
                    checked={planningMode === "h24"}
                    disabled={isSaving || isAnnule || isReadOnlyByRole}
                    labelFirst
                    onChange={(next) => next && applyPlanningMode("h24")}
                  />
                </div>

                {planningMode === "ponctuel" && (
                  <div className="gardiennage-planning-validity">
                    <span className="gardiennage-validity-lead">Validité</span>
                    <label className="gardiennage-date-field">
                      <span className="gardiennage-date-label">Date</span>
                      <input
                        type="date"
                        value={form.validFromDate}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => setForm((f) => ({ ...f, validFromDate: e.target.value }))}
                      />
                    </label>
                    <span className="gardiennage-date-sep">de</span>
                    <label className="gardiennage-time-field">
                      <span className="gardiennage-date-label">Début</span>
                      <input
                        type="time"
                        value={form.validFromTime}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => setForm((f) => ({ ...f, validFromTime: e.target.value }))}
                      />
                    </label>
                    <span className="gardiennage-date-sep">à</span>
                    <label className="gardiennage-time-field">
                      <span className="gardiennage-date-label">Fin</span>
                      <input
                        type="time"
                        value={form.validToTime}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => setForm((f) => ({ ...f, validToTime: e.target.value }))}
                      />
                    </label>
                  </div>
                )}

                {planningMode === "h24" && (
                  <div className="gardiennage-planning-validity">
                    <span className="gardiennage-validity-lead">Validité du</span>
                    <label className="gardiennage-date-field">
                      <span className="gardiennage-date-label">Date</span>
                      <input
                        type="date"
                        value={form.validFromDate}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          validFromDate: e.target.value,
                          validToDate: f.validToDate && f.validToDate < e.target.value ? e.target.value : f.validToDate
                        }))}
                      />
                    </label>
                    <label className="gardiennage-time-field">
                      <span className="gardiennage-date-label">Heure</span>
                      <input
                        type="time"
                        value={form.validFromTime}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => setForm((f) => ({ ...f, validFromTime: e.target.value }))}
                      />
                    </label>
                    <span className="gardiennage-date-sep">au</span>
                    <label className="gardiennage-date-field">
                      <span className="gardiennage-date-label">Date fin (optionnelle)</span>
                      <span className="gardiennage-date-input-wrap">
                        <input
                          type="date"
                          className={form.validToDate.trim() ? "" : "gardiennage-date-input--empty"}
                          value={form.validToDate}
                          disabled={isSaving || isAnnule || isReadOnlyByRole}
                          min={form.validFromDate || undefined}
                          aria-label="Date de fin (optionnelle)"
                          onChange={(e) => setForm((f) => ({ ...f, validToDate: e.target.value }))}
                        />
                        {!form.validToDate.trim() ? (
                          <span className="gardiennage-date-placeholder" aria-hidden="true">jj/mm/aaaa</span>
                        ) : null}
                      </span>
                    </label>
                    <label className="gardiennage-time-field">
                      <span className="gardiennage-date-label">Heure (optionnelle)</span>
                      <span className="gardiennage-date-input-wrap">
                        <input
                          type="time"
                          className={form.validToTime.trim() ? "" : "gardiennage-date-input--empty"}
                          value={form.validToTime}
                          disabled={isSaving || isAnnule || isReadOnlyByRole}
                          aria-label="Heure de fin (optionnelle)"
                          onChange={(e) => setForm((f) => ({ ...f, validToTime: e.target.value }))}
                        />
                        {!form.validToTime.trim() ? (
                          <span className="gardiennage-date-placeholder" aria-hidden="true">--:--</span>
                        ) : null}
                      </span>
                    </label>
                  </div>
                )}

                {planningMode === "recurring" && (
                  <div className="gardiennage-planning-validity">
                    <span className="gardiennage-validity-lead">Validité du</span>
                    <label className="gardiennage-date-field">
                      <span className="gardiennage-date-label">Date</span>
                      <input
                        type="date"
                        value={form.validFromDate}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          validFromDate: e.target.value,
                          validToDate: f.validToDate && f.validToDate < e.target.value ? e.target.value : f.validToDate
                        }))}
                      />
                    </label>
                    <span className="gardiennage-date-sep">au</span>
                    <label className="gardiennage-date-field">
                      <span className="gardiennage-date-label">Date</span>
                      <input
                        type="date"
                        value={form.validToDate}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        min={form.validFromDate || undefined}
                        onChange={(e) => setForm((f) => ({ ...f, validToDate: e.target.value }))}
                      />
                    </label>
                  </div>
                )}

                {planningMode === "ponctuel" && ponctuelCrossesMidnight && (
                  <p className="muted mc-ref-hint">La fin est le lendemain (passage après minuit géré automatiquement).</p>
                )}
                {planningMode === "h24" && (
                  <p className="muted mc-ref-hint">
                    Couverture continue sur la période indiquée. Laissez la date de fin vide pour une prestation jusqu&apos;à nouvel ordre :
                    le système maintient un horizon glissant de {GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS} jours (prolongation automatique lorsque la
                    fin approche à {GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT} jours ou moins, tant que la demande reste planifiée ou active).
                    L&apos;heure de fin est optionnelle : si elle est vide, elle reprend l&apos;heure de début. Pour combiner H24 et horaires
                    récurrents, créez deux demandes distinctes.
                  </p>
                )}
                {!isCreateMode && entry?.planningBatchId && entry.planningSnapshot && !isCloture && !isAnnule && (
                  <p className="muted mc-ref-hint" role="note">
                    La modification resynchronise tous les créneaux du lot non clôturés. Les créneaux déjà clôturés ne sont pas modifiés.
                  </p>
                )}
                {planningMode === "recurring" && (
                  <p className="muted mc-ref-hint">
                    Définissez les horaires dans les lignes ci-dessous (dates seules sur la validité).
                  </p>
                )}
              </CreateFormSection>

              {showPlanningLines && (
                <CreateFormSection
                  title="Lignes de planification"
                  headerAction={(
                    <button
                      type="button"
                      className="btn-light"
                      disabled={isSaving || isAnnule || isReadOnlyByRole}
                      title="Ajouter une ligne"
                      aria-label="Ajouter une ligne"
                      onClick={() => setForm((f) => {
                        const nextIndex = f.planningLines.length + 1;
                        return {
                          ...f,
                          planningLines: [...f.planningLines, createDefaultLine(`Ligne ${nextIndex}`)]
                        };
                      })}
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  )}
                >
                  <div className="gardiennage-planning-lines">
                    {form.planningLines.map((line, index) => (
                      <fieldset key={line.id} className="gardiennage-planning-line">
                        <legend className="gardiennage-planning-line__legend">
                          <span className="gardiennage-planning-line__legend-label">Ligne {index + 1}</span>
                          <button
                            type="button"
                            className="btn-danger action-icon-btn gardiennage-planning-line__remove"
                            disabled={isSaving || isAnnule || isReadOnlyByRole || form.planningLines.length === 1}
                            title={form.planningLines.length === 1 ? "Au moins une ligne de planification est requise" : "Supprimer cette ligne"}
                            aria-label={form.planningLines.length === 1 ? "Suppression impossible : une seule ligne" : "Supprimer cette ligne"}
                            onClick={() => {
                              if (form.planningLines.length <= 1) return;
                              setForm((f) => ({ ...f, planningLines: f.planningLines.filter((it) => it.id !== line.id) }));
                            }}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </legend>
                      <div className="gardiennage-horaires-row" style={{ alignItems: "end" }}>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Début</span>
                          <input
                            type="time"
                            value={line.startTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              planningLines: f.planningLines.map((it) => it.id === line.id ? { ...it, startTime: e.target.value } : it)
                            }))}
                          />
                        </label>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Fin</span>
                          <input
                            type="time"
                            value={line.endTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              planningLines: f.planningLines.map((it) => it.id === line.id ? { ...it, endTime: e.target.value } : it)
                            }))}
                          />
                        </label>
                        <label className="gardiennage-time-field gardiennage-duree-field">
                          <span className="gardiennage-date-label">Durée</span>
                          <input
                            type="text"
                            readOnly
                            className="mc-input-readonly"
                            value={formatDurationMinutes((() => {
                              const start = parseTimeToMin(line.startTime);
                              const end = parseTimeToMin(line.endTime);
                              if (start < 0 || end < 0) return 0;
                              if (end > start) return end - start;
                              if (end < start) return (24 * 60 - start) + end;
                              return 24 * 60;
                            })())}
                          />
                        </label>
                        <label className="gardiennage-date-field">
                          <span className="gardiennage-date-label">Date (optionnelle)</span>
                          <input
                            type="date"
                            value={line.anchorDate || ""}
                            min={form.validFromDate || undefined}
                            max={form.validToDate || undefined}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              planningLines: f.planningLines.map((it) => it.id === line.id ? { ...it, anchorDate: e.target.value } : it)
                            }))}
                          />
                        </label>
                      </div>
                      <GardiennagePlanningLineWeekdays
                        line={line}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(patch) => setForm((f) => ({
                          ...f,
                          planningLines: f.planningLines.map((it) => (it.id === line.id ? { ...it, ...patch } : it))
                        }))}
                      />
                      </fieldset>
                    ))}
                    <p className="muted mc-ref-hint gardiennage-planning-lines-hint">
                      Sans date, la ligne s&apos;applique selon les jours cochés (L à D, JF). Ex. nuit lun–ven : 20:00 → 08:00, décocher Sam et Dim. Avec date, seul ce jour est ciblé.
                    </p>
                  </div>
                  {linesOverlapError && (
                    <p className="muted mc-ref-hint" style={{ color: "var(--danger-700, #b42318)" }}>
                      {linesOverlapError}
                    </p>
                  )}
                </CreateFormSection>
              )}

              <CreateFormSection title="Prévisualisation">
                <p className="muted mc-ref-hint">
                  {previewSlots.length} créneau(x) généré(s) sur la validité configurée · Total effectif: {formatDurationMinutes(previewTotalMinutes)}.
                  {planningMode === "h24" && !form.validToDate.trim() ? (
                    <> · Horizon glissant : au moins {GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS} jours à l&apos;avance (prolongation automatique).</>
                  ) : null}
                </p>
                <div style={{ maxHeight: 160, overflow: "auto", border: "1px solid var(--border-color)", borderRadius: 8, padding: 8 }}>
                  {previewSlots.slice(0, 40).map((slot) => (
                    <p key={`${slot.lineId}-${slot.startIso}`} className="muted mc-ref-hint" style={{ margin: "0 0 4px 0" }}>
                      {slot.lineLabel} · {formatIsoFrDateTime(slot.startIso)} → {formatIsoFrDateTime(slot.endIso)}
                      {slot.crossesMidnight ? " (passage minuit)" : ""}
                    </p>
                  ))}
                  {previewSlots.length === 0 && <p className="muted mc-ref-hint" style={{ margin: 0 }}>Aucun créneau généré.</p>}
                  {previewSlots.length > 40 && <p className="muted mc-ref-hint" style={{ margin: "4px 0 0 0" }}>… aperçu limité à 40 lignes.</p>}
                </div>
              </CreateFormSection>

              {/* CONSIGNE */}
              <CreateFormSection title="Consigne">
                <label className="mc-field mc-field-full">
                  <textarea
                    rows={3}
                    value={form.notes}
                    disabled={isSaving || isAnnule || isReadOnlyByRole}
                    maxLength={2000}
                    placeholder="Consignes particulières, observations…"
                    className="mc-textarea"
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
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
                      className="btn-light"
                      disabled={isSaving}
                      title="Rouvrir ce gardiennage pour modification"
                      onClick={() => void handleReopenGardiennage()}
                    >
                      Rouvrir
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
                  {!isAnnule && !isReadOnlyByRole && (
                    <button type="submit" className="mc-btn-primary" disabled={isSubmitDisabled}>
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
      <ConfirmModal
        isOpen={showDiscardConfirm}
        title="Abandonner la saisie ?"
        message="Les modifications non enregistrées seront perdues."
        confirmLabel="Abandonner"
        confirmClassName="btn-danger"
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
            placeholder="Saisissez un motif d'annulation…"
            className="mc-textarea"
            autoFocus
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </label>
      </ConfirmModal>
    </>
  );
}
