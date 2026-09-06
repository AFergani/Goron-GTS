/**
 * Modale de demande de ronde (planifiée, urgence, lot exceptionnel, snapshot planning).
 *
 * Effets de formulaire : `[isOpen, mode]` création ; `[isOpen, mode, entry?.id]` édition.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import { IntervenantSearchInput } from "../../common/components/IntervenantSearchInput";
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
import { TimeInput } from "../../common/components/TimeInput";
import { PendingSiteIntervenantRefActions } from "../../common/components/PendingSiteIntervenantRefActions";
import { SearchEntry } from "../../common/components/SearchEntry";
import { RondeLinkedBatchPanel } from "./RondeLinkedBatchPanel";
import { addDaysIso, dateIsoToWeekdayMask, generateRandomSlotSpecs, inclusiveCalendarDayCount, weekdaysMaskForInclusiveDateRange } from "../model/rondePlannedSlotEngine";
import { formatLocalDateIso, formatLocalTimeHm } from "../model/rondeCalendarLocal";
import { formatRondePlannedLineSummary } from "../model/rondePlannedSummary";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { getDefaultSystemRefId } from "../../common/model/systemReferentials";
import type { NotifyToast } from "../../common/model/toast.types";

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
  /**
   * Après création d'un profil contractuel (hors édition) : ouvrir le récap / édition
   * sans fermer immédiatement la demande côté parent.
   */
  onAfterProfileCreated?: (profile: RondePlannedProfileRef) => void;
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
  /** Retour vers le rapport de ronde d'ancrage (navigation Rapport → Demande → Rapport). */
  onNavigateBackToAnchorRonde?: () => void;
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

/** Résumé lisible d'une ligne brouillon (aperçu / récap demande). */
function formatLineDraftSummary(line: LineDraft): string {
  const intervalMinutes = line.intervalHours.trim()
    ? Math.max(1, Math.round(Number(line.intervalHours) * 60))
    : null;
  const roundsCount = line.randomRoundsCount.trim()
    ? Math.max(1, Math.round(Number(line.randomRoundsCount)))
    : null;
  return formatRondePlannedLineSummary({
    roundKind: line.roundKind,
    recurrenceKind: "WEEKLY",
    weekdaysMask: line.weekdaysMask,
    monthDay: null,
    requestedTime: line.requestedTime.trim() || null,
    intervalMinutes: Number.isFinite(intervalMinutes as number) ? intervalMinutes : null,
    randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
    randomWindowStart: line.randomWindowStart.trim() || null,
    randomWindowEnd: line.randomWindowEnd.trim() || null,
    randomRoundsCount: Number.isFinite(roundsCount as number) ? roundsCount : null
  });
}

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
  /** Clé du dernier auto-alignement Jour unique (évite d’écraser les saisies manuelles). */
  const singleDayAutoKeyRef = useRef<string | null>(null);

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
  const defaultMotifTypeId = useMemo(() => getDefaultSystemRefId(props.rondeMotifs), [props.rondeMotifs]);

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
      setMotifTypeId(defaultMotifTypeId);
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
      setMotifTypeId(String(s.motifTypeId || "").trim() || defaultMotifTypeId);
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
      setMotifTypeId(props.initialMotifTypeId?.trim() || defaultMotifTypeId);
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

    const hasPendingSite = !props.initialSiteId && Boolean(props.initialSiteDisplay);
    const hasPendingIntervenant = !props.initialIntervenantId && Boolean(props.initialIntervenantName);
    if (hasPendingSite) {
      const codeMatch = (props.initialSiteDisplay ?? "").match(/\(([^()]+)\)/);
      setPendingCode(codeMatch?.[1]?.trim() ?? "");
      const namePart = (props.initialSiteDisplay ?? "").replace(/\s*\([^()]+\)\s*$/, "").trim();
      setPendingName(namePart);
      setShowPendingSiteForm(true);
    } else {
      setShowPendingSiteForm(false);
      setPendingCode("");
      setPendingName("");
    }
    if (hasPendingIntervenant) {
      setPendingIntervenantName(props.initialIntervenantName ?? "");
      setShowPendingIntervenantForm(true);
    } else {
      setShowPendingIntervenantForm(false);
      setPendingIntervenantName("");
    }
  }, [
    props.isOpen,
    props.editProfile?.id,
    props.rondeMotifs,
    props.fixedOrigin,
    props.initialRequestDate,
    props.initialMotifTypeId,
    props.initialConsigne,
    props.initialSiteId,
    props.initialSiteDisplay,
    props.initialIntervenantId,
    props.initialIntervenantName,
    props.replayPlanningSnapshot,
    linkedBatchSig,
    isEdit
  ]);

  const isContract = origin === "CONTRAT";
  const isOriginFixed = Boolean(props.fixedOrigin || props.initialInterventionId);
  const originLabel = useMemo(() => {
    if (origin === "APPEL_CLIENT") return "Client";
    if (origin === "CONTRAT") return "Contrat";
    if (origin === "SUITE_INTERVENTION") return "Suite intervention";
    return "Autre";
  }, [origin]);
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
    const from = validFrom.trim();
    const todayIso = formatLocalDateIso(new Date());
    const isToday = Boolean(isSingleDay && from && from === todayIso);
    const dayMask =
      isSingleDay && from
        ? dateIsoToWeekdayMask(from)
        : validityRangeWeekdayLock != null
          ? validityRangeWeekdayLock
          : 0;
    const fromTimeNorm = TIME_RE.test(validFromTime.trim())
      ? validFromTime.trim()
      : isSingleDay
        ? isToday
          ? formatLocalTimeHm(new Date())
          : "00:00"
        : "08:00";
    setLines((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() ?? `line-${Date.now()}-${prev.length + 1}`,
        roundKind: "OPENING",
        requestedTime: isSingleDay ? fromTimeNorm : "08:00",
        randomWindowStart: isSingleDay ? fromTimeNorm : "",
        randomWindowEnd: isSingleDay ? "23:59" : "",
        randomRoundsCount: "",
        intervalHours: "",
        intervalEndTime: "23:59",
        weekdaysMask: dayMask,
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
          const maxMinute = dayIso === rangeEndIso
            ? hhmmToMinutes(toTimeNorm)
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

  /**
   * Plage de validité courte (Du→Au, ≤ 7 j.) hors « Jour unique » :
   * les toggles L→D sont figés sur les jours présents dans la plage (ex. aléatoire + date de fin).
   */
  const validityRangeWeekdayLock = useMemo(() => {
    if (isSingleDay) return null;
    const from = validFrom.trim();
    const to = validTo.trim();
    if (!from || !to || to < from) return null;
    const dayCount = inclusiveCalendarDayCount(from, to);
    if (dayCount < 1 || dayCount > 7) return null;
    const mask = weekdaysMaskForInclusiveDateRange(from, to);
    return mask > 0 ? mask : null;
  }, [isSingleDay, validFrom, validTo]);

  const lockWeekdaysFromValidityRange = validityRangeWeekdayLock != null;

  useEffect(() => {
    if (validityRangeWeekdayLock == null) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        let draft = line;
        if (draft.weekdaysMask !== validityRangeWeekdayLock) {
          draft = { ...draft, weekdaysMask: validityRangeWeekdayLock };
          changed = true;
        }
        /* Plage déjà bornée : fériés / veilles n’ajoutent rien d’utile. */
        if (draft.includeHolidays || draft.includeHolidayEves) {
          draft = { ...draft, includeHolidays: false, includeHolidayEves: false };
          changed = true;
        }
        return draft;
      });
      return changed ? next : prev;
    });
  }, [validityRangeWeekdayLock]);

  useEffect(() => {
    if (!isSingleDay) {
      singleDayAutoKeyRef.current = null;
      return;
    }
    const from = validFrom.trim();
    if (!from) return;
    if (validTo !== from) setValidTo(from);

    const dayMask = dateIsoToWeekdayMask(from);
    const todayIso = formatLocalDateIso(new Date());
    const isToday = from === todayIso;
    const autoKey = `${from}|${isToday ? "today" : "other"}`;
    const shouldAutoAlignTimes = singleDayAutoKeyRef.current !== autoKey;
    const wasOtherDay = singleDayAutoKeyRef.current?.endsWith("|other") === true;

    let fromTimeNorm = TIME_RE.test(validFromTime.trim()) ? validFromTime.trim() : "";
    if (shouldAutoAlignTimes) {
      singleDayAutoKeyRef.current = autoKey;
      if (isToday) {
        if (!fromTimeNorm || wasOtherDay) {
          fromTimeNorm = formatLocalTimeHm(new Date());
          setValidFromTime(fromTimeNorm);
        }
        setValidToTime("23:59");
      } else {
        fromTimeNorm = "00:00";
        setValidFromTime("00:00");
        setValidToTime("23:59");
      }
    }

    const applyFromTime = fromTimeNorm || (TIME_RE.test(validFromTime.trim()) ? validFromTime.trim() : "00:00");
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        let draft = line;
        if (dayMask && line.weekdaysMask !== dayMask) {
          draft = { ...draft, weekdaysMask: dayMask };
          changed = true;
        }
        if (shouldAutoAlignTimes) {
          if (line.roundKind === "RANDOM") {
            if (draft.randomWindowStart !== applyFromTime || draft.randomWindowEnd !== "23:59") {
              draft = { ...draft, randomWindowStart: applyFromTime, randomWindowEnd: "23:59" };
              changed = true;
            }
          } else if (
            draft.requestedTime !== applyFromTime &&
            (line.roundKind === "OPENING" || line.roundKind === "CLOSING" || line.roundKind === "ACCOMPAGNEMENT")
          ) {
            draft = { ...draft, requestedTime: applyFromTime };
            changed = true;
          }
        }
        return draft;
      });
      return changed ? next : prev;
    });
  }, [isSingleDay, validFrom, validTo, validFromTime]);

  if (!props.isOpen) return null;

  const onSubmit = async () => {
    setError("");
    const effectiveValidTo = isSingleDay ? validFrom.trim() : validTo.trim();
    const singleDayMask = isSingleDay && validFrom.trim() ? dateIsoToWeekdayMask(validFrom.trim()) : 0;
    const rangeLockMask =
      !isSingleDay && validFrom.trim() && effectiveValidTo
        ? (() => {
            const count = inclusiveCalendarDayCount(validFrom.trim(), effectiveValidTo);
            if (count < 1 || count > 7) return 0;
            return weekdaysMaskForInclusiveDateRange(validFrom.trim(), effectiveValidTo);
          })()
        : 0;
    const linesForSubmit =
      isSingleDay || rangeLockMask
        ? lines.map((line) => ({
            ...line,
            weekdaysMask: (isSingleDay ? singleDayMask : rangeLockMask) || line.weekdaysMask
          }))
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
          intervenantId: selectedIntervenant?.id ?? "",
          createRoundsEnabled: true,
          lines: linesForSubmit.map((ln) => ({
            roundKind: ln.roundKind,
            requestedTime: ln.requestedTime,
            randomWindowStart: ln.randomWindowStart,
            randomWindowEnd: ln.randomWindowEnd,
            randomRoundsCount: ln.randomRoundsCount,
            intervalHours: ln.intervalHours,
            intervalEndTime: validToTimeNorm,
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
          intervenantId: selectedIntervenant?.id ?? "",
          createRoundsEnabled: true,
          lines: linesForSubmit.map((ln) => ({
            roundKind: ln.roundKind,
            requestedTime: ln.requestedTime,
            randomWindowStart: ln.randomWindowStart,
            randomWindowEnd: ln.randomWindowEnd,
            randomRoundsCount: ln.randomRoundsCount,
            intervalHours: ln.intervalHours,
            intervalEndTime: validToTimeNorm,
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
      const saved = await Promise.resolve(
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
      if (
        !isEdit &&
        saved &&
        typeof saved === "object" &&
        "id" in saved &&
        saved.id &&
        props.onAfterProfileCreated
      ) {
        props.onAfterProfileCreated(saved);
        return;
      }
      /* Édition : rester ouvert pour consulter le récap ; création sans callback : fermer. */
      if (!isEdit) props.onClose();
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
          <div className="row-actions">
            {props.onNavigateBackToAnchorRonde && (
              <button
                type="button"
                className="btn-light"
                title="Retour au rapport de ronde"
                aria-label="Rapport de ronde"
                onClick={props.onNavigateBackToAnchorRonde}
              >
                Rapport de ronde
              </button>
            )}
            <button type="button" className="mc-modal-close" onClick={props.onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </header>
        <div className="form">
          <div className="ronde-planned-profile-modal__schedule-row">
            <label className="ronde-planned-profile-modal__schedule-field">
              <span>Date de la demande</span>
              <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
            </label>
            <label className="ronde-planned-profile-modal__schedule-field">
              <span>Heure de la demande</span>
              <TimeInput value={requestTime} onChange={setRequestTime} />
            </label>
            <label className="ronde-planned-profile-modal__schedule-field ronde-planned-profile-modal__schedule-field--motif">
              <span>Motif de la demande</span>
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
            <label className="ronde-planned-profile-modal__schedule-field ronde-planned-profile-modal__schedule-field--origin">
              <span>Origine</span>
              {isOriginFixed ? (
                <span className="ronde-origin-badge" title={originLabel}>{originLabel}</span>
              ) : (
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as RequestOrigin)}
                >
                  <option value="CONTRAT">Contrat</option>
                  <option value="APPEL_CLIENT">Client</option>
                  <option value="SUITE_INTERVENTION">Suite intervention</option>
                  <option value="AUTRE">Autre</option>
                </select>
              )}
            </label>
          </div>
          {!isEdit && !isLinkedExistingBatch && !isContract && canCreatePendingRefs ? (
            <SearchEntry
              sites={props.sites}
              intervenants={props.intervenants}
              selectedSite={selectedSite}
              selectedIntervenant={selectedIntervenant}
              onSelectedSiteChange={(s: SiteRef | null) => {
                setSiteId(s?.id ?? null);
                if (s) {
                  setShowPendingSiteForm(false);
                  setPendingCode("");
                  setPendingName("");
                }
              }}
              onSelectedIntervenantChange={(i: IntervenantRef | null) => {
                setIntervenantId(i?.id ?? "");
                if (i) {
                  setShowPendingIntervenantForm(false);
                  setPendingIntervenantName("");
                }
              }}
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
              onNotify={props.onNotify}
              showSiteAction={!selectedSite}
              showIntervenantAction={!selectedIntervenant}
            />
          ) : (
            <div className="ronde-planned-profile-modal__site-prest-row">
              <SiteSearchInput
                sites={props.sites}
                disabled={false}
                selectedSite={selectedSite}
                copyNotify={props.onNotify}
                labelText="Site"
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
                labelText="Prestataire"
                onSelectedIntervenantChange={(i) => {
                  setIntervenantId(i?.id ?? "");
                  if (i) {
                    setShowPendingIntervenantForm(false);
                    setPendingIntervenantName("");
                  }
                }}
              />
            </div>
          )}
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
            <TimeInput
              value={validFromTime}
              onChange={setValidFromTime}
              title="Heure de début (vide = 00:00)"
              aria-label="Heure de début de validité"
            />
            {!isSingleDay ? (
              <>
                <span className="ronde-planned-profile-modal__validity-label">Au</span>
                <input
                  type="date"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  aria-label="Date de fin de validité"
                />
                <TimeInput
                  value={validToTime}
                  onChange={setValidToTime}
                  title="Heure de fin (vide = 23:59)"
                  aria-label="Heure de fin de validité"
                />
              </>
            ) : (
              <span className="muted ronde-planned-profile-modal__validity-single-hint">Jour unique</span>
            )}
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
                      if (nextKind === "ACCOMPAGNEMENT") {
                        setIsSingleDay(true);
                        return;
                      }
                      // Quitter Accompagnement : désactiver Jour unique s'il ne reste aucune ligne accompagnement.
                      if (line.roundKind === "ACCOMPAGNEMENT") {
                        const stillHasAccompagnement = lines.some(
                          (other, otherIndex) => otherIndex !== index && other.roundKind === "ACCOMPAGNEMENT"
                        );
                        if (!stillHasAccompagnement) setIsSingleDay(false);
                      }
                    }}
                  >
                    <option value="OPENING">Ouverture</option>
                    <option value="CLOSING">Fermeture</option>
                    <option value="ACCOMPAGNEMENT">Accompagnement</option>
                    <option value="RANDOM">Aléatoire</option>
                  </select>
                </label>
                <div className="ronde-request-line-grid__controls">
                  {line.roundKind !== "RANDOM" ? (
                    <div className="ronde-request-line-grid__row ronde-request-line-grid__row--first">
                      <label className="ronde-request-line-grid__field-large">
                        Heure demandée
                        <TimeInput value={line.requestedTime} onChange={(value) => updateLine(index, { requestedTime: value })} />
                      </label>
                    </div>
                  ) : (
                    <div className="ronde-request-line-grid__row ronde-request-line-grid__row--random-modes">
                      <div className="ronde-request-line-grid__mode-group" role="group" aria-label="Mode intervalle">
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
                      </div>
                      <span className="ronde-request-line-grid__mode-or" aria-hidden>
                        ou
                      </span>
                      <div className="ronde-request-line-grid__mode-group" role="group" aria-label="Mode fenêtre">
                        <label>
                          Fenêtre de
                          <TimeInput value={line.randomWindowStart} onChange={(value) => updateLine(index, { randomWindowStart: value })} />
                        </label>
                        <label>
                          Fenêtre à
                          <TimeInput value={line.randomWindowEnd} onChange={(value) => updateLine(index, { randomWindowEnd: value })} />
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
                    </div>
                  )}
                </div>
              </div>
              <div className="ronde-planned-profile-line__weekday-toggles">
                <span className="muted" style={{ marginRight: 8 }}>Jours spécifiques</span>
                <ToggleSwitch
                  checked={isSingleDay}
                  disabled={lockWeekdaysFromValidityRange}
                  onChange={setIsSingleDay}
                  label="Jour unique"
                  labelFirst
                />
                <ToggleSwitch
                  checked={line.includeHolidayEves}
                  disabled={lockWeekdaysFromValidityRange}
                  onChange={(next) => updateLine(index, { includeHolidayEves: next })}
                  label="Veille jour férié"
                  labelFirst
                />
                <ToggleSwitch
                  checked={line.includeHolidays}
                  disabled={lockWeekdaysFromValidityRange}
                  onChange={(next) => updateLine(index, { includeHolidays: next })}
                  label="Jours fériés"
                  labelFirst
                />
              </div>
              <div className="ronde-planned-profile-line__weekday-toggles">
                <span className="muted" style={{ marginRight: 8 }}>L à D</span>
                {WEEKDAY_BITS.map((d) => (
                  <ToggleSwitch
                    key={d.bit}
                    checked={(line.weekdaysMask & d.bit) !== 0}
                    disabled={isSingleDay || lockWeekdaysFromValidityRange}
                    onChange={(next) =>
                      updateLine(index, { weekdaysMask: next ? line.weekdaysMask | d.bit : line.weekdaysMask & ~d.bit })
                    }
                    label={d.label}
                    labelFirst
                  />
                ))}
              </div>
            </fieldset>
          ))}
          {!isLinkedExistingBatch ? (
            <section className="panel ronde-request-recap" style={{ marginTop: 8, padding: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                {isEdit ? "Récapitulatif de la programmation" : "Récapitulatif"}
              </div>
              {lines.length === 0 ? (
                <div className="muted">Aucune ligne de planification.</div>
              ) : (
                lines.map((line, index) => (
                  <div key={`recap-line-${line.id || index}`} className="muted ronde-request-recap__line">
                    Ligne {index + 1}: {formatLineDraftSummary(line)}
                    {!isContract && !isEdit ? (
                      <>
                        {" "}
                        → {exceptionalPreview.perLine[index] ?? 0} ronde
                        {(exceptionalPreview.perLine[index] ?? 0) > 1 ? "s" : ""}
                      </>
                    ) : null}
                  </div>
                ))
              )}
              {(isContract || isEdit) && validFrom.trim() ? (
                <div style={{ marginTop: 6 }} className="muted">
                  Validité : du {formatDateShortFr(validFrom.trim()) || "—"}
                  {TIME_RE.test(validFromTime.trim()) ? ` ${validFromTime.trim()}` : ""}
                  {" au "}
                  {formatDateShortFr((isSingleDay ? validFrom.trim() : validTo.trim()) || "") || "—"}
                  {TIME_RE.test(validToTime.trim()) ? ` ${validToTime.trim()}` : ""}
                  {isSingleDay ? " · Jour unique" : ""}
                </div>
              ) : null}
              {!isContract && !isEdit ? (
                <div style={{ marginTop: 6, fontWeight: 600 }}>
                  Total : {exceptionalPreview.items.length} ronde{exceptionalPreview.items.length > 1 ? "s" : ""}
                </div>
              ) : null}
            </section>
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
        <div className="row-actions modal-actions ronde-request-modal__footer">
          <button type="button" className="btn-light" onClick={props.onClose}>Fermer</button>
          <div className="row-actions ronde-request-modal__footer-right">
            {isEdit && props.onStopProfile ? (
              <button type="button" className="btn-light" onClick={props.onStopProfile} disabled={submitting}>
                Arrêter
              </button>
            ) : null}
            {isEdit && !props.onStopProfile && props.onRequestStopProfile ? (
              <button type="button" className="btn-light" onClick={props.onRequestStopProfile} disabled={submitting}>
                Demander l&apos;arrêt
              </button>
            ) : null}
            {isEdit && props.onDeleteProfile ? (
              <button type="button" className="btn-danger" onClick={props.onDeleteProfile} disabled={submitting}>
                Supprimer
              </button>
            ) : null}
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
