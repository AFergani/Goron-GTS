/**
 * État, hydratation et dérivés du formulaire fiche ronde (hors buildPayload / actions métier).
 */

import { useEffect, useMemo, useState } from "react";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { useFormVariableFields } from "../../common/hooks/useFormVariableFields";
import type { FormTarget } from "../../settings/model/formVariables.types";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { normalizeTimeForSave } from "../../common/utils/timeInput";
import { getDefaultSystemRefId } from "../../common/model/systemReferentials";
import type { InterventionEntry } from "../../intervention/model/intervention.types";
import type { RondeEntry, RondeMotifTypeRef, RondeOriginKind } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { getLocalDateIso } from "../../common/utils/localDateIso";
import { computeRondeLogicalDate } from "../utils/logicalDate";
import { addIsoDays, computeDurationMinutes, isIsoDate, resolveRondePassageDates } from "../utils/rondeEntryFormHelpers";
import { resolvePlannedLineRequestedTime } from "../utils/plannedHeureDemandee";

export type RondeEntryMode = "create" | "edit";

export type RondeEntryCreatePreset = {
  source: "PLANIFIE";
  requestDate: string;
  siteId: string;
  intervenantId: string | null;
  plannedProfileId: string;
  plannedRoundKind: string;
  plannedSlotKey: string;
  planningHint?: string;
  motifTypeId?: string | null;
};

type UseRondeEntryFormParams = {
  isOpen: boolean;
  mode: RondeEntryMode;
  entry: RondeEntry | null;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  rondeMotifs: RondeMotifTypeRef[];
  plannedProfiles: RondePlannedProfileRef[];
  linkedInterventionEntry?: InterventionEntry | null;
  createPreset?: RondeEntryCreatePreset | null;
  requesterRole?: Role;
  onClose: () => void;
};

export function useRondeEntryForm({
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
}: UseRondeEntryFormParams) {
  const [requestDate, setRequestDate] = useState(getLocalDateIso());
  const [siteId, setSiteId] = useState("");
  const [motifTypeId, setMotifTypeId] = useState("");
  const [motifDetail, setMotifDetail] = useState("");
  const [horairesDemandeObs, setHorairesDemandeObs] = useState("");
  const [originKind, setOriginKind] = useState<RondeOriginKind>("TELESURVEILLANCE");
  const [originDetail, setOriginDetail] = useState("");
  const [intervenantId, setIntervenantId] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [report, setReport] = useState("");
  const [closureCustomValues, setClosureCustomValues] = useState<Record<string, string>>({});
  const [logicalDateOverride, setLogicalDateOverride] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingIntervenantName, setPendingIntervenantName] = useState("");
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const [showPendingIntervenantForm, setShowPendingIntervenantForm] = useState(false);
  const [showCancelReasonDialog, setShowCancelReasonDialog] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [statusActionBusy, setStatusActionBusy] = useState<"save" | "cancel" | "close" | "reopen" | null>(null);

  const isCreateMode = mode === "create";
  const formLockedClosed = entry?.status === "CLOTURE";
  const formLockedCanceled = entry?.status === "ANNULE";
  const splitLinkedLayout = Boolean(linkedInterventionEntry?.id && isCreateMode);
  const isPlannedCreatePreset = isCreateMode && createPreset?.source === "PLANIFIE";
  const isPureCreateMode = isCreateMode && !isPlannedCreatePreset;
  const useReportModalLayout = !isCreateMode || isPlannedCreatePreset;
  const showExecutionBlock = !isCreateMode || isPlannedCreatePreset;

  const selectedSite = useMemo(() => sites.find((site) => site.id === siteId) || null, [siteId, sites]);
  const selectedIntervenant = useMemo(
    () => intervenants.find((item) => item.id === intervenantId) || null,
    [intervenantId, intervenants]
  );
  const selectedMotifLabel = useMemo(() => {
    const fromState = rondeMotifs.find((m) => m.id === motifTypeId)?.label?.trim();
    if (fromState) return fromState;
    const fromEntry = String(entry?.motifTypeLabel || "").trim();
    if (fromEntry) return fromEntry;
    return "—";
  }, [rondeMotifs, motifTypeId, entry?.motifTypeLabel]);
  const defaultMotifTypeId = useMemo(() => getDefaultSystemRefId(rondeMotifs), [rondeMotifs]);
  const activePlannedProfile = useMemo(() => {
    const plannedProfileId =
      (isCreateMode && createPreset?.source === "PLANIFIE" ? createPreset.plannedProfileId : entry?.plannedProfileId) || "";
    if (!plannedProfileId) return null;
    return plannedProfiles.find((item) => item.id === plannedProfileId) ?? null;
  }, [isCreateMode, createPreset?.source, createPreset?.plannedProfileId, entry?.plannedProfileId, plannedProfiles]);

  const rondeFormTarget: FormTarget =
    entry?.source === "PLANIFIE" || createPreset?.source === "PLANIFIE" ? "RONDE_PLANIFIEE" : "RONDE_EXCEPTIONNELLE";
  const extras = useFormVariableFields({
    isOpen,
    requesterRole,
    formTarget: rondeFormTarget,
    site: selectedSite,
    plannedProfileId: activePlannedProfile?.id || null,
    seedValues: isCreateMode ? {} : entry?.closureCustomValues,
    seedKey: isCreateMode ? `create:${createPreset?.plannedSlotKey || "new"}` : entry?.id
  });
  const requestExtraDefs = extras.requestDefs;
  const closureExtraDefs = extras.closureDefs;

  const plannedLineRequestedTime = useMemo(() => {
    const isCreatePlanned = isCreateMode && createPreset?.source === "PLANIFIE";
    return resolvePlannedLineRequestedTime({
      plannedProfileId: isCreatePlanned ? createPreset.plannedProfileId : entry?.plannedProfileId,
      plannedRoundKind: isCreatePlanned ? createPreset.plannedRoundKind : entry?.plannedRoundKind,
      plannedSlotKey: isCreatePlanned ? createPreset.plannedSlotKey : entry?.plannedSlotKey,
      profiles: plannedProfiles,
      fallbackArrivalTime: isCreatePlanned ? arrivalTime : entry?.arrivalTime
    });
  }, [
    isCreateMode,
    createPreset?.source,
    createPreset?.plannedProfileId,
    createPreset?.plannedRoundKind,
    createPreset?.plannedSlotKey,
    arrivalTime,
    entry?.plannedProfileId,
    entry?.plannedRoundKind,
    entry?.plannedSlotKey,
    entry?.arrivalTime,
    plannedProfiles
  ]);

  const durationMinutes = useMemo(
    () => computeDurationMinutes(
      arrivalDate,
      normalizeTimeForSave(arrivalTime),
      departureDate,
      normalizeTimeForSave(departureTime)
    ),
    [arrivalDate, arrivalTime, departureDate, departureTime]
  );
  const logicalDateComputed = useMemo(
    () =>
      computeRondeLogicalDate({
        requestDate,
        plannedRoundKind:
          (isCreateMode && createPreset?.source === "PLANIFIE" ? createPreset.plannedRoundKind : entry?.plannedRoundKind) ||
          null,
        arrivalTime: normalizeTimeForSave(arrivalTime),
        departureTime: normalizeTimeForSave(departureTime),
        preferredDate: logicalDateOverride || null
      }),
    [
      requestDate,
      isCreateMode,
      createPreset?.source,
      createPreset?.plannedRoundKind,
      entry?.plannedRoundKind,
      arrivalTime,
      departureTime,
      logicalDateOverride
    ]
  );
  const effectiveLogicalDate = logicalDateComputed.logicalDate;
  const hasLogicalDateTransition = Boolean(
    isIsoDate(requestDate) && isIsoDate(effectiveLogicalDate) && effectiveLogicalDate !== requestDate
  );
  const logicalDateTransitionLabel = hasLogicalDateTransition
    ? `${formatDateShortFr(requestDate)} -> ${formatDateShortFr(effectiveLogicalDate)}`
    : "";

  useEffect(() => {
    if (!isOpen) return;
    setFieldError("");
    if (!isCreateMode) return;
    setShowPendingSiteForm(false);
    setShowPendingIntervenantForm(false);
    setShowCancelReasonDialog(false);
    setCancelReasonInput("");
    setPendingCode("");
    setPendingName("");
    setPendingIntervenantName("");

    if (createPreset?.source === "PLANIFIE") {
      setRequestDate(createPreset.requestDate || getLocalDateIso());
      setSiteId(createPreset.siteId || "");
      setMotifTypeId(createPreset.motifTypeId || "");
      setMotifDetail("");
      setHorairesDemandeObs(createPreset.planningHint || "");
      setOriginKind("TELESURVEILLANCE");
      setOriginDetail("");
      setIntervenantId(createPreset.intervenantId || "");
      setArrivalTime("");
      setArrivalDate("");
      setDepartureDate("");
      setDepartureTime("");
      setWorkOrderNumber("");
      setReport("");
      setClosureCustomValues({});
      setLogicalDateOverride("");
      return;
    }

    if (linkedInterventionEntry?.id) {
      setRequestDate(getLocalDateIso());
      setSiteId(linkedInterventionEntry.siteId || "");
      setMotifTypeId("");
      setMotifDetail("");
      setHorairesDemandeObs("");
      setOriginKind("TELESURVEILLANCE");
      setOriginDetail("");
      setIntervenantId(linkedInterventionEntry.intervenantId || "");
      setArrivalTime("");
      setArrivalDate("");
      setDepartureDate("");
      setDepartureTime("");
      setWorkOrderNumber("");
      setReport("");
      setClosureCustomValues({});
      setLogicalDateOverride("");
      return;
    }

    setRequestDate(getLocalDateIso());
    setSiteId("");
    setMotifTypeId("");
    setMotifDetail("");
    setHorairesDemandeObs("");
    setOriginKind("TELESURVEILLANCE");
    setOriginDetail("");
    setIntervenantId("");
    setArrivalTime("");
    setArrivalDate("");
    setDepartureDate("");
    setDepartureTime("");
    setWorkOrderNumber("");
    setReport("");
    setClosureCustomValues({});
    setLogicalDateOverride("");
  }, [isOpen, isCreateMode, linkedInterventionEntry?.id, createPreset?.source, createPreset?.plannedSlotKey]);

  useEffect(() => {
    if (!isOpen || !isCreateMode) return;
    if (motifTypeId) return;
    if (defaultMotifTypeId) setMotifTypeId(defaultMotifTypeId);
  }, [isOpen, isCreateMode, defaultMotifTypeId, motifTypeId]);

  useEffect(() => {
    if (!isOpen || isCreateMode || !entry) return;
    setFieldError("");
    setShowPendingSiteForm(false);
    setShowPendingIntervenantForm(false);
    setShowCancelReasonDialog(false);
    setCancelReasonInput("");
    setPendingCode("");
    setPendingName("");
    setPendingIntervenantName("");
    setRequestDate(entry.requestDate || getLocalDateIso());
    setSiteId(entry.siteId || "");
    setMotifTypeId(entry.motifTypeId || "");
    setMotifDetail(entry.motifDetail || "");
    setHorairesDemandeObs(entry.horairesDemandeObs || "");
    setOriginKind(entry.originKind || "TELESURVEILLANCE");
    setOriginDetail(entry.originDetail || "");
    setIntervenantId(entry.intervenantId || "");
    setArrivalTime(entry.arrivalTime || "");
    setDepartureTime(entry.departureTime || "");
    const passageDates = resolveRondePassageDates({
      requestDate: entry.requestDate || "",
      arrivalTime: entry.arrivalTime || "",
      departureTime: entry.departureTime || "",
      arrivalDate: entry.arrivalDate,
      departureDate: entry.departureDate
    });
    setArrivalDate(passageDates.arrivalDate);
    setDepartureDate(passageDates.departureDate);
    setWorkOrderNumber(entry.workOrderNumber || "");
    setReport(entry.report || "");
    setClosureCustomValues(entry.closureCustomValues || {});
    setLogicalDateOverride(
      String(
        (entry.closureCustomValues || {}).date_logique_passage ||
          (entry.closureCustomValues || {}).date_logique ||
          ""
      ).trim()
    );
  }, [isOpen, isCreateMode, entry?.id]);

  useEffect(() => {
    if (!isOpen || !arrivalTime.trim() || !isIsoDate(requestDate)) return;
    setArrivalDate((current) => current || requestDate);
  }, [isOpen, arrivalTime, requestDate]);

  useEffect(() => {
    if (!isOpen || !departureTime.trim() || !isIsoDate(requestDate)) return;
    setDepartureDate((current) => {
      if (current) return current;
      const arrival = normalizeTimeForSave(arrivalTime);
      const departure = normalizeTimeForSave(departureTime);
      if (arrival && departure && departure < arrival) return addIsoDays(requestDate, 1);
      return requestDate;
    });
  }, [isOpen, departureTime, arrivalTime, requestDate]);

  const isRondeCreateDirty = useMemo(() => {
    if (!isCreateMode) return false;
    const linked = linkedInterventionEntry;
    const siteChangedFromLinked =
      linked?.id && (siteId !== (linked.siteId || "") || intervenantId !== (linked.intervenantId || ""));
    const siteOrIvStandalone = !linked?.id && Boolean(siteId || intervenantId);
    const motifChangedFromDefault = Boolean(motifTypeId && defaultMotifTypeId && motifTypeId !== defaultMotifTypeId);
    return Boolean(
      pendingCode.trim() ||
        pendingName.trim() ||
        pendingIntervenantName.trim() ||
        showPendingSiteForm ||
        showPendingIntervenantForm ||
        motifDetail.trim() ||
        horairesDemandeObs.trim() ||
        originDetail.trim() ||
        originKind !== "TELESURVEILLANCE" ||
        requestDate !== getLocalDateIso() ||
        siteChangedFromLinked ||
        siteOrIvStandalone ||
        motifChangedFromDefault
    );
  }, [
    isCreateMode,
    linkedInterventionEntry?.id,
    linkedInterventionEntry?.siteId,
    linkedInterventionEntry?.intervenantId,
    siteId,
    intervenantId,
    pendingCode,
    pendingName,
    pendingIntervenantName,
    showPendingSiteForm,
    showPendingIntervenantForm,
    motifDetail,
    horairesDemandeObs,
    originDetail,
    originKind,
    requestDate,
    motifTypeId,
    defaultMotifTypeId
  ]);

  const isRondeEditDirty = useMemo(() => {
    if (isCreateMode || !entry) return false;
    const extrasChanged = Object.keys({ ...extras.values, ...(entry.closureCustomValues || {}) }).some(
      (key) => String(extras.values[key] || "").trim() !== String((entry.closureCustomValues || {})[key] || "").trim()
    );
    return Boolean(
      requestDate !== (entry.requestDate || getLocalDateIso()) ||
        siteId !== (entry.siteId || "") ||
        motifTypeId !== (entry.motifTypeId || "") ||
        motifDetail !== (entry.motifDetail || "") ||
        horairesDemandeObs !== (entry.horairesDemandeObs || "") ||
        originKind !== (entry.originKind || "TELESURVEILLANCE") ||
        originDetail !== (entry.originDetail || "") ||
        intervenantId !== (entry.intervenantId || "") ||
        arrivalTime !== (entry.arrivalTime || "") ||
        departureTime !== (entry.departureTime || "") ||
        arrivalDate !== resolveRondePassageDates({
          requestDate: entry.requestDate || "",
          arrivalTime: entry.arrivalTime || "",
          departureTime: entry.departureTime || "",
          arrivalDate: entry.arrivalDate,
          departureDate: entry.departureDate
        }).arrivalDate ||
        departureDate !== resolveRondePassageDates({
          requestDate: entry.requestDate || "",
          arrivalTime: entry.arrivalTime || "",
          departureTime: entry.departureTime || "",
          arrivalDate: entry.arrivalDate,
          departureDate: entry.departureDate
        }).departureDate ||
        workOrderNumber !== (entry.workOrderNumber || "") ||
        report !== (entry.report || "") ||
        extrasChanged ||
        Object.keys({ ...closureCustomValues, ...(entry.closureCustomValues || {}) }).some(
          (key) =>
            String(closureCustomValues[key] || "").trim() !==
            String((entry.closureCustomValues || {})[key] || "").trim()
        )
    );
  }, [
    isCreateMode,
    entry,
    requestDate,
    siteId,
    motifTypeId,
    motifDetail,
    horairesDemandeObs,
    originKind,
    originDetail,
    intervenantId,
    arrivalTime,
    departureTime,
    arrivalDate,
    departureDate,
    workOrderNumber,
    report,
    extras.values,
    closureCustomValues
  ]);

  const isRondePlannedCreateDirty = useMemo(() => {
    if (!isPlannedCreatePreset || !createPreset) return false;
    return Boolean(
      requestDate !== (createPreset.requestDate || getLocalDateIso()) ||
        siteId !== (createPreset.siteId || "") ||
        motifDetail.trim() ||
        horairesDemandeObs !== (createPreset.planningHint || "") ||
        originKind !== "TELESURVEILLANCE" ||
        originDetail.trim() ||
        intervenantId !== (createPreset.intervenantId || "") ||
        arrivalTime.trim() ||
        departureTime.trim() ||
        workOrderNumber.trim() ||
        report.trim() ||
        pendingCode.trim() ||
        pendingName.trim() ||
        pendingIntervenantName.trim() ||
        showPendingSiteForm ||
        showPendingIntervenantForm
    );
  }, [
    isPlannedCreatePreset,
    createPreset,
    requestDate,
    siteId,
    motifDetail,
    horairesDemandeObs,
    originKind,
    originDetail,
    intervenantId,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    pendingCode,
    pendingName,
    pendingIntervenantName,
    showPendingSiteForm,
    showPendingIntervenantForm
  ]);

  const createCloseGuard = useCreateModalCloseGuard({
    enabled: isOpen && !showCancelReasonDialog,
    isDirty: isPureCreateMode
      ? isRondeCreateDirty
      : isPlannedCreatePreset
        ? isRondePlannedCreateDirty
        : isRondeEditDirty,
    onClose
  });

  return {
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
    logicalDateOverride,
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
    createCloseGuard,
    requestExtraDefs,
    closureExtraDefs,
    extraValues: extras.values,
    setExtraValues: extras.setValues
  };
}
