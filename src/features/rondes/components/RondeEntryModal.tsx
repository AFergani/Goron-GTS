/**
 * Modale fiche ronde (saisie, clôture, intervention liée, référentiels en attente).
 *
 * Hydratation : `[isOpen, mode]` création ; `[isOpen, mode, entry?.id]` édition.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import type { InterventionEntry } from "../../intervention/model/intervention.types";
import type { SiteRef, IntervenantRef } from "../../../types";
import {
  isRondeAutoClosureReport,
  type RondeEntry,
  type RondeMotifTypeRef,
  type RondeOriginKind,
  type RondeSavePayload,
  type RondeSource
} from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import { InterventionLinkedReadonlyPanel } from "./InterventionLinkedReadonlyPanel";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { SearchEntry } from "../../common/components/SearchEntry";
import { IntervenantSearchInput } from "../../intervention/components/IntervenantSearchInput";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { TimeInput } from "../../common/components/TimeInput";
import { isValidTime, normalizeTimeForSave } from "../../common/utils/timeInput";
import { RondeClosureFieldsEditor } from "./RondeClosureFieldsEditor";
import { resolveRondeClosureLabelTemplate } from "../utils/closureLabelTemplate";
import { formatDateShortFr } from "../utils/formatDateShortFr";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import { profileLineMatchesEmittedRoundKind } from "../utils/profileLineMatchesSlot";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";
import { computeRondeLogicalDate } from "../utils/logicalDate";
import { formatLocalDateIso } from "../model/rondeCalendarLocal";
import { getDefaultSystemRefId } from "../../common/model/systemReferentials";
import type { NotifyToast } from "../../common/model/toast.types";

type Mode = "create" | "edit";

function formatNowDate() {
  return formatLocalDateIso(new Date());
}

function formatJourneeDuLabel(dateIso: string) {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function computeDurationMinutes(requestDate: string, arrival: string, departure: string) {
  if (!requestDate || !arrival || !departure || !isValidTime(arrival) || !isValidTime(departure)) return null;
  const startMs = Date.parse(`${requestDate}T${arrival}:00`);
  let endMs = Date.parse(`${requestDate}T${departure}:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs < startMs) endMs += 24 * 60 * 60 * 1000;
  return Math.round((endMs - startMs) / 60000);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

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
    cancellationReason?: string
  ) => Promise<boolean>;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant: (name: string) => Promise<boolean>;
  /** Toasts copie code site, etc. */
  onNotify?: NotifyToast;
  /** Ouvre la page Intervention sur la fiche liée (traçabilité interne, sans afficher d’id technique). */
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
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
  createPreset?: {
    source: "PLANIFIE";
    requestDate: string;
    siteId: string;
    intervenantId: string | null;
    plannedProfileId: string;
    plannedRoundKind: string;
    plannedSlotKey: string;
    planningHint?: string;
    motifTypeId?: string | null;
  } | null;
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
  onOpenLinkedRequest,
  createPreset
}: RondeEntryModalProps) {
  const [requestDate, setRequestDate] = useState(formatNowDate());
  const [siteId, setSiteId] = useState("");
  const [motifTypeId, setMotifTypeId] = useState("");
  const [motifDetail, setMotifDetail] = useState("");
  const [horairesDemandeObs, setHorairesDemandeObs] = useState("");
  const [originKind, setOriginKind] = useState<RondeOriginKind>("TELESURVEILLANCE");
  const [originDetail, setOriginDetail] = useState("");
  const [intervenantId, setIntervenantId] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
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
  /** Motif système « Voir Consigne » en priorité, sinon premier motif disponible */
  const defaultMotifTypeId = useMemo(() => getDefaultSystemRefId(rondeMotifs), [rondeMotifs]);
  const activePlannedProfile = useMemo(() => {
    const plannedProfileId =
      (isCreateMode && createPreset?.source === "PLANIFIE" ? createPreset.plannedProfileId : entry?.plannedProfileId) || "";
    if (!plannedProfileId) return null;
    return plannedProfiles.find((item) => item.id === plannedProfileId) ?? null;
  }, [isCreateMode, createPreset?.source, createPreset?.plannedProfileId, entry?.plannedProfileId, plannedProfiles]);

  /** Heure demandée issue du profil / ligne de planification (passages planifiés). */
  const plannedLineRequestedTime = useMemo(() => {
    const isCreatePlanned = isCreateMode && createPreset?.source === "PLANIFIE";
    const plannedProfileId = isCreatePlanned ? createPreset.plannedProfileId : entry?.plannedProfileId || "";
    const plannedRoundKind = isCreatePlanned ? createPreset.plannedRoundKind : entry?.plannedRoundKind || "";
    const plannedSlotKey = isCreatePlanned ? createPreset.plannedSlotKey : entry?.plannedSlotKey || "";
    const fallbackArrival = isCreatePlanned ? arrivalTime : entry?.arrivalTime || "";
    if (!plannedProfileId || !plannedRoundKind) return null;
    const profile = plannedProfiles.find((p) => p.id === plannedProfileId);
    const lineBySlot =
      plannedSlotKey && profile?.lines?.length
        ? profile.lines.find((l) => plannedSlotKey.startsWith(`${l.id}:`))
        : undefined;
    const line = lineBySlot || profile?.lines?.find((l) => profileLineMatchesEmittedRoundKind(l, plannedRoundKind));
    const rt = line?.requestedTime?.trim();
    if (rt) return rt;
    if (line?.roundKind === "RANDOM" && fallbackArrival?.trim()) return fallbackArrival.trim();
    return null;
  }, [
    isCreateMode,
    createPreset?.source,
    createPreset?.plannedProfileId,
    createPreset?.plannedRoundKind,
    createPreset?.plannedSlotKey,
    arrivalTime,
    entry?.id,
    entry?.source,
    entry?.plannedProfileId,
    entry?.plannedRoundKind,
    entry?.plannedSlotKey,
    entry?.arrivalTime,
    plannedProfiles
  ]);

  const durationMinutes = useMemo(
    () => computeDurationMinutes(requestDate, normalizeTimeForSave(arrivalTime), normalizeTimeForSave(departureTime)),
    [arrivalTime, departureTime, requestDate]
  );
  const logicalDateComputed = useMemo(
    () =>
      computeRondeLogicalDate({
        requestDate,
        plannedRoundKind:
          (isCreateMode && createPreset?.source === "PLANIFIE" ? createPreset.plannedRoundKind : entry?.plannedRoundKind) || null,
        arrivalTime: normalizeTimeForSave(arrivalTime),
        departureTime: normalizeTimeForSave(departureTime),
        preferredDate: logicalDateOverride || null
      }),
    [requestDate, isCreateMode, createPreset?.source, createPreset?.plannedRoundKind, entry?.plannedRoundKind, arrivalTime, departureTime, logicalDateOverride]
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
      setRequestDate(createPreset.requestDate || formatNowDate());
      setSiteId(createPreset.siteId || "");
      setMotifTypeId(createPreset.motifTypeId || "");
      setMotifDetail("");
      setHorairesDemandeObs(createPreset.planningHint || "");
      setOriginKind("TELESURVEILLANCE");
      setOriginDetail("");
      setIntervenantId(createPreset.intervenantId || "");
      setArrivalTime("");
      setDepartureTime("");
      setWorkOrderNumber("");
      setReport("");
      setClosureCustomValues({});
      setLogicalDateOverride("");
      return;
    }

    if (linkedInterventionEntry?.id) {
      setRequestDate(formatNowDate());
      setSiteId(linkedInterventionEntry.siteId || "");
      setMotifTypeId("");
      setMotifDetail("");
      setHorairesDemandeObs("");
      setOriginKind("TELESURVEILLANCE");
      setOriginDetail("");
      setIntervenantId(linkedInterventionEntry.intervenantId || "");
      setArrivalTime("");
      setDepartureTime("");
      setWorkOrderNumber("");
      setReport("");
      setClosureCustomValues({});
      setLogicalDateOverride("");
      return;
    }

    setRequestDate(formatNowDate());
    setSiteId("");
    setMotifTypeId("");
    setMotifDetail("");
    setHorairesDemandeObs("");
    setOriginKind("TELESURVEILLANCE");
    setOriginDetail("");
    setIntervenantId("");
    setArrivalTime("");
    setDepartureTime("");
    setWorkOrderNumber("");
    setReport("");
    setClosureCustomValues({});
    setLogicalDateOverride("");
  }, [isOpen, isCreateMode, linkedInterventionEntry?.id, createPreset?.source, createPreset?.plannedSlotKey]);

  /** Défaut motif système « Voir Consigne » quand la liste référentielle arrive (dépendances réduites, cf. règle formulaires). */
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
    setRequestDate(entry.requestDate || formatNowDate());
    setSiteId(entry.siteId || "");
    setMotifTypeId(entry.motifTypeId || "");
    setMotifDetail(entry.motifDetail || "");
    setHorairesDemandeObs(entry.horairesDemandeObs || "");
    setOriginKind(entry.originKind || "TELESURVEILLANCE");
    setOriginDetail(entry.originDetail || "");
    setIntervenantId(entry.intervenantId || "");
    setArrivalTime(entry.arrivalTime || "");
    setDepartureTime(entry.departureTime || "");
    setWorkOrderNumber(entry.workOrderNumber || "");
    setReport(entry.report || "");
    setClosureCustomValues(entry.closureCustomValues || {});
    setLogicalDateOverride(
      String((entry.closureCustomValues || {}).date_logique_passage || (entry.closureCustomValues || {}).date_logique || "").trim()
    );
  }, [isOpen, isCreateMode, entry?.id]);

  const isRondeCreateDirty = useMemo(() => {
    if (!isCreateMode) return false;
    const linked = linkedInterventionEntry;
    const siteChangedFromLinked =
      linked?.id &&
      (siteId !== (linked.siteId || "") || intervenantId !== (linked.intervenantId || ""));
    const siteOrIvStandalone = !linked?.id && Boolean(siteId || intervenantId);
    const motifChangedFromDefault =
      Boolean(motifTypeId && defaultMotifTypeId && motifTypeId !== defaultMotifTypeId);
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
        requestDate !== formatNowDate() ||
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

  const createCloseGuard = useCreateModalCloseGuard({
    enabled: isPureCreateMode && !showCancelReasonDialog,
    isDirty: isRondeCreateDirty,
    onClose
  });

  if (!isOpen) return null;

  const buildPayload = (freshPending?: { siteDisplay?: string; intervenantName?: string }): RondeSavePayload | null => {
    const resolvedSiteDisplay = selectedSite
      ? formatSiteSelectedLabel(selectedSite)
      : (freshPending?.siteDisplay ?? "").trim() || (entry?.siteDisplay || "").trim();
    const resolvedIntervenantName = selectedIntervenant
      ? selectedIntervenant.name
      : (freshPending?.intervenantName ?? "").trim() || (entry?.intervenantName || "").trim();

    if (!resolvedSiteDisplay) {
      setFieldError("Le site est obligatoire.");
      return null;
    }
    if (!resolvedIntervenantName) {
      setFieldError("Le prestataire est obligatoire.");
      return null;
    }
    if (!requestDate) {
      setFieldError("La date de la demande est obligatoire.");
      return null;
    }
    if (!motifTypeId.trim()) {
      setFieldError("Le motif est obligatoire.");
      return null;
    }
    if (originKind === "CLIENT" && !originDetail.trim()) {
      setFieldError("Le nom du client est obligatoire lorsque l'origine est « Client ».");
      return null;
    }

    const arrivalNorm = normalizeTimeForSave(arrivalTime);
    const departureNorm = normalizeTimeForSave(departureTime);
    if (arrivalNorm && !isValidTime(arrivalNorm)) {
      setFieldError("L'heure d'arrivée est invalide.");
      return null;
    }
    if (departureNorm && !isValidTime(departureNorm)) {
      setFieldError("L'heure de départ est invalide.");
      return null;
    }

    const execArrival = isPureCreateMode ? "" : arrivalNorm;
    const execDeparture = isPureCreateMode ? "" : departureNorm;
    const execBon = isPureCreateMode ? "" : workOrderNumber.trim();
    const execReport = isPureCreateMode ? "" : report.trim();
    const execLogicalDate = isPureCreateMode ? "" : effectiveLogicalDate;
    const nextClosureCustomValues = {
      ...closureCustomValues
    };
    if (execLogicalDate) {
      nextClosureCustomValues.date_logique_passage = execLogicalDate;
      nextClosureCustomValues.date_logique = execLogicalDate;
      if (logicalDateTransitionLabel) {
        nextClosureCustomValues.transition_date = logicalDateTransitionLabel;
      } else {
        delete nextClosureCustomValues.transition_date;
      }
    } else {
      delete nextClosureCustomValues.date_logique_passage;
      delete nextClosureCustomValues.date_logique;
      delete nextClosureCustomValues.transition_date;
    }

    return {
      siteId: selectedSite?.id || null,
      siteDisplay: resolvedSiteDisplay,
      requestDate,
      motifTypeId: motifTypeId.trim(),
      motifDetail: motifDetail.trim(),
      horairesDemandeObs: horairesDemandeObs.trim(),
      originKind,
      originDetail: originDetail.trim(),
      intervenantId: selectedIntervenant?.id || null,
      intervenantName: resolvedIntervenantName,
      arrivalTime: execArrival,
      departureTime: execDeparture,
      workOrderNumber: execBon,
      report: execReport,
      closureCustomValues: nextClosureCustomValues
    };
  };

  const resolveLabelTemplate = (template: string) =>
    resolveRondeClosureLabelTemplate(template, {
      siteCode: selectedSite?.code || "",
      siteName: selectedSite?.name || "",
      siteLabel: selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || "",
      profileLabel: activePlannedProfile?.label || "",
      prestataire: selectedIntervenant?.name || entry?.intervenantName || "",
      typePassage:
        entry?.source === "PLANIFIE" && entry?.plannedRoundKind
          ? formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind)
          : "",
      heureDemandee: plannedLineRequestedTime || "",
      dateDuJour: formatDateShortFr(requestDate),
      heureArrivee: arrivalTime.trim(),
      heureDepart: departureTime.trim(),
      numeroBon: workOrderNumber.trim(),
      compteRendu: report.trim()
    });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (statusActionBusy) return;
    if (formLockedClosed || formLockedCanceled) return;
    setFieldError("");

    let freshPending: { siteDisplay?: string; intervenantName?: string } | undefined;
    if (!entry) {
      const pendingPrep = await createPendingRefsIfNeededForSubmit({
        selectedFromCatalogSite: Boolean(selectedSite),
        selectedFromCatalogIntervenant: Boolean(selectedIntervenant),
        pendingCode,
        pendingName,
        pendingIntervenantInput: pendingIntervenantName,
        onCreatePendingSite,
        onCreatePendingIntervenant
      });
      if (!pendingPrep.ok) {
        if (pendingPrep.errorMessage) setFieldError(pendingPrep.errorMessage);
        return;
      }
      if (pendingPrep.createdSiteDisplay || pendingPrep.createdIntervenantName) {
        freshPending = {
          ...(pendingPrep.createdSiteDisplay ? { siteDisplay: pendingPrep.createdSiteDisplay } : {}),
          ...(pendingPrep.createdIntervenantName ? { intervenantName: pendingPrep.createdIntervenantName } : {})
        };
      }
    }

    const payload = buildPayload(freshPending);
    if (!payload) return;

    if (!entry) {
      setStatusActionBusy("save");
      const source: RondeSource =
        createPreset?.source === "PLANIFIE" ? "PLANIFIE" : linkedInterventionEntry?.id ? "LIEE_INTERVENTION" : "URGENCE";
      let ok = false;
      try {
        ok = await onCreate({
          ...payload,
          source,
          originInterventionId: linkedInterventionEntry?.id || null,
          plannedProfileId: createPreset?.source === "PLANIFIE" ? createPreset.plannedProfileId : null,
          plannedRoundKind: createPreset?.source === "PLANIFIE" ? createPreset.plannedRoundKind : null,
          plannedSlotKey: createPreset?.source === "PLANIFIE" ? createPreset.plannedSlotKey : null
        });
      } finally {
        setStatusActionBusy(null);
      }
      if (ok) onClose();
      return;
    }

    setStatusActionBusy("save");
    let updated: RondeEntry | null = null;
    try {
      updated = await onUpdate(entry.id, entry.updatedAt, payload);
    } finally {
      setStatusActionBusy(null);
    }
    if (updated) onClose();
  };

  const submitCancellation = async () => {
    if (!entry) return;
    if (statusActionBusy) return;
    const cleanReason = cancelReasonInput.trim();
    if (!cleanReason) {
      setFieldError("Le motif d'annulation est obligatoire.");
      return;
    }
    setFieldError("");
    setStatusActionBusy("cancel");
    const ok = await onSetStatus(entry.id, entry.updatedAt, "ANNULE", cleanReason);
    setStatusActionBusy(null);
    if (ok) {
      setShowCancelReasonDialog(false);
      setCancelReasonInput("");
      onClose();
    }
  };

  const lockFields = formLockedClosed || formLockedCanceled;
  const lockActions = statusActionBusy !== null;
  /** Rondes « exceptionnelles » (hors planifié) : la demande est figée après création ; seul le terrain / clôture reste éditable. */
  const lockExceptionnelleDemandeSection =
    !isCreateMode &&
    entry != null &&
    (entry.source === "URGENCE" || entry.source === "LIEE_INTERVENTION");
  const lockDemandeFields = lockFields || lockExceptionnelleDemandeSection;

  /** En mode rapport (édition ou passage planifié), masquer la section demande et garder uniquement le CR. */
  const masquerSectionsDemandePlanifiee = useReportModalLayout;

  const demandeFormSections = (
    <>
      <CreateFormSection title="Date de la demande">
        <div className="mc-form-grid mc-form-grid-main">
          <label className="mc-field">
            <span>Date de la demande</span>
            <input type="date" value={requestDate} disabled={lockDemandeFields} onChange={(e) => setRequestDate(e.target.value)} />
          </label>
        </div>
      </CreateFormSection>

      {isCreateMode ? (
        <SearchEntry
          sites={sites}
          intervenants={intervenants}
          selectedSite={selectedSite}
          selectedIntervenant={selectedIntervenant}
          onSelectedSiteChange={(site) => {
            setSiteId(site?.id || "");
            if (site) {
              setShowPendingSiteForm(false);
              setPendingCode("");
              setPendingName("");
            }
          }}
          onSelectedIntervenantChange={(item) => {
            setIntervenantId(item?.id || "");
            if (item) {
              setShowPendingIntervenantForm(false);
              setPendingIntervenantName("");
            }
          }}
          showPendingSiteForm={showPendingSiteForm}
          showPendingIntervenantForm={showPendingIntervenantForm}
          onTogglePendingSite={() => setShowPendingSiteForm((c) => !c)}
          onTogglePendingIntervenant={() => setShowPendingIntervenantForm((c) => !c)}
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
                <span>Nouveau prestataire</span>
                <input value={pendingIntervenantName} onChange={(e) => setPendingIntervenantName(e.target.value)} />
              </label>
            </div>
          )}
          onNotify={onNotify}
          siteButtonLabel="À créer ?"
          intervenantButtonLabel="À créer ?"
          showSiteAction={!selectedSite}
          showIntervenantAction={!selectedIntervenant}
        />
      ) : (
        <>
          <label className="mc-field">
            <span>Site</span>
            <SiteDisplayCopyButton
              siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
              onNotify={onNotify}
            />
          </label>
          {entry?.source === "PLANIFIE" ? (
            <div className="mc-field mc-field-full">
              <p className="muted mc-ref-hint" style={{ marginBottom: 8 }}>
                Prestataire défini à la <strong>création</strong> du passage planifié. Modifiez uniquement si une autre équipe est intervenue
                ou en cas d&apos;erreur de saisie.
              </p>
              <IntervenantSearchInput
                intervenants={intervenants}
                disabled={lockFields}
                selectedIntervenant={selectedIntervenant}
                onSelectedIntervenantChange={(item) => setIntervenantId(item?.id || "")}
              />
            </div>
          ) : (
            <label className="mc-field">
              <span>Prestataire</span>
              <input
                value={selectedIntervenant?.name || entry?.intervenantName || "—"}
                readOnly
                className="mc-input-readonly"
              />
            </label>
          )}
        </>
      )}

      {!rondeMotifs.length ? (
        <p className="error mc-field-error">
          Aucun motif de ronde configuré. Les responsables peuvent en créer dans Paramètres → Données → Motifs ronde.
        </p>
      ) : null}

      <CreateFormSection title="Motif de la demande">
        <div className="mc-form-grid mc-form-grid-main mc-form-grid-align-start">
          <label className="mc-field mc-field-full">
            <span>Motif</span>
            <select
              value={motifTypeId}
              disabled={lockDemandeFields}
              required={Boolean(rondeMotifs.length)}
              onChange={(e) => setMotifTypeId(e.target.value)}
            >
              {rondeMotifs.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mc-field mc-field-full">
            <span>Commentaire du motif (facultatif)</span>
            <textarea
              value={motifDetail}
              disabled={lockDemandeFields}
              onChange={(e) => setMotifDetail(e.target.value)}
              className="mc-textarea mc-textarea-inline-pair"
              rows={3}
            />
          </label>
        </div>
      </CreateFormSection>

      <CreateFormSection title="Observation principale">
        <label className="mc-field mc-field-full">
          <span>Observation principale (horaire, consigne, etc.)</span>
          <textarea
            value={horairesDemandeObs}
            disabled={lockDemandeFields}
            onChange={(e) => setHorairesDemandeObs(e.target.value)}
            className="mc-textarea mc-textarea-inline-pair"
            rows={4}
          />
        </label>
      </CreateFormSection>

      <CreateFormSection title="Origine de la demande">
        <div className="mc-form-grid mc-form-grid-main mc-form-grid-align-start">
          <label className="mc-field mc-field-full">
            <span>Origine de la demande</span>
            <select
              value={originKind}
              disabled={lockDemandeFields}
              onChange={(e) => setOriginKind(e.target.value as RondeOriginKind)}
            >
              <option value="TELESURVEILLANCE">Télésurveillance</option>
              <option value="CLIENT">Client</option>
              <option value="AUTRE">Autre</option>
            </select>
          </label>
          <label className="mc-field mc-field-full">
            <span>
              {originKind === "CLIENT" ? "Nom du client (obligatoire)" : "Commentaire sur l'origine (facultatif)"}
            </span>
            <textarea
              value={originDetail}
              disabled={lockDemandeFields}
              onChange={(e) => setOriginDetail(e.target.value)}
              className="mc-textarea mc-textarea-inline-pair"
              rows={3}
            />
          </label>
        </div>
      </CreateFormSection>
    </>
  );

  const formBody = (
    <form className="mc-entry-form" onSubmit={onSubmit}>
      {!masquerSectionsDemandePlanifiee ? demandeFormSections : null}

      {showExecutionBlock ? (
        <>
          <h4 className="mc-modal-section-title">Compte rendu</h4>

          <p className="ronde-cr-summary-type">
            {(entry?.source === "PLANIFIE" && entry.plannedRoundKind) || isPlannedCreatePreset
              ? formatPlannedRoundKindLabel(
                  ((entry?.plannedRoundKind || createPreset?.plannedRoundKind) ?? "RANDOM") as RondePlannedRoundKind
                )
              : selectedMotifLabel}
          </p>
          <p className="muted ronde-cr-summary-journee">
            Journée du <strong>{formatJourneeDuLabel(requestDate)}</strong>
            {plannedLineRequestedTime ? (
              <>
                {" "}
                — Heure demandée <strong>{plannedLineRequestedTime}</strong>
              </>
            ) : null}
          </p>

          <div className="mc-form-grid mc-form-grid-main mc-form-grid-align-start">
            <label className="mc-field">
              <span>Site</span>
              <SiteDisplayCopyButton
                siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
                onNotify={onNotify}
              />
            </label>
            {entry?.source === "PLANIFIE" ? (
              <IntervenantSearchInput
                intervenants={intervenants}
                disabled={lockFields}
                selectedIntervenant={selectedIntervenant}
                onSelectedIntervenantChange={(item) => setIntervenantId(item?.id || "")}
              />
            ) : (
              <label className="mc-field">
                <span>Prestataire</span>
                <input
                  value={selectedIntervenant?.name || entry?.intervenantName || "—"}
                  readOnly
                  className="mc-input-readonly"
                />
              </label>
            )}
          </div>
          {entry?.source === "PLANIFIE" ? (
            <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Prestataire défini à la <strong>création</strong> du passage planifié. Modifiez uniquement si une autre équipe est intervenue ou en
              cas d&apos;erreur de saisie.
            </p>
          ) : null}

          <div className="mc-form-grid mc-form-grid-main">
            <label className="mc-field">
              <span>Heure arrivée</span>
              <TimeInput
                value={arrivalTime}
                disabled={lockFields}
                onChange={setArrivalTime}
              />
            </label>
            <label className="mc-field">
              <span>Heure départ</span>
              <TimeInput
                value={departureTime}
                disabled={lockFields}
                onChange={setDepartureTime}
              />
            </label>
          </div>
          <div className="mc-form-grid mc-form-grid-main">
            <label className="mc-field">
              <span>N° bon</span>
              <input value={workOrderNumber} disabled={lockFields} onChange={(e) => setWorkOrderNumber(e.target.value)} />
            </label>
            <label className="mc-field">
              <span>Durée de la ronde (minutes)</span>
              <input
                value={durationMinutes == null ? "" : String(durationMinutes)}
                readOnly
                className="mc-input-readonly"
                title="Calculée à partir des heures d'arrivée et de départ"
              />
            </label>
          </div>
          {logicalDateComputed.shiftedAfterMidnight ? (
            <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Date logique auto-calculée : ronde de nuit après minuit détectée.
            </p>
          ) : null}
          <label className="mc-field mc-field-full">
            <span>Compte rendu</span>
            <textarea value={report} disabled={lockFields} onChange={(e) => setReport(e.target.value)} className="mc-textarea" />
          </label>
          {formLockedClosed && entry?.source !== "PLANIFIE" && isRondeAutoClosureReport(report) ? (
            <p className="muted mc-ref-hint" style={{ marginTop: 0 }}>
              Clôture automatique (plus de 5 jours après la date de passage). Utilisez <strong>Rouvrir</strong> puis reclôturez pour saisir
              les heures effectives, le n° de bon ou un compte rendu terrain.
            </p>
          ) : null}
          {((!isCreateMode && entry?.source === "PLANIFIE") || isPlannedCreatePreset) ? (
            <RondeClosureFieldsEditor
              profile={activePlannedProfile ?? undefined}
              values={closureCustomValues}
              onValuesChange={setClosureCustomValues}
              resolveFieldLabel={resolveLabelTemplate}
              disabled={lockFields}
            />
          ) : null}
        </>
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
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fermer
            </button>
          </div>
          <div className="mc-modal-footer-end">
            <button
              type="button"
              className="btn-danger"
              disabled={lockFields || entry?.status === "ANNULE" || lockActions}
              onClick={() => {
                setFieldError("");
                setCancelReasonInput("");
                setShowCancelReasonDialog(true);
              }}
            >
              {statusActionBusy === "cancel" ? "Annulation…" : "Annuler la ronde"}
            </button>
            <button
              type="button"
              className="btn-light"
              disabled={lockFields || entry?.status === "CLOTURE" || lockActions}
              onClick={async () => {
                if (statusActionBusy) return;
                setFieldError("");
                const isPlannedClosure = Boolean(isPlannedCreatePreset || entry?.source === "PLANIFIE");
                if (isPlannedClosure && !report.trim()) {
                  setFieldError("Le compte rendu est obligatoire avant clôture.");
                  return;
                }
                const payload = buildPayload();
                if (!payload) return;
                setStatusActionBusy("close");
                if (!entry && isPlannedCreatePreset) {
                  const ok = await onCreate({
                    ...payload,
                    source: "PLANIFIE",
                    originInterventionId: null,
                    plannedProfileId: createPreset?.plannedProfileId ?? null,
                    plannedRoundKind: createPreset?.plannedRoundKind ?? null,
                    plannedSlotKey: createPreset?.plannedSlotKey ?? null,
                    initialStatus: "CLOTURE"
                  });
                  setStatusActionBusy(null);
                  if (ok) onClose();
                  return;
                }
                if (!entry) {
                  setStatusActionBusy(null);
                  return;
                }
                const updated = await onUpdate(entry.id, entry.updatedAt, payload);
                if (!updated) {
                  setStatusActionBusy(null);
                  return;
                }
                const ok = await onSetStatus(updated.id, updated.updatedAt, "CLOTURE");
                setStatusActionBusy(null);
                if (ok) onClose();
              }}
            >
              {statusActionBusy === "close" ? "Clôture…" : "Clôturer la ronde"}
            </button>
            {entry?.status === "CLOTURE" || entry?.status === "ANNULE" ? (
              <button
                type="button"
                className="mc-btn-primary"
                disabled={lockActions}
                onClick={async () => {
                  if (!entry) return;
                  if (statusActionBusy) return;
                  setStatusActionBusy("reopen");
                  const ok = await onSetStatus(entry.id, entry.updatedAt, "EN_COURS");
                  setStatusActionBusy(null);
                  if (ok) onClose();
                }}
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
      <div className="modal-overlay" onClick={isPureCreateMode ? createCloseGuard.requestClose : onClose}>
      <section
        className={`modal main-log-modal main-courante-entry-modal ${splitLinkedLayout ? "linked-ronde-split-modal" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!useReportModalLayout ? (
          <CreateEntryModalHeader kind="ronde" onCloseRequest={createCloseGuard.requestClose} />
        ) : (
          <header className="mc-modal-head mc-modal-head-compact">
            <h3 className="mc-modal-title">Rapport de ronde</h3>
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
              <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
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
      <ConfirmModal
        isOpen={isPureCreateMode ? createCloseGuard.showDiscardConfirm : false}
        title="Quitter la saisie ?"
        message="Êtes-vous sûr de vouloir quitter sans créer l'entrée ? Les données saisies seront perdues."
        cancelLabel="Rester"
        confirmLabel="Quitter sans créer"
        confirmClassName="btn-danger"
        onCancel={createCloseGuard.cancelDiscard}
        onConfirm={createCloseGuard.confirmDiscardAndClose}
      />

      <ConfirmModal
        isOpen={showCancelReasonDialog}
        title="Motif d'annulation"
        message="Le motif est obligatoire pour annuler la ronde."
        confirmLabel="Confirmer annulation"
        confirmClassName="btn-danger"
        confirmDisabled={!cancelReasonInput.trim()}
        cancelLabel="Fermer"
        onCancel={() => setShowCancelReasonDialog(false)}
        onConfirm={() => void submitCancellation()}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>Motif *</span>
          <textarea
            className="mc-textarea"
            rows={2}
            value={cancelReasonInput}
            onChange={(e) => setCancelReasonInput(e.target.value)}
            placeholder="Ex: doublon / demande annulée"
            autoFocus
          />
        </label>
      </ConfirmModal>
    </>
  );
}
