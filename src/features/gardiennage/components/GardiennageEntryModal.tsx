/**
 * Modale création / édition gardiennage (planification versionnée, prévisualisation créneaux).
 *
 * Modes ponctuel, récurrent (lignes type ronde), H24. Site / prestataire, liens intervention
 * et ronde, annulation avec motif, garde fermeture en création (`useCreateModalCloseGuard`).
 * Lignes récurrentes : ajout en tête, numérotation chronologique, scroll/highlight, veilles JF,
 * verrou jours sur plage ≤ 7 j, pending refs via `createPendingRefsIfNeededForSubmit`.
 * Récapitulatif type rondes (`GardiennagePlanningLinesRecap`) : résumé par ligne + compteurs.
 * Hydratation formulaire : `[isOpen, mode, entry?.id]` — pas de reset sur refresh listes.
 *
 * Fichier volumineux (~1000 lignes) : candidat à un découpage (sections planning / statut).
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import {
  gardiennagePlanningLineDisplayNumber,
  normalizeGardiennagePlanningLinesNewestFirst,
  syncGardiennagePlanningLineLabels
} from "../utils/gardiennagePlanningLineOrder";
import { resolveGardiennageValidityWeekdayLock } from "../utils/resolveGardiennageValidityWeekdayLock";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { SearchEntry } from "../../common/components/SearchEntry";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import { useFormVariableFields } from "../../common/hooks/useFormVariableFields";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { TimeInput } from "../../common/components/TimeInput";
import { DateInput } from "../../common/components/DateInput";
import { RequestDateTimeField } from "../../common/components/RequestDateTimeField";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import {
  applyRequestDateTimeChange,
  applyValidFromDateTimeChange,
  type RequestValidityRange
} from "../../common/utils/alignRequestAndValidity";
import { GardiennagePlanningLineWeekdays } from "./GardiennagePlanningLineWeekdays";
import { GardiennagePlanningLinesRecap } from "./GardiennagePlanningLinesRecap";
import type { NotifyToast } from "../../common/model/toast.types";
import { reportTitleWithDailyCode } from "../../common/utils/dailyEntryCode";
import { isGardiennagePreviewSlotClosed } from "../model/gardiennageClosure";
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
  requestDate: string;
  requestTime: string;
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
  planningLines: [],
  requestDate: "",
  requestTime: ""
};

function formToValidityRange(form: FormState): RequestValidityRange {
  return {
    requestDate: form.requestDate,
    requestTime: form.requestTime,
    validFromDate: form.validFromDate,
    validFromTime: form.validFromTime,
    validToDate: form.validToDate,
    validToTime: form.validToTime
  };
}

function applyValidityRange(form: FormState, range: RequestValidityRange): FormState {
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

function gardiennageAlignOpts(form: FormState) {
  const mode = resolvePlanningFormMode(form.isPonctuel, form.isContinuous);
  return {
    validityHasTime: mode !== "recurring",
    compareEndTimes: false
  };
}

function withRequestDateTime(form: FormState, date: string, time: string): FormState {
  return applyValidityRange(
    form,
    applyRequestDateTimeChange(formToValidityRange(form), { date, time }, gardiennageAlignOpts(form))
  );
}

function withValidFromDateTime(form: FormState, date: string, time: string): FormState {
  return applyValidityRange(
    form,
    applyValidFromDateTimeChange(formToValidityRange(form), { date, time }, gardiennageAlignOpts(form))
  );
}

function formatNowDate() {
  return new Date().toISOString().slice(0, 10);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatNowTime() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function dateTimeFromIso(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { date: formatNowDate(), time: formatNowTime() };
  }
  return {
    date: `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`,
    time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
  };
}

function formatDurationMinutes(totalMin: number): string {
  if (!Number.isFinite(totalMin) || totalMin <= 0) return "0h00";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function parseTimeToMin(hhmm: string): number {
  if (!isValidPlanningTime(hhmm)) return -1;
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
  const newestLineRef = useRef<HTMLFieldSetElement | null>(null);
  const prevNewestLineIdRef = useRef<string | null>(null);
  const [highlightNewestLineId, setHighlightNewestLineId] = useState<string | null>(null);

  const createDefaultLine = (label = "Ligne 1", anchorDate?: string): GardiennagePlanningLineV1 => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    // Date optionnelle : vide = ligne récurrente sur toute la validité (selon weekdaysMask).
    anchorDate: anchorDate || "",
    startTime: "",
    endTime: "",
    weekdaysMask: GARDIENNAGE_WEEKDAYS_ALL_MASK,
    includeHolidays: false,
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
      validToDate: "",
      planningLines: [createDefaultLine()],
      requestDate: formatNowDate(),
      requestTime: formatNowTime(),
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
    const created = dateTimeFromIso(entry.createdAt);
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
      validToDate: h24OpenEnded ? "" : (snap?.userValidToDate || snap?.validToDate || entry.recurrenceEndDate || entry.recurrenceStartDate),
      validToTime: isPonctuel
        ? (firstLine?.endTime || entry.endTime || "")
        : (h24OpenEnded ? "" : (snap?.validToTime || entry.endTime || "")),
      isContinuous,
      requestDate: String(snap?.requestDate || "").trim() || created.date,
      requestTime: String(snap?.requestTime || "").trim() || created.time,
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
        planningLines: f.planningLines.length ? f.planningLines : [createDefaultLine()]
      };
    });
  };
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
        fallbackDate: formatNowDate()
      }),
      requestDate: form.requestDate,
      requestTime: form.requestTime
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
  const previewPerLineCounts = useMemo(
    () => form.planningLines.map((line) => previewSlots.filter((slot) => slot.lineId === line.id).length),
    [form.planningLines, previewSlots]
  );
  const previewClosedSlotsCount = useMemo(
    () => previewSlots.filter((slot) => isGardiennagePreviewSlotClosed(slot, batchEntries)).length,
    [previewSlots, batchEntries]
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
    planningSnapshot,
    exportExtraValues: extras.values
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
                  disabled={isSaving || isAnnule || isReadOnlyByRole}
                  onDateChange={(value) => setForm((f) => withRequestDateTime(f, value, f.requestTime))}
                  onTimeChange={(value) => setForm((f) => withRequestDateTime(f, f.requestDate, value))}
                />
                <SearchEntry
                  className="request-head-row__refs"
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
                onNotify={onNotify}
                showSiteAction={canCreatePendingRefs ? !form.siteId : false}
                showIntervenantAction={canCreatePendingRefs ? !form.intervenantId : false}
              />
              </div>

              {/* PLANIFICATION */}
              <CreateFormSection title="Planification">
                <div className="gardiennage-planning-layout">
                  <div className="gardiennage-planning-layout__mode">
                    <div className="gardiennage-planning-mode">
                      <span className="gardiennage-validity-lead">Type</span>
                      <select
                        value={planningMode}
                        disabled={isSaving || isAnnule || isReadOnlyByRole}
                        onChange={(e) => applyPlanningMode(e.target.value as GardiennagePlanningFormMode)}
                      >
                        <option value="recurring">Planification libre</option>
                        <option value="ponctuel">Journée unique</option>
                        <option value="h24">H24</option>
                      </select>
                    </div>
                  </div>

                  <div className="gardiennage-planning-layout__validity">
                    {planningMode === "ponctuel" && (
                      <div className="gardiennage-planning-validity">
                        <span className="gardiennage-validity-lead">Validité</span>
                        <label className="gardiennage-date-field">
                          <span className="gardiennage-date-label">Date</span>
                          <DateInput
                            value={form.validFromDate}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(e) => setForm((f) => withValidFromDateTime(f, e.target.value, f.validFromTime))}
                          />
                        </label>
                        <span className="gardiennage-date-sep">de</span>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Début</span>
                          <TimeInput
                            value={form.validFromTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(value) => setForm((f) => withValidFromDateTime(f, f.validFromDate, value))}
                          />
                        </label>
                        <span className="gardiennage-date-sep">à</span>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Fin</span>
                          <TimeInput
                            value={form.validToTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(value) => setForm((f) => ({ ...f, validToTime: value }))}
                          />
                        </label>
                      </div>
                    )}

                    {planningMode === "h24" && (
                      <div className="gardiennage-planning-validity">
                        <span className="gardiennage-validity-lead">Validité du</span>
                        <label className="gardiennage-date-field">
                          <span className="gardiennage-date-label">Date</span>
                          <DateInput
                            value={form.validFromDate}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(e) => setForm((f) => withValidFromDateTime(f, e.target.value, f.validFromTime))}
                          />
                        </label>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Heure</span>
                          <TimeInput
                            value={form.validFromTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(value) => setForm((f) => withValidFromDateTime(f, f.validFromDate, value))}
                          />
                        </label>
                        <span className="gardiennage-date-sep">au</span>
                        <label className="gardiennage-date-field">
                          <span className="gardiennage-date-label">Date fin</span>
                          <DateInput
                            value={form.validToDate}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            min={form.validFromDate || undefined}
                            aria-label="Date de fin (optionnelle)"
                            onChange={(e) => setForm((f) => ({ ...f, validToDate: e.target.value }))}
                          />
                        </label>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Heure fin</span>
                          <TimeInput
                            value={form.validToTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            aria-label="Heure de fin (optionnelle)"
                            onChange={(value) => setForm((f) => ({ ...f, validToTime: value }))}
                          />
                        </label>
                      </div>
                    )}

                    {planningMode === "recurring" && (
                      <div className="gardiennage-planning-validity">
                        <span className="gardiennage-validity-lead">Validité du</span>
                        <label className="gardiennage-date-field">
                          <span className="gardiennage-date-label">Date</span>
                          <DateInput
                            value={form.validFromDate}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(e) => setForm((f) => withValidFromDateTime(f, e.target.value, f.validFromTime))}
                          />
                        </label>
                        <span className="gardiennage-date-sep">au</span>
                        <label className="gardiennage-date-field">
                          <span className="gardiennage-date-label">Date</span>
                          <DateInput
                            value={form.validToDate}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            min={form.validFromDate || undefined}
                            required
                            aria-required="true"
                            aria-label="Date de fin de validité (obligatoire)"
                            onChange={(e) => setForm((f) => ({ ...f, validToDate: e.target.value }))}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {planningMode === "ponctuel" && ponctuelCrossesMidnight && (
                  <p className="muted mc-ref-hint">La fin est le lendemain (passage après minuit géré automatiquement).</p>
                )}
                {!isCreateMode && entry?.planningBatchId && entry.planningSnapshot && !isCloture && !isAnnule && (
                  <p className="muted mc-ref-hint" role="note">
                    La modification resynchronise tous les créneaux du lot non clôturés. Les créneaux déjà clôturés ne sont pas modifiés.
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
                        const nextLabel = `Ligne ${f.planningLines.length + 1}`;
                        return {
                          ...f,
                          planningLines: syncGardiennagePlanningLineLabels([
                            createDefaultLine(nextLabel),
                            ...f.planningLines
                          ])
                        };
                      })}
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  )}
                >
                  <div className="gardiennage-planning-lines">
                    {form.planningLines.map((line, index) => {
                      const displayNumber = gardiennagePlanningLineDisplayNumber(index, form.planningLines.length);
                      const isNewest = index === 0;
                      return (
                      <fieldset
                        key={line.id}
                        ref={isNewest ? newestLineRef : undefined}
                        className={[
                          "gardiennage-planning-line",
                          highlightNewestLineId === line.id ? "gardiennage-planning-line--just-added" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <legend className="gardiennage-planning-line__legend">
                          <span className="gardiennage-planning-line__legend-label">Ligne {displayNumber}</span>
                          <button
                            type="button"
                            className="btn-danger action-icon-btn gardiennage-planning-line__remove"
                            disabled={isSaving || isAnnule || isReadOnlyByRole || form.planningLines.length === 1}
                            title={form.planningLines.length === 1 ? "Au moins une ligne de planification est requise" : "Supprimer cette ligne"}
                            aria-label={form.planningLines.length === 1 ? "Suppression impossible : une seule ligne" : `Supprimer la ligne ${displayNumber}`}
                            onClick={() => {
                              if (form.planningLines.length <= 1) return;
                              setForm((f) => ({
                                ...f,
                                planningLines: syncGardiennagePlanningLineLabels(
                                  f.planningLines.filter((it) => it.id !== line.id)
                                )
                              }));
                            }}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </legend>
                      <div className="gardiennage-horaires-row" style={{ alignItems: "end" }}>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Début</span>
                          <TimeInput
                            value={line.startTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(value) => setForm((f) => ({
                              ...f,
                              planningLines: f.planningLines.map((it) => it.id === line.id ? { ...it, startTime: value } : it)
                            }))}
                          />
                        </label>
                        <label className="gardiennage-time-field">
                          <span className="gardiennage-date-label">Fin</span>
                          <TimeInput
                            value={line.endTime}
                            disabled={isSaving || isAnnule || isReadOnlyByRole}
                            onChange={(value) => setForm((f) => ({
                              ...f,
                              planningLines: f.planningLines.map((it) => it.id === line.id ? { ...it, endTime: value } : it)
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
                          <DateInput
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
                        lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
                        onChange={(patch) => setForm((f) => ({
                          ...f,
                          planningLines: f.planningLines.map((it) => (it.id === line.id ? { ...it, ...patch } : it))
                        }))}
                      />
                      </fieldset>
                      );
                    })}
                  </div>
                  {linesOverlapError && (
                    <p className="mc-ref-hint text-error">
                      {linesOverlapError}
                    </p>
                  )}
                </CreateFormSection>
              )}

              <GardiennagePlanningLinesRecap
                mode={planningMode}
                isEdit={!isCreateMode}
                lines={form.planningLines}
                lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
                validFromDate={form.validFromDate}
                validFromTime={form.validFromTime}
                validToDate={
                  planningMode === "ponctuel"
                    ? form.validFromDate
                    : planningMode === "h24" && !form.validToDate.trim()
                      ? ""
                      : form.validToDate
                }
                validToTime={form.validToTime}
                perLineCounts={previewPerLineCounts}
                totalSlots={previewSlots.length}
                totalMinutesLabel={formatDurationMinutes(previewTotalMinutes)}
                closedSlotsCount={previewClosedSlotsCount}
                openEnded={planningMode === "h24" && !form.validToDate.trim()}
                openEndedHorizonDays={GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS}
              />

              {/* CONSIGNE */}
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
                      disabled={isSaving || isAnnule || isReadOnlyByRole}
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
                      disabled={isSaving || isAnnule || isCloture || isReadOnlyByRole}
                      compact
                    />
                  ) : null}
                </div>
                {extras.requestDefs.length > 1 ? (
                  <FormVariableFields
                    defs={extras.requestDefs}
                    values={extras.values}
                    onValuesChange={extras.setValues}
                    disabled={isSaving || isAnnule || isCloture || isReadOnlyByRole}
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
