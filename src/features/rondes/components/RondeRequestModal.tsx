/**
 * Modale de demande de ronde (planifiée, urgence, lot exceptionnel, snapshot planning).
 *
 * Effets de formulaire : `[isOpen, mode]` création ; `[isOpen, mode, entry?.id]` édition.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import { SiteSearchInput } from "../../mainCourante/components/SiteSearchInput";
import { formatSiteSelectedLabel } from "../../mainCourante/model/siteSearch";
import { IntervenantSearchInput } from "../../intervention/components/IntervenantSearchInput";
import type { RondeEntry, RondeMotifTypeRef, RondeOriginKind } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import type {
  RondePlannedProfileLinePayload,
  RondePlannedProfilePayload,
  RondePlannedProfileRef,
  RondePlannedProfileLineRef
} from "../model/rondePlanned.types";
import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT, type RondePlannedRoundKind } from "../model/rondePlanned.types";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { PendingSiteIntervenantRefActions } from "../../common/components/PendingSiteIntervenantRefActions";
import { RondeLinkedBatchPanel } from "./RondeLinkedBatchPanel";
import { addDaysIso, dateIsoToWeekdayMask, generateRandomSlotSpecs } from "../model/rondePlannedSlotEngine";
import { formatLocalDateIso, formatLocalTimeHm } from "../model/rondeCalendarLocal";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";

type RondeRequestModalProps = {
  isOpen: boolean;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  holidays?: HolidayRef[];
  rondeMotifs: RondeMotifTypeRef[];
  requesterRole?: Role;
  /** Profil à éditer — si fourni, la modale s'ouvre en mode édition */
  editProfile?: RondePlannedProfileRef | null;
  onClose: () => void;
  onNotify?: (message: string) => void;
  /** Crée ou met à jour un profil de planification (avec `id` en édition) */
  onCreateProfile: (payload: RondePlannedProfilePayload & { autoValidate?: boolean }) => Promise<void> | void;
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
  initialIntervenantId?: string | null;
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
  bulkCancelLinkedBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; cancelledCount: number; skippedCount: number } | null>;
  bulkDeleteLinkedBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; deletedCount: number } | null>;
  onOpenLinkedBatchRonde?: (entry: RondeEntry) => void;
  onCreatePendingSite?: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant?: (name: string) => Promise<boolean>;
};

export type RequestOrigin = "CONTRAT" | "APPEL_CLIENT" | "SUITE_INTERVENTION" | "AUTRE";
type RoundKind = "OPENING" | "CLOSING" | "ACCOMPAGNEMENT" | "RANDOM";

function mapRequestOriginToApiKind(origin: RequestOrigin): RondeOriginKind {
  if (origin === "APPEL_CLIENT") return "CLIENT";
  if (origin === "CONTRAT") return "TELESURVEILLANCE";
  return "AUTRE";
}

function lineRefToDraft(line: RondePlannedProfileLineRef): LineDraft {
  const rk: RoundKind =
    line.roundKind === "OPENING" || line.roundKind === "CLOSING" || line.roundKind === "ACCOMPAGNEMENT" || line.roundKind === "RANDOM"
      ? line.roundKind
      : "RANDOM";
  return {
    id: line.id,
    roundKind: rk,
    requestedTime: line.requestedTime ?? "",
    randomWindowStart: line.randomWindowStart ?? "",
    randomWindowEnd: line.randomWindowEnd ?? "",
    randomRoundsCount: line.randomRoundsCount != null ? String(line.randomRoundsCount) : "",
    intervalHours: line.intervalMinutes != null ? String(line.intervalMinutes / 60) : "",
    intervalEndTime: "23:59",
    weekdaysMask: line.weekdaysMask,
    includeHolidays: Boolean(line.includeHolidays),
    includeHolidayEves: Boolean(line.includeHolidayEves)
  };
}

type LineDraft = {
  id: string;
  roundKind: RoundKind;
  requestedTime: string;
  randomWindowStart: string;
  randomWindowEnd: string;
  randomRoundsCount: string;
  intervalHours: string;
  intervalEndTime: string;
  weekdaysMask: number;
  includeHolidays: boolean;
  includeHolidayEves: boolean;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function hhmmToMinutes(time: string): number {
  const value = String(time || "").trim();
  if (!TIME_RE.test(value)) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function formatMinutesAsTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isWeekdayEnabled(weekdaysMask: number, dateIso: string): boolean {
  if (!Number.isFinite(Number(weekdaysMask)) || Number(weekdaysMask) <= 0) return true;
  return (Number(weekdaysMask) & dateIsoToWeekdayMask(dateIso)) !== 0;
}

function enumerateDatesInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cursor = startIso;
  while (cursor <= endIso) {
    out.push(cursor);
    cursor = addDaysIso(cursor, 1);
    if (out.length > 5000) break;
  }
  return out;
}

function holidayMatchers(holidays: HolidayRef[] | undefined) {
  const set = new Set((holidays || []).map((h) => String(h.dateIso || "").trim()).filter(Boolean));
  return {
    isHoliday: (iso: string) => set.has(String(iso || "").trim()),
    isHolidayEve: (iso: string) => set.has(addDaysIso(String(iso || "").trim(), 1))
  };
}

function buildIntervalTimesAcrossValidity(
  startIso: string,
  startTime: string,
  endIso: string,
  endTime: string,
  intervalMinutes: number,
  anchor?: { demandDateIso: string; demandTimeHm: string } | null
): Array<{ requestDate: string; requestedTime: string }> {
  const safeInterval = Math.max(1, Math.round(intervalMinutes));
  const startTrim = String(startIso || "").trim();
  const startTimeTrim = TIME_RE.test(String(startTime || "").trim()) ? String(startTime).trim() : "00:00";
  const endTrim = String(endIso || "").trim();
  const endTimeTrim = TIME_RE.test(String(endTime || "").trim()) ? String(endTime).trim() : "23:59";
  const anchorDate = anchor?.demandDateIso?.trim();
  const anchorTime = anchor?.demandTimeHm?.trim();
  const useAnchor = Boolean(
    anchorDate &&
      anchorDate === startTrim &&
      anchorTime &&
      TIME_RE.test(anchorTime)
  );
  const periodStartCandidate = useAnchor ? new Date(`${startTrim}T${anchorTime}:00`) : new Date(`${startTrim}T${startTimeTrim}:00`);
  let periodStartMs = periodStartCandidate.getTime();
  if (Number.isNaN(periodStartMs)) {
    periodStartMs = new Date(`${startTrim}T${startTimeTrim}:00`).getTime();
  }
  const periodStart = new Date(periodStartMs);
  const periodEnd = new Date(`${endTrim}T${endTimeTrim}:00`);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return [];
  }
  const out: Array<{ requestDate: string; requestedTime: string }> = [];
  const cursor = new Date(periodStart.getTime());
  let safety = 0;
  while (cursor <= periodEnd && safety < 2000) {
    out.push({
      requestDate: formatLocalDateIso(cursor),
      requestedTime: `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`
    });
    cursor.setMinutes(cursor.getMinutes() + safeInterval);
    safety += 1;
  }
  return out;
}

function parseDateTimeSafeMs(dateIso: string, hhmm: string): number | null {
  const d = new Date(`${String(dateIso || "").trim()}T${String(hhmm || "").trim()}:00`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Contexte français pour traces / observations (date + heure de la demande). */
function formatDemandeEmiseContext(dateIso: string, timeHm: string): string {
  const trimmed = String(dateIso || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
    : new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const dateFr = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const t = String(timeHm || "").trim();
  return t ? `Demande émise le ${dateFr} à ${t}` : `Demande émise le ${dateFr}`;
}

const WEEKDAY_BITS = [
  { bit: 1, label: "Lun" },
  { bit: 2, label: "Mar" },
  { bit: 4, label: "Mer" },
  { bit: 8, label: "Jeu" },
  { bit: 16, label: "Ven" },
  { bit: 32, label: "Sam" },
  { bit: 64, label: "Dim" }
] as const;

export function RondeRequestModal(props: RondeRequestModalProps) {
  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [intervenantId, setIntervenantId] = useState("");
  const [motifTypeId, setMotifTypeId] = useState("");
  const [origin, setOrigin] = useState<RequestOrigin>("CONTRAT");
  const [consigne, setConsigne] = useState("");
  const [motifDetail, setMotifDetail] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validFromTime, setValidFromTime] = useState("");
  const [validTo, setValidTo] = useState("");
  const [validToTime, setValidToTime] = useState("");
  const [isSingleDay, setIsSingleDay] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const [showPendingIntervenantForm, setShowPendingIntervenantForm] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingIntervenantName, setPendingIntervenantName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(props.editProfile);
  const isManager = props.requesterRole === "RESPONSABLE" || props.requesterRole === "DEV";
  const linkedBatchSig = useMemo(
    () => (props.linkedBatchEntries ?? []).map((e) => `${e.id}:${e.updatedAt}`).join("|"),
    [props.linkedBatchEntries]
  );
  const isLinkedExistingBatch = Boolean(
    props.onSaveLinkedBatch && props.linkedBatchEntries && props.linkedBatchEntries.length > 0
  );

  const selectedSite = useMemo(() => (siteId ? props.sites.find((s) => s.id === siteId) ?? null : null), [siteId, props.sites]);
  const selectedIntervenant = useMemo(
    () => (intervenantId ? props.intervenants.find((i) => i.id === intervenantId) ?? null : null),
    [intervenantId, props.intervenants]
  );
  const selectedMotifMeta = useMemo(
    () => props.rondeMotifs.find((m) => m.id === motifTypeId) ?? null,
    [props.rondeMotifs, motifTypeId]
  );

  useEffect(() => {
    if (!props.isOpen) return;
    const today = formatLocalDateIso(new Date());
    const nowHm = formatLocalTimeHm(new Date());

    if (isEdit && props.editProfile) {
      /* Pré-remplissage depuis le profil existant */
      const ep = props.editProfile;
      setRequestDate(today);
      setRequestTime(nowHm);
      setSiteId(ep.siteId ?? null);
      setIntervenantId(ep.intervenantId ?? "");
      setMotifTypeId(props.rondeMotifs[0]?.id ?? "");
      setOrigin("CONTRAT");
      setConsigne(ep.notes ?? "");
      setMotifDetail("");
      setValidFrom(ep.planningValidFrom ?? today);
      setValidFromTime(nowHm);
      setValidTo(ep.planningValidTo ?? "");
      setValidToTime("23:59");
      setIsSingleDay(Boolean(ep.planningValidFrom && ep.planningValidTo && ep.planningValidFrom === ep.planningValidTo));
      setLines(ep.lines.length ? ep.lines.map(lineRefToDraft) : [{
        id: crypto?.randomUUID?.() ?? `line-${Date.now()}-1`,
        roundKind: "OPENING",
        requestedTime: "08:00",
        randomWindowStart: "",
        randomWindowEnd: "",
        randomRoundsCount: "",
        intervalHours: "",
        intervalEndTime: "23:59",
        weekdaysMask: 0,
        includeHolidays: false,
        includeHolidayEves: false
      }]);
    } else if (!isEdit && props.replayPlanningSnapshot?.version === 1) {
      const s = props.replayPlanningSnapshot;
      setRequestDate(String(s.requestDate || "").trim() || today);
      {
        const rt = String(s.requestTime ?? "").trim();
        setRequestTime(TIME_RE.test(rt) ? rt : "00:00");
      }
      setValidFrom(String(s.validFrom || "").trim() || today);
      {
        const vft = String(s.validFromTime ?? "").trim();
        setValidFromTime(TIME_RE.test(vft) ? vft : (String(s.requestTime ?? "").trim() || "00:00"));
      }
      setValidTo(String(s.validTo || "").trim() || "");
      {
        const vtt = String(s.validToTime ?? "").trim();
        setValidToTime(TIME_RE.test(vtt) ? vtt : "23:59");
      }
      setSiteId(s.siteId ?? null);
      setIntervenantId(String(s.intervenantId || "").trim());
      setMotifTypeId(String(s.motifTypeId || "").trim() || (props.rondeMotifs[0]?.id ?? ""));
      const replayOriginFallback: RequestOrigin =
        s.origin === "CONTRAT" ||
        s.origin === "APPEL_CLIENT" ||
        s.origin === "SUITE_INTERVENTION" ||
        s.origin === "AUTRE"
          ? s.origin
          : "AUTRE";
      setOrigin(props.fixedOrigin ?? replayOriginFallback);
      setConsigne(s.consigne ?? "");
      {
        const md = String(props.linkedBatchEntries?.[0]?.motifDetail ?? "").trim();
        setMotifDetail(md);
      }
      const snapLines = Array.isArray(s.lines) && s.lines.length ? s.lines : [];
      setLines(
        snapLines.length > 0
          ? snapLines.map((ln, idx) => {
              const rk: RoundKind =
                ln.roundKind === "OPENING" || ln.roundKind === "CLOSING" || ln.roundKind === "ACCOMPAGNEMENT" || ln.roundKind === "RANDOM"
                  ? ln.roundKind
                  : "RANDOM";
              return {
                id: crypto?.randomUUID?.() ?? `replay-${Date.now()}-${idx}`,
                roundKind: rk,
                requestedTime: String(ln.requestedTime ?? ""),
                randomWindowStart: String(ln.randomWindowStart ?? ""),
                randomWindowEnd: String(ln.randomWindowEnd ?? ""),
                randomRoundsCount: String(ln.randomRoundsCount ?? ""),
                intervalHours: String(ln.intervalHours ?? ""),
                intervalEndTime: String(ln.intervalEndTime ?? "").trim() || "23:59",
                weekdaysMask: typeof ln.weekdaysMask === "number" ? ln.weekdaysMask : Number(ln.weekdaysMask) || 0,
                includeHolidays: Boolean(ln.includeHolidays),
                includeHolidayEves: Boolean(ln.includeHolidayEves)
              };
            })
          : [
              {
                id: crypto?.randomUUID?.() ?? `line-${Date.now()}-1`,
                roundKind: "OPENING",
                requestedTime: "08:00",
                randomWindowStart: "",
                randomWindowEnd: "",
                randomRoundsCount: "",
                intervalHours: "",
                intervalEndTime: "23:59",
                weekdaysMask: 0,
                includeHolidays: false,
                includeHolidayEves: false
              }
            ]
      );
      setIsSingleDay(Boolean(s.isSingleDay) || Boolean(s.validFrom && s.validTo && s.validFrom === s.validTo));
    } else {
      setRequestDate(props.initialRequestDate?.trim() || today);
      setRequestTime(nowHm);
      setValidFrom(today);
      setValidFromTime(nowHm);
      setValidTo("");
      setValidToTime("23:59");
      setSiteId(props.initialSiteId ?? null);
      setIntervenantId(props.initialIntervenantId ?? "");
      setMotifTypeId(props.initialMotifTypeId?.trim() || (props.rondeMotifs[0]?.id ?? ""));
      setOrigin(props.fixedOrigin ?? "CONTRAT");
      setConsigne(props.initialConsigne ?? "");
      setMotifDetail("");
      setLines([
        {
          id: crypto?.randomUUID?.() ?? `line-${Date.now()}-1`,
          roundKind: "OPENING",
          requestedTime: "08:00",
          randomWindowStart: "",
          randomWindowEnd: "",
          randomRoundsCount: "",
          intervalHours: "",
          intervalEndTime: "23:59",
          weekdaysMask: 0,
          includeHolidays: false,
          includeHolidayEves: false
        }
      ]);
      setIsSingleDay(false);
    }
    setError("");
    setSubmitting(false);
    setShowPendingSiteForm(false);
    setShowPendingIntervenantForm(false);
    setPendingCode("");
    setPendingName("");
    setPendingIntervenantName("");
  }, [
    props.isOpen,
    props.editProfile?.id,
    props.rondeMotifs,
    props.fixedOrigin,
    props.initialRequestDate,
    props.initialMotifTypeId,
    props.initialConsigne,
    props.initialSiteId,
    props.initialIntervenantId,
    props.replayPlanningSnapshot,
    linkedBatchSig,
    isEdit
  ]);

  const isContract = origin === "CONTRAT";
  const canCreatePendingRefs = Boolean(props.onCreatePendingSite && props.onCreatePendingIntervenant);
  const holidayMatch = holidayMatchers(props.holidays);

  const lineAppliesOnDate = (line: LineDraft, dateIso: string) => {
    if (isWeekdayEnabled(line.weekdaysMask, dateIso)) return true;
    if (line.includeHolidays && holidayMatch.isHoliday(dateIso)) return true;
    if (line.includeHolidayEves && holidayMatch.isHolidayEve(dateIso)) return true;
    return false;
  };

  const updateLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() ?? `line-${Date.now()}-${prev.length + 1}`,
        roundKind: "OPENING",
        requestedTime: "08:00",
        randomWindowStart: "",
        randomWindowEnd: "",
        randomRoundsCount: "",
        intervalHours: "",
        intervalEndTime: "23:59",
        weekdaysMask: 0,
        includeHolidays: false,
        includeHolidayEves: false
      }
    ]);
  };

  const buildExceptionalGeneratedItems = () => {
    const rangeEndIso = validTo.trim() || validFrom.trim();
    const safeFrom = validFrom.trim();
    if (!safeFrom || !rangeEndIso || rangeEndIso < safeFrom) {
      return { items: [] as Array<{ requestDate: string; requestedTime: string; lineIndex: number }>, perLine: [] as number[] };
    }
    const fromTimeNorm = TIME_RE.test(validFromTime.trim()) ? validFromTime.trim() : "00:00";
    const toTimeNorm = TIME_RE.test(validToTime.trim()) ? validToTime.trim() : "23:59";
    const validityStartMs = parseDateTimeSafeMs(safeFrom, fromTimeNorm);
    const validityEndMs = parseDateTimeSafeMs(rangeEndIso, toTimeNorm);
    if (validityStartMs == null || validityEndMs == null || validityEndMs < validityStartMs) {
      return { items: [] as Array<{ requestDate: string; requestedTime: string; lineIndex: number }>, perLine: [] as number[] };
    }
    const dateAnchors = enumerateDatesInclusive(safeFrom, rangeEndIso);
    const items: Array<{ requestDate: string; requestedTime: string; lineIndex: number }> = [];
    const perLine = lines.map(() => 0);
    const pushIfInValidity = (requestDateIso: string, requestedTimeHm: string, lineIndex: number) => {
      const timeNorm = TIME_RE.test(String(requestedTimeHm || "").trim()) ? String(requestedTimeHm).trim() : "00:00";
      const ms = parseDateTimeSafeMs(requestDateIso, timeNorm);
      if (ms == null || ms < validityStartMs || ms > validityEndMs) return;
      items.push({ requestDate: requestDateIso, requestedTime: requestedTimeHm, lineIndex });
      perLine[lineIndex] += 1;
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const ln = lines[lineIndex];
      if (ln.roundKind !== "RANDOM") {
        for (const dayIso of dateAnchors) {
          if (!lineAppliesOnDate(ln, dayIso)) continue;
          pushIfInValidity(dayIso, ln.requestedTime.trim(), lineIndex);
        }
        continue;
      }

      const intervalMinutes = ln.intervalHours.trim()
        ? Math.max(1, Math.round(Number(ln.intervalHours) * 60))
        : null;
      const roundsCount = ln.randomRoundsCount.trim()
        ? Math.max(1, Math.round(Number(ln.randomRoundsCount)))
        : null;
      const hasCompleteWindow = Boolean(ln.randomWindowStart.trim() && ln.randomWindowEnd.trim());

      if (hasCompleteWindow) {
        const lineRef: RondePlannedProfileLineRef = {
          id: ln.id,
          profileId: "__request__",
          sortOrder: lineIndex,
          roundKind: "RANDOM",
          recurrenceKind: "WEEKLY",
          weekdaysMask: ln.weekdaysMask,
          monthDay: null,
          requestedTime: null,
          intervalMinutes,
          randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
          randomWindowStart: ln.randomWindowStart.trim(),
          randomWindowEnd: ln.randomWindowEnd.trim(),
          randomRoundsCount: roundsCount,
          includeHolidays: Boolean(ln.includeHolidays),
          includeHolidayEves: Boolean(ln.includeHolidayEves),
          rangeStartDate: null,
          rangeEndDate: null,
          motifTypeId,
          motifTypeLabel: null,
          createdAt: "",
          updatedAt: ""
        };
        for (const dayIso of dateAnchors) {
          if (!lineAppliesOnDate(ln, dayIso)) continue;
          const specs = generateRandomSlotSpecs(lineRef, dayIso);
          for (const spec of specs) {
            pushIfInValidity(spec.calendarDateIso, spec.requestedTime ?? "", lineIndex);
          }
        }
        continue;
      }

      if (intervalMinutes != null) {
        const endTime = ln.intervalEndTime.trim() || "23:59";
        const intervalAnchor =
          requestDate.trim() === validFrom.trim()
            ? { demandDateIso: requestDate.trim(), demandTimeHm: (requestTime.trim() || "00:00") }
            : null;
        const intervalSlots = buildIntervalTimesAcrossValidity(
          validFrom.trim(),
          fromTimeNorm,
          rangeEndIso,
          toTimeNorm,
          intervalMinutes,
          intervalAnchor
        );
        for (const slot of intervalSlots) {
          if (!lineAppliesOnDate(ln, slot.requestDate)) continue;
          pushIfInValidity(slot.requestDate, slot.requestedTime, lineIndex);
        }
        continue;
      }

      if (roundsCount != null) {
        for (const dayIso of dateAnchors) {
          if (!lineAppliesOnDate(ln, dayIso)) continue;
          const maxMinute = dayIso === rangeEndIso && ln.intervalEndTime.trim()
            ? hhmmToMinutes(ln.intervalEndTime.trim())
            : (23 * 60) + 59;
          const span = Math.max(0, maxMinute);
          for (let i = 0; i < roundsCount; i += 1) {
            const minute = roundsCount <= 1 ? 0 : Math.round((i * span) / (roundsCount - 1));
            pushIfInValidity(dayIso, formatMinutesAsTime(minute), lineIndex);
          }
        }
        continue;
      }

      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso)) continue;
        pushIfInValidity(dayIso, "", lineIndex);
      }
    }

    return { items, perLine };
  };

  const exceptionalPreview = useMemo(
    () =>
      !isContract && !isEdit && !isLinkedExistingBatch
        ? buildExceptionalGeneratedItems()
        : { items: [], perLine: [] },
    [isContract, isEdit, isLinkedExistingBatch, lines, validFrom, validFromTime, validTo, validToTime, motifTypeId, props.holidays, requestDate, requestTime]
  );

  useEffect(() => {
    if (!isSingleDay) return;
    if (!validFrom.trim()) return;
    if (validTo === validFrom) return;
    setValidTo(validFrom);
  }, [isSingleDay, validFrom, validTo]);

  if (!props.isOpen) return null;

  const onSubmit = async () => {
    setError("");
    const effectiveValidTo = isSingleDay ? validFrom.trim() : validTo.trim();
    const linesForSubmit = isSingleDay
      ? lines.map((line) => ({ ...line, weekdaysMask: 0, includeHolidays: true, includeHolidayEves: true }))
      : lines;
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
    const requestTimeNorm = requestTime.trim() || "00:00";
    if (!TIME_RE.test(requestTimeNorm)) return setError("Indiquez une heure de demande valide (HH:mm).");
    if (!validFrom.trim()) return setError("La date de début de validité est obligatoire.");
    const validFromTimeNorm = TIME_RE.test(validFromTime.trim()) ? validFromTime.trim() : "00:00";
    const validToTimeNorm = TIME_RE.test(validToTime.trim()) ? validToTime.trim() : "23:59";
    const validStartMs = parseDateTimeSafeMs(validFrom.trim(), validFromTimeNorm);
    const validEndMs = parseDateTimeSafeMs(effectiveValidTo || validFrom.trim(), validToTimeNorm);
    if (validStartMs == null || validEndMs == null || validEndMs < validStartMs) {
      return setError("La période de validité est invalide (date/heure de fin < date/heure de début).");
    }
    if (!linesForSubmit.length) return setError("Ajoutez au moins une ligne de planification.");

    for (let i = 0; i < linesForSubmit.length; i += 1) {
      const ln = linesForSubmit[i];
      if (ln.roundKind !== "RANDOM" && !ln.requestedTime.trim()) {
        return setError(`Ligne ${i + 1}: heure demandée obligatoire.`);
      }
      if (ln.roundKind === "RANDOM") {
        const hasWindow = Boolean(ln.randomWindowStart.trim() || ln.randomWindowEnd.trim());
        if (hasWindow && (!ln.randomWindowStart.trim() || !ln.randomWindowEnd.trim())) {
          return setError(`Ligne ${i + 1}: renseignez les 2 bornes de la fenêtre horaire.`);
        }
        if (
          !isContract &&
          !isEdit &&
          ln.intervalHours.trim() &&
          !ln.randomWindowStart.trim() &&
          !ln.randomWindowEnd.trim()
        ) {
          if (!effectiveValidTo.trim()) {
            return setError(`Ligne ${i + 1}: avec un intervalle sans fenêtre, renseignez une date de fin de validité.`);
          }
          if (!ln.intervalEndTime.trim()) {
            return setError(`Ligne ${i + 1}: indiquez l'heure de fin de validité.`);
          }
        }
      }
    }

    setSubmitting(true);
    try {
      /* Mise à jour d'un lot exceptionnel existant (même modale + fiches en dessous) */
      if (isLinkedExistingBatch && props.onSaveLinkedBatch && props.linkedBatchEntries?.length && !isEdit) {
        const mappedOriginKind = mapRequestOriginToApiKind(origin);
        const originDetail =
          origin === "SUITE_INTERVENTION" ? `Suite intervention. ${consigne.trim()}`.trim() : consigne.trim();
        const fromIntervention = origin === "SUITE_INTERVENTION" && Boolean(props.initialInterventionId);
        const planningSnapshotPayload: RondePlanningSnapshotV1 = {
          version: 1,
          requestDate: requestDate.trim(),
          requestTime: requestTimeNorm,
          validFrom: validFrom.trim(),
          validFromTime: validFromTimeNorm,
          validTo: effectiveValidTo,
          validToTime: validToTimeNorm,
          isSingleDay,
          origin,
          motifTypeId: motifTypeId.trim(),
          consigne: consigne.trim(),
          siteId: selectedSite?.id ?? null,
          intervenantId: selectedIntervenant?.id ?? null,
          createRoundsEnabled: true,
          lines: linesForSubmit.map((ln) => ({
            roundKind: ln.roundKind,
            requestedTime: ln.requestedTime,
            randomWindowStart: ln.randomWindowStart,
            randomWindowEnd: ln.randomWindowEnd,
            randomRoundsCount: ln.randomRoundsCount,
            intervalHours: ln.intervalHours,
            intervalEndTime: ln.intervalEndTime,
            weekdaysMask: ln.weekdaysMask,
            includeHolidays: ln.includeHolidays,
            includeHolidayEves: ln.includeHolidayEves
          })),
          originInterventionId: fromIntervention ? props.initialInterventionId ?? null : null
        };
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
        const originDetail = origin === "SUITE_INTERVENTION" ? `Suite intervention. ${consigne}`.trim() : consigne.trim();
        const fromIntervention = origin === "SUITE_INTERVENTION" && Boolean(props.initialInterventionId);
        const payloads = exceptionalPreview.items.map((item) => ({ requestDate: item.requestDate, requestedTime: item.requestedTime }));

        if (!payloads.length) {
          return setError("Aucune ronde n'a été générée avec les paramètres saisis.");
        }

        const planningSnapshotPayload: RondePlanningSnapshotV1 = {
          version: 1,
          requestDate: requestDate.trim(),
          requestTime: requestTimeNorm,
          validFrom: validFrom.trim(),
          validFromTime: validFromTimeNorm,
          validTo: effectiveValidTo,
          validToTime: validToTimeNorm,
          isSingleDay,
          origin,
          motifTypeId: motifTypeId.trim(),
          consigne: consigne.trim(),
          siteId: selectedSite?.id ?? null,
          intervenantId: selectedIntervenant?.id ?? null,
          createRoundsEnabled: true,
          lines: linesForSubmit.map((ln) => ({
            roundKind: ln.roundKind,
            requestedTime: ln.requestedTime,
            randomWindowStart: ln.randomWindowStart,
            randomWindowEnd: ln.randomWindowEnd,
            randomRoundsCount: ln.randomRoundsCount,
            intervalHours: ln.intervalHours,
            intervalEndTime: ln.intervalEndTime,
            weekdaysMask: ln.weekdaysMask,
            includeHolidays: ln.includeHolidays,
            includeHolidayEves: ln.includeHolidayEves
          })),
          originInterventionId: fromIntervention ? props.initialInterventionId ?? null : null
        };
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
            intervenantId: selectedIntervenant?.id ?? null,
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
      const profileLines: RondePlannedProfileLinePayload[] = linesForSubmit.map((ln) => {
        const intervalMinutes = ln.intervalHours.trim() ? Math.max(1, Math.round(Number(ln.intervalHours) * 60)) : null;
        const roundsCount = ln.randomRoundsCount.trim() ? Math.max(1, Math.round(Number(ln.randomRoundsCount))) : null;
        const hasWindow = Boolean(ln.randomWindowStart.trim() && ln.randomWindowEnd.trim());
        return {
          /* Conserver l'id de ligne pour ne pas désynchroniser les fiches planifiées */
          ...(ln.id ? { id: ln.id } : {}),
          roundKind: ln.roundKind,
          recurrenceKind: "WEEKLY",
          weekdaysMask: ln.weekdaysMask,
          monthDay: null,
          requestedTime: ln.roundKind === "RANDOM" ? "" : ln.requestedTime.trim(),
          intervalMinutes,
          motifTypeId: ln.roundKind === "RANDOM" ? motifTypeId : null,
          randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
          randomWindowStart: ln.roundKind === "RANDOM" && hasWindow ? ln.randomWindowStart.trim() : "",
          randomWindowEnd: ln.roundKind === "RANDOM" && hasWindow ? ln.randomWindowEnd.trim() : "",
          randomRoundsCount: ln.roundKind === "RANDOM" && !intervalMinutes ? roundsCount : null,
          includeHolidays: Boolean(ln.includeHolidays),
          includeHolidayEves: Boolean(ln.includeHolidayEves),
          rangeStartDate: null,
          rangeEndDate: null
        };
      });
      await Promise.resolve(
        props.onCreateProfile({
          /* Identifiant inclus en édition */
          ...(isEdit && props.editProfile ? { id: props.editProfile.id } : {}),
          label: selectedSite ? formatSiteSelectedLabel(selectedSite) : pendingSiteDisplay || "",
          siteId: selectedSite?.id ?? null,
          intervenantId: selectedIntervenant?.id ?? null,
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
      props.onClose();
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
              : isEdit
                ? "Modifier la programmation"
                : "Planifier une ronde"}
          </h3>
          <button type="button" className="mc-modal-close" onClick={props.onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="form">
          <div className="ronde-planned-profile-modal__date-range-row">
            <label>
              Date de la demande
              <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
            </label>
            <label>
              Heure de la demande
              <input type="time" step={60} value={requestTime} onChange={(e) => setRequestTime(e.target.value)} />
            </label>
          </div>
          <div className="ronde-planned-profile-modal__site-prest-row">
            <SiteSearchInput
              sites={props.sites}
              disabled={false}
              selectedSite={selectedSite}
              copyNotify={props.onNotify}
              onSelectedSiteChange={(s) => {
                setSiteId(s?.id ?? null);
                if (s) {
                  setShowPendingSiteForm(false);
                  setPendingCode("");
                  setPendingName("");
                }
              }}
            />
            <IntervenantSearchInput
              intervenants={props.intervenants}
              disabled={false}
              selectedIntervenant={selectedIntervenant}
              onSelectedIntervenantChange={(i) => {
                setIntervenantId(i?.id ?? "");
                if (i) {
                  setShowPendingIntervenantForm(false);
                  setPendingIntervenantName("");
                }
              }}
            />
          </div>
          {!isEdit && !isLinkedExistingBatch && !isContract && canCreatePendingRefs ? (
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
          <div className="ronde-planned-profile-line__grid-schedule">
            <label>
              Motif de la demande
              <select
                value={motifTypeId}
                disabled={isEdit || isLinkedExistingBatch}
                onChange={(e) => setMotifTypeId(e.target.value)}
              >
                {props.rondeMotifs.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            <label>
              Origine de la demande
              <select
                value={origin}
                disabled={Boolean(props.fixedOrigin || props.initialInterventionId)}
                onChange={(e) => setOrigin(e.target.value as RequestOrigin)}
              >
                <option value="CONTRAT">Contrat</option>
                <option value="APPEL_CLIENT">Clients</option>
                <option value="SUITE_INTERVENTION">Suite intervention</option>
                <option value="AUTRE">Autre</option>
              </select>
            </label>
          </div>
          <label>
            Consigne de ronde
            <textarea
              className="mc-textarea"
              rows={4}
              value={consigne}
              readOnly={isEdit || isLinkedExistingBatch}
              onChange={(e) => setConsigne(e.target.value)}
            />
          </label>
          {isLinkedExistingBatch ? (
            <label>
              Détail des modification
              <textarea
                className="mc-textarea"
                rows={3}
                value={motifDetail}
                onChange={(e) => setMotifDetail(e.target.value)}
                aria-label="Détail des modification"
              />
            </label>
          ) : null}
          <div className="ronde-planned-profile-modal__validity-inline">
            <span className="ronde-planned-profile-modal__validity-label">Validité - Du</span>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} aria-label="Date de début de validité" />
            <input
              type="time"
              step={60}
              value={validFromTime}
              onChange={(e) => setValidFromTime(e.target.value)}
              title="Heure de début (vide = 00:00)"
              aria-label="Heure de début de validité"
            />
            <span className="ronde-planned-profile-modal__validity-label">Au</span>
            <input
              type="date"
              value={isSingleDay ? (validFrom || validTo) : validTo}
              disabled={isSingleDay}
              onChange={(e) => setValidTo(e.target.value)}
              aria-label="Date de fin de validité"
            />
            <input
              type="time"
              step={60}
              value={validToTime}
              disabled={isSingleDay}
              onChange={(e) => setValidToTime(e.target.value)}
              title="Heure de fin (vide = 23:59)"
              aria-label="Heure de fin de validité"
            />
            <ToggleSwitch
              checked={isSingleDay}
              onChange={setIsSingleDay}
              label="Jour unique"
              labelFirst
            />
          </div>
          <div className="ronde-planned-profile-modal__lines-header">
            <span className="ronde-planned-profile-modal__lines-title">Lignes de planification</span>
            <button type="button" className="btn-light" onClick={addLine} title="Ajouter une ligne" aria-label="Ajouter une ligne">
              <Plus size={16} aria-hidden />
            </button>
          </div>
          {lines.map((line, index) => (
            <fieldset key={line.id} className="ronde-planned-profile-line">
              <legend className="ronde-planned-profile-line__legend">
                <span className="ronde-planned-profile-line__legend-label">Ligne {index + 1}</span>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className="btn-danger action-icon-btn ronde-planned-profile-line__remove"
                    title="Supprimer cette ligne"
                    aria-label="Supprimer cette ligne"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </legend>
              <div className="ronde-request-line-grid ronde-request-line-grid--two-columns">
                <label className="ronde-request-line-grid__round-kind">
                  Type de ronde
                  <select
                    value={line.roundKind}
                    onChange={(e) => {
                      const nextKind = e.target.value as RoundKind;
                      updateLine(index, { roundKind: nextKind });
                      if (nextKind === "ACCOMPAGNEMENT") setIsSingleDay(true);
                    }}
                  >
                    <option value="OPENING">Ouverture</option>
                    <option value="CLOSING">Fermeture</option>
                    <option value="ACCOMPAGNEMENT">Accompagnement</option>
                    <option value="RANDOM">Aléatoire</option>
                  </select>
                </label>
                <div className="ronde-request-line-grid__controls">
                  <div className="ronde-request-line-grid__row ronde-request-line-grid__row--first">
                    {line.roundKind !== "RANDOM" ? (
                      <label className="ronde-request-line-grid__field-large">
                        {line.roundKind === "OPENING" ? "Heure demandée" : "Heure demandée"}
                        <input type="time" step={60} value={line.requestedTime} onChange={(e) => updateLine(index, { requestedTime: e.target.value })} />
                      </label>
                    ) : (
                      <>
                        <label>
                          Intervalle (heures)
                          <input
                            type="number"
                            min={1}
                            value={line.intervalHours}
                            disabled={Boolean(line.randomRoundsCount)}
                            onChange={(e) => updateLine(index, { intervalHours: e.target.value })}
                          />
                        </label>
                        {!isContract ? (
                          <label>
                            Heure de fin
                            <input
                              type="time"
                              step={60}
                              value={line.intervalEndTime}
                              disabled={!line.intervalHours.trim() || Boolean(line.randomWindowStart.trim() && line.randomWindowEnd.trim())}
                              onChange={(e) => updateLine(index, { intervalEndTime: e.target.value })}
                            />
                          </label>
                        ) : null}
                      </>
                    )}
                  </div>
                  {line.roundKind === "RANDOM" ? (
                    <div className="ronde-request-line-grid__row ronde-request-line-grid__row--second">
                      <label>
                        Fenêtre de
                        <input type="time" step={60} value={line.randomWindowStart} onChange={(e) => updateLine(index, { randomWindowStart: e.target.value })} />
                      </label>
                      <label>
                        Fenêtre à
                        <input type="time" step={60} value={line.randomWindowEnd} onChange={(e) => updateLine(index, { randomWindowEnd: e.target.value })} />
                      </label>
                      <label>
                        Nombre de rondes
                        <input
                          type="number"
                          min={1}
                          value={line.randomRoundsCount}
                          disabled={Boolean(line.intervalHours)}
                          onChange={(e) => updateLine(index, { randomRoundsCount: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="ronde-planned-profile-line__weekday-toggles">
                <span className="muted" style={{ marginRight: 8 }}>L à D</span>
                {WEEKDAY_BITS.map((d) => (
                  <ToggleSwitch
                    key={d.bit}
                    checked={(line.weekdaysMask & d.bit) !== 0}
                    onChange={(next) =>
                      updateLine(index, { weekdaysMask: next ? line.weekdaysMask | d.bit : line.weekdaysMask & ~d.bit })
                    }
                    label={d.label}
                    labelFirst
                  />
                ))}
              </div>
              <div className="ronde-planned-profile-line__weekday-toggles">
                <span className="muted" style={{ marginRight: 8 }}>Jours spécifiques</span>
                <ToggleSwitch
                  checked={line.includeHolidayEves}
                  onChange={(next) => updateLine(index, { includeHolidayEves: next })}
                  label="Veille jour férié"
                  labelFirst
                />
                <ToggleSwitch
                  checked={line.includeHolidays}
                  onChange={(next) => updateLine(index, { includeHolidays: next })}
                  label="Jours fériés"
                  labelFirst
                />
              </div>
            </fieldset>
          ))}
          {!isContract && !isEdit && !isLinkedExistingBatch ? (
            <section className="panel" style={{ marginTop: 8, padding: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>Aperçu génération</div>
              {lines.map((_, index) => (
                <div key={`preview-line-${index}`} className="muted">
                  Ligne {index + 1}: {exceptionalPreview.perLine[index] ?? 0} ronde{(exceptionalPreview.perLine[index] ?? 0) > 1 ? "s" : ""}
                </div>
              ))}
              <div style={{ marginTop: 6, fontWeight: 600 }}>
                Total: {exceptionalPreview.items.length} ronde{exceptionalPreview.items.length > 1 ? "s" : ""}
              </div>
            </section>
          ) : null}
          {isLinkedExistingBatch &&
          props.requesterRole &&
          props.onOpenLinkedBatchRonde &&
          props.bulkCancelLinkedBatch &&
          props.linkedBatchEntries?.length ? (
            <RondeLinkedBatchPanel
              entries={props.linkedBatchEntries}
              onOpenRonde={props.onOpenLinkedBatchRonde}
              onNotify={props.onNotify}
              bulkCancelBatch={props.bulkCancelLinkedBatch}
              bulkDeleteBatch={props.bulkDeleteLinkedBatch}
              onBatchDestructiveDone={props.onClose}
            />
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="row-actions modal-actions ronde-request-modal__footer">
          <button type="button" className="btn-light" onClick={props.onClose}>Fermer</button>
          <div className="row-actions ronde-request-modal__footer-right">
            <button type="button" onClick={() => void onSubmit()} disabled={submitting}>
              {submitting
                ? "Enregistrement…"
                : isEdit
                  ? "Enregistrer"
                  : isLinkedExistingBatch
                    ? "Enregistrer les modifications du lot"
                    : "Créer"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
