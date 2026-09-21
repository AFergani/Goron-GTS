/**
 * État, hydratation et dérivés du formulaire intervention (hors actions métier create/update/status).
 */

import { useEffect, useMemo, useState } from "react";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { getLocalDateIso } from "../../common/utils/localDateIso";
import { normalizeTimeForSave } from "../../common/utils/timeInput";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { useFormVariableFields } from "../../common/hooks/useFormVariableFields";
import type { InterventionEntry } from "../model/intervention.types";
import { INTERVENTION_NO_WORK_ORDER_LABEL } from "../model/intervention.types";
import {
  computeInterventionLogicalDate,
  inferArrivalDateFromEntry,
  inferDepartureDateFromEntry,
  isIsoDate,
  resolvePassageDatesForSave
} from "../utils/interventionPassageDates";

export type InterventionEntryMode = "create" | "edit";

type UseInterventionEntryFormParams = {
  isOpen: boolean;
  mode: InterventionEntryMode;
  entry: InterventionEntry | null;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  requesterRole: Role;
  isResponsable: boolean;
  onClose: () => void;
};

export function useInterventionEntryForm({
  isOpen,
  mode,
  entry,
  sites,
  intervenants,
  requesterRole,
  isResponsable,
  onClose
}: UseInterventionEntryFormParams) {
  const [siteId, setSiteId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestDate, setRequestDate] = useState(getLocalDateIso());
  const [requestTime, setRequestTime] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [report, setReport] = useState("");
  const [intervenantId, setIntervenantId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingIntervenantName, setPendingIntervenantName] = useState("");
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const [showPendingIntervenantForm, setShowPendingIntervenantForm] = useState(false);
  const [showCancelReasonDialog, setShowCancelReasonDialog] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [logicalDateOverride, setLogicalDateOverride] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const selectedSite = useMemo(() => sites.find((site) => site.id === siteId) || null, [siteId, sites]);
  const selectedIntervenant = useMemo(
    () => intervenants.find((intervenant) => intervenant.id === intervenantId) || null,
    [intervenantId, intervenants]
  );
  const isCreateMode = mode === "create";
  const showRequiredFieldsOnly = isCreateMode;
  const canFixKnownReferences = !isCreateMode && isResponsable;
  const lockCoreFields = !isCreateMode && !canFixKnownReferences;
  const formLockedClosed = entry?.status === "CLOTURE";
  const extras = useFormVariableFields({
    isOpen,
    requesterRole,
    formTarget: "INTERVENTION",
    site: selectedSite,
    seedValues: isCreateMode ? {} : entry?.exportExtraValues,
    seedKey: isCreateMode ? "create" : entry?.id
  });
  const requestExtraDefs = extras.requestDefs;
  const closureExtraDefs = extras.closureDefs;
  const exportExtraValues = extras.values;
  const setExportExtraValues = extras.setValues;

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
    setSiteId("");
    setRequestReason("");
    setRequestDate(getLocalDateIso());
    setRequestTime("");
    setArrivalDate("");
    setArrivalTime("");
    setDepartureDate("");
    setDepartureTime("");
    setWorkOrderNumber("");
    setReport("");
    setIntervenantId("");
    setLogicalDateOverride("");
  }, [isOpen, isCreateMode]);

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
    setSiteId(entry.siteId || "");
    setRequestReason(entry.requestReason || "");
    const requestDateIso = isIsoDate(entry.requestDate) ? entry.requestDate : getLocalDateIso();
    setRequestDate(requestDateIso);
    setRequestTime(entry.requestTime || "");
    setArrivalDate(inferArrivalDateFromEntry(entry) || requestDateIso);
    setArrivalTime(entry.arrivalTime || "");
    setDepartureDate(inferDepartureDateFromEntry(entry) || requestDateIso);
    setDepartureTime(entry.departureTime || "");
    setWorkOrderNumber(
      !entry.workOrderNumber || entry.workOrderNumber === INTERVENTION_NO_WORK_ORDER_LABEL
        ? ""
        : entry.workOrderNumber
    );
    setReport(entry.report || "");
    setIntervenantId(entry.intervenantId || "");
    setLogicalDateOverride(
      String((entry.exportExtraValues || {}).date_logique_passage || (entry.exportExtraValues || {}).date_logique || "").trim()
    );
  }, [isOpen, isCreateMode, entry?.id]);

  const passageDatesResolved = useMemo(
    () =>
      resolvePassageDatesForSave({
        requestDate,
        arrivalDate,
        arrivalTime,
        departureDate,
        departureTime
      }),
    [requestDate, arrivalDate, arrivalTime, departureDate, departureTime]
  );

  const logicalDateComputed = useMemo(
    () =>
      computeInterventionLogicalDate({
        requestDate,
        requestTime: normalizeTimeForSave(requestTime),
        arrivalDate: passageDatesResolved.arrivalDate || null,
        arrivalTime: normalizeTimeForSave(arrivalTime),
        departureDate: passageDatesResolved.departureDate || null,
        departureTime: normalizeTimeForSave(departureTime),
        preferredDate: logicalDateOverride || null
      }),
    [requestDate, requestTime, passageDatesResolved, arrivalTime, departureTime, logicalDateOverride]
  );
  const effectiveLogicalDate = logicalDateComputed.logicalDate;
  const hasLogicalDateTransition =
    Boolean(requestDate) && Boolean(effectiveLogicalDate) && String(requestDate) !== String(effectiveLogicalDate);
  const logicalDateTransitionLabel = hasLogicalDateTransition
    ? `${formatDateShortFr(requestDate)} -> ${formatDateShortFr(effectiveLogicalDate)}`
    : "";

  const isInterventionCreateDirty = useMemo(() => {
    if (!isCreateMode) return false;
    return Boolean(
      requestReason.trim() ||
        siteId ||
        intervenantId ||
        pendingCode.trim() ||
        pendingName.trim() ||
        pendingIntervenantName.trim() ||
        showPendingSiteForm ||
        showPendingIntervenantForm ||
        requestTime.trim() ||
        arrivalDate ||
        arrivalTime.trim() ||
        departureDate ||
        departureTime.trim() ||
        workOrderNumber.trim() ||
        report.trim() ||
        Object.values(exportExtraValues).some((value) => String(value || "").trim()) ||
        requestDate !== getLocalDateIso()
    );
  }, [
    isCreateMode,
    requestReason,
    siteId,
    intervenantId,
    pendingCode,
    pendingName,
    pendingIntervenantName,
    showPendingSiteForm,
    showPendingIntervenantForm,
    requestTime,
    arrivalDate,
    arrivalTime,
    departureDate,
    departureTime,
    workOrderNumber,
    report,
    exportExtraValues,
    requestDate
  ]);

  const isInterventionEditDirty = useMemo(() => {
    if (isCreateMode || !entry) return false;
    const requestDateIso = isIsoDate(entry.requestDate) ? entry.requestDate : getLocalDateIso();
    const workOrder =
      !entry.workOrderNumber || entry.workOrderNumber === INTERVENTION_NO_WORK_ORDER_LABEL
        ? ""
        : entry.workOrderNumber;
    const extrasChanged = Object.keys({ ...exportExtraValues, ...(entry.exportExtraValues || {}) }).some(
      (key) => String(exportExtraValues[key] || "").trim() !== String((entry.exportExtraValues || {})[key] || "").trim()
    );
    return Boolean(
      siteId !== (entry.siteId || "") ||
        requestReason !== (entry.requestReason || "") ||
        requestDate !== requestDateIso ||
        requestTime !== (entry.requestTime || "") ||
        arrivalDate !== (inferArrivalDateFromEntry(entry) || requestDateIso) ||
        arrivalTime !== (entry.arrivalTime || "") ||
        departureDate !== (inferDepartureDateFromEntry(entry) || requestDateIso) ||
        departureTime !== (entry.departureTime || "") ||
        workOrderNumber !== workOrder ||
        report !== (entry.report || "") ||
        intervenantId !== (entry.intervenantId || "") ||
        extrasChanged
    );
  }, [
    isCreateMode,
    entry,
    siteId,
    requestReason,
    requestDate,
    requestTime,
    arrivalDate,
    arrivalTime,
    departureDate,
    departureTime,
    workOrderNumber,
    report,
    intervenantId,
    exportExtraValues
  ]);

  const createCloseGuard = useCreateModalCloseGuard({
    enabled: isOpen && !showCancelReasonDialog,
    isDirty: isCreateMode ? isInterventionCreateDirty : isInterventionEditDirty,
    onClose
  });

  return {
    siteId,
    setSiteId,
    requestReason,
    setRequestReason,
    requestDate,
    setRequestDate,
    requestTime,
    setRequestTime,
    arrivalDate,
    setArrivalDate,
    arrivalTime,
    setArrivalTime,
    departureDate,
    setDepartureDate,
    departureTime,
    setDepartureTime,
    workOrderNumber,
    setWorkOrderNumber,
    report,
    setReport,
    intervenantId,
    setIntervenantId,
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
    requestExtraDefs,
    closureExtraDefs,
    exportExtraValues,
    setExportExtraValues,
    isActionSubmitting,
    setIsActionSubmitting,
    selectedSite,
    selectedIntervenant,
    isCreateMode,
    showRequiredFieldsOnly,
    canFixKnownReferences,
    lockCoreFields,
    formLockedClosed,
    passageDatesResolved,
    logicalDateComputed,
    effectiveLogicalDate,
    logicalDateTransitionLabel,
    createCloseGuard
  };
}
