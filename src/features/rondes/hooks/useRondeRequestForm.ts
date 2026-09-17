/**
 * État, hydratation et dérivés du formulaire demande / programmation ronde.
 * Le submit métier reste dans RondeRequestModal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import { getDefaultSystemRefId } from "../../common/model/systemReferentials";
import type { RondeEntry, RondeMotifTypeRef } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import {
  dateIsoToWeekdayMask
} from "../model/rondePlannedSlotEngine";
import { formatLocalDateIso, formatLocalTimeHm } from "../model/rondeCalendarLocal";
import { isRondeTimeHm, normalizeRondeHmOr } from "../utils/rondeDateTime";
import { requestOriginLabelFr, type RequestOrigin } from "../model/requestOrigin";
import {
  createDefaultLineDraft,
  lineRefToDraft,
  planningSnapshotLineToDraft,
  type LineDraft
} from "../model/rondeRequestLineDraft";
import { buildExceptionalGeneratedItems } from "../utils/buildExceptionalGeneratedItems";
import { buildContractualGeneratedPreview } from "../utils/buildContractualGeneratedPreview";
import { resolveValidityWeekdayLock } from "../utils/resolveValidityWeekdayLock";
import { isRondeManagerRole } from "../utils/rondePassageRules";

export type UseRondeRequestFormParams = {
  isOpen: boolean;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  holidays?: HolidayRef[];
  rondeMotifs: RondeMotifTypeRef[];
  requesterRole?: Role;
  editProfile?: RondePlannedProfileRef | null;
  fixedOrigin?: RequestOrigin | null;
  initialRequestDate?: string | null;
  initialMotifTypeId?: string | null;
  initialConsigne?: string | null;
  initialSiteId?: string | null;
  initialSiteDisplay?: string | null;
  initialIntervenantId?: string | null;
  initialIntervenantName?: string | null;
  initialInterventionId?: string | null;
  replayPlanningSnapshot?: RondePlanningSnapshotV1 | null;
  linkedBatchEntries?: RondeEntry[] | null;
  onSaveLinkedBatch?: unknown;
  onCreatePendingSite?: unknown;
  onCreatePendingIntervenant?: unknown;
};

export function useRondeRequestForm(props: UseRondeRequestFormParams) {

  const [requestDate, setRequestDate] = useState("");
  const [requestTime, setRequestTime] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [intervenantId, setIntervenantId] = useState("");
  const [motifTypeId, setMotifTypeId] = useState("");
  const [origin, setOrigin] = useState<RequestOrigin>("CONTRAT");
  const [clientName, setClientName] = useState("");
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
  const isManager = isRondeManagerRole(props.requesterRole);
  /** Opérateur : consultation seule en édition de profil (pas de modification de programmation). */
  const isProgrammingReadOnly = isEdit && !isManager;
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
      setClientName("");
      setConsigne(ep.notes ?? "");
      setMotifDetail("");
      setValidFrom(ep.planningValidFrom ?? today);
      setValidFromTime(nowHm);
      setValidTo(ep.planningValidTo ?? "");
      setValidToTime("23:59");
      setIsSingleDay(Boolean(ep.planningValidFrom && ep.planningValidTo && ep.planningValidFrom === ep.planningValidTo));
      setLines(ep.lines.length ? ep.lines.map(lineRefToDraft) : [createDefaultLineDraft()]);
    } else if (!isEdit && props.replayPlanningSnapshot?.version === 1) {
      const s = props.replayPlanningSnapshot;
      setRequestDate(String(s.requestDate || "").trim() || today);
      setRequestTime(normalizeRondeHmOr(String(s.requestTime ?? ""), "00:00"));
      setValidFrom(String(s.validFrom || "").trim() || today);
      {
        const fallbackFromTime = normalizeRondeHmOr(String(s.requestTime ?? ""), "00:00");
        setValidFromTime(normalizeRondeHmOr(String(s.validFromTime ?? ""), fallbackFromTime));
      }
      setValidTo(String(s.validTo || "").trim() || "");
      setValidToTime(normalizeRondeHmOr(String(s.validToTime ?? ""), "23:59"));
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
        const fromBatch = String(props.linkedBatchEntries?.[0]?.originDetail ?? "").trim();
        setClientName(
          (props.fixedOrigin ?? replayOriginFallback) === "APPEL_CLIENT" ? fromBatch : ""
        );
      }
      {
        const md = String(props.linkedBatchEntries?.[0]?.motifDetail ?? "").trim();
        setMotifDetail(md);
      }
      const snapLines = Array.isArray(s.lines) && s.lines.length ? s.lines : [];
      setLines(
        snapLines.length > 0
          ? snapLines.map((ln) => planningSnapshotLineToDraft(ln))
          : [createDefaultLineDraft()]
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
      setClientName("");
      setConsigne(props.initialConsigne ?? "");
      setMotifDetail("");
      setLines([createDefaultLineDraft()]);
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
  const originLabel = useMemo(() => requestOriginLabelFr(origin), [origin]);
  const canCreatePendingRefs = Boolean(props.onCreatePendingSite && props.onCreatePendingIntervenant);

  const validityRangeWeekdayLock = useMemo(
    () =>
      resolveValidityWeekdayLock({
        isSingleDay,
        validFrom,
        validTo
      }),
    [isSingleDay, validFrom, validTo]
  );

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
    const fromTimeNorm = isRondeTimeHm(validFromTime.trim())
      ? validFromTime.trim()
      : isSingleDay
        ? isToday
          ? formatLocalTimeHm(new Date())
          : "00:00"
        : "08:00";
    setLines((prev) => [
      createDefaultLineDraft({
        requestedTime: isSingleDay ? fromTimeNorm : "08:00",
        randomWindowStart: isSingleDay ? fromTimeNorm : "",
        randomWindowEnd: isSingleDay ? "23:59" : "",
        weekdaysMask: dayMask
      }),
      ...prev
    ]);
  };

  const generationPreview = useMemo(() => {
    const empty = { items: [], perLine: [] as number[], intervalHonorNote: "" };
    if (isEdit || isLinkedExistingBatch) return empty;
    if (isContract) {
      return buildContractualGeneratedPreview({
        lines,
        validFrom,
        validTo,
        siteId,
        motifTypeId,
        holidayDateIsos: (props.holidays || []).map((h) => h.dateIso)
      });
    }
    return buildExceptionalGeneratedItems({
      lines,
      validFrom,
      validTo,
      validFromTime,
      validToTime,
      requestDate,
      requestTime,
      motifTypeId,
      holidayDateIsos: (props.holidays || []).map((h) => h.dateIso)
    });
  }, [
    isContract,
    isEdit,
    isLinkedExistingBatch,
    lines,
    validFrom,
    validFromTime,
    validTo,
    validToTime,
    motifTypeId,
    siteId,
    props.holidays,
    requestDate,
    requestTime
  ]);

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

    let fromTimeNorm = isRondeTimeHm(validFromTime.trim()) ? validFromTime.trim() : "";
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

    const applyFromTime = fromTimeNorm || (isRondeTimeHm(validFromTime.trim()) ? validFromTime.trim() : "00:00");
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

  return {
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
    exceptionalPreview: generationPreview,
    lockWeekdaysFromValidityRange
  };
}
