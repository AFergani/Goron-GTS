/**
 * Modale création / édition / facturation d’une intervention.
 *
 * Site, prestataire, passage (dates arrivée/départ), clôture, annulation, champs variables Word,
 * liens ronde/gardiennage, pending refs, garde fermeture création.
 * Hydratation : `[isOpen, mode, entry?.id]`.
 *
 * Fichier volumineux (~1050 lignes) — candidat à découpage par sections.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link2 } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import type { InterventionEntry, InterventionSavePayload } from "../model/intervention.types";
import { formatSiteSelectedLabel } from "../../mainCourante/model/siteSearch";
import { SiteSearchInput } from "../../mainCourante/components/SiteSearchInput";
import { IntervenantSearchInput } from "./IntervenantSearchInput";
import { createPendingRefsIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { PendingSiteIntervenantRefActions } from "../../common/components/PendingSiteIntervenantRefActions";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { FormVariableDef } from "../../settings/model/formVariables.types";
import { normalizeWordTemplateFieldType } from "../../settings/model/wordTemplateFieldTypes";
import { formatDateShortFr } from "../../rondes/utils/formatDateShortFr";
import {
  computeInterventionLogicalDate,
  inferArrivalDateFromEntry,
  inferDepartureDateFromEntry,
  isIsoDate,
  isValidTime,
  normalizeTimeForSave,
  resolvePassageDatesForSave,
  validatePassageDateTimes
} from "../utils/interventionPassageDates";

type Mode = "create" | "edit" | "facturation";
type InterventionClosureExtraFieldDef = {
  id: string;
  sortOrder: number;
  fieldKey: string;
  label: string;
  fieldType: "text" | "textarea" | "number" | "time" | "select" | "toggle";
  placeholder: string;
  options: string[];
  createdAt: string;
  updatedAt: string;
};

type InterventionEntryModalProps = {
  isOpen: boolean;
  mode: Mode;
  entry: InterventionEntry | null;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  requesterRole: Role;
  isResponsable: boolean;
  onClose: () => void;
  onCreate: (payload: InterventionSavePayload) => Promise<boolean>;
  onUpdate: (id: string, expectedUpdatedAt: string, payload: InterventionSavePayload) => Promise<InterventionEntry | null>;
  onSetStatus: (
    id: string,
    expectedUpdatedAt: string,
    status: "EN_COURS" | "CLOTURE" | "ANNULE",
    cancellationReason?: string
  ) => Promise<boolean>;
  onSetBillingStatus: (
    id: string,
    expectedUpdatedAt: string,
    status: "FACTURABLE" | "NON_FACTURABLE",
    reason?: string
  ) => Promise<boolean>;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant: (name: string) => Promise<boolean>;
  onNotify?: (message: string) => void;
  /** Après réouverture depuis clôturé : garder la modale ouverte (ex. passer la page en mode édition). */
  onAfterReopen?: () => void;
  /** Accès page Rondes : affiche le bouton de création d'une ronde liée. */
  canOpenLinkedRonde?: boolean;
  onOpenLinkedRonde?: () => void;
  /** Accès page Gardiennage : affiche le bouton de création d'un gardiennage lié. */
  canOpenLinkedGardiennage?: boolean;
  onOpenLinkedGardiennage?: () => void;
};

function formatNowDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Saisie compacte : 4 chiffres => HH:MM (ex. 1015 => 10:15).
 * À 3 chiffres on n'insère pas encore les ":" : sinon « 101 » avant le « 5 »
 * était interprété à tort comme l'ancien raccourci 9h30 (01:01).
 */
function padTimeInput(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getMissingInterventionClosureFields(params: {
  requestDate: string;
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  departureTime: string;
  workOrderNumber: string;
  report: string;
}): string[] {
  const missing: string[] = [];
  const { arrivalDate, departureDate } = resolvePassageDatesForSave({
    requestDate: params.requestDate,
    arrivalDate: params.arrivalDate,
    arrivalTime: params.arrivalTime,
    departureDate: params.departureDate,
    departureTime: params.departureTime
  });
  const arrivalNorm = normalizeTimeForSave(params.arrivalTime);
  const departureNorm = normalizeTimeForSave(params.departureTime);
  if (!isIsoDate(arrivalDate) || !arrivalNorm || !isValidTime(arrivalNorm)) {
    missing.push("date et heure d'arrivée");
  }
  if (!isIsoDate(departureDate) || !departureNorm || !isValidTime(departureNorm)) {
    missing.push("date et heure de départ");
  }
  if (!String(params.workOrderNumber || "").trim()) missing.push("N° du bon d'intervention");
  if (!String(params.report || "").trim()) missing.push("compte-rendu");
  return missing;
}

export function InterventionEntryModal({
  isOpen,
  mode,
  entry,
  sites,
  intervenants,
  requesterRole,
  isResponsable,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
  onSetBillingStatus,
  onCreatePendingSite,
  onCreatePendingIntervenant,
  onNotify,
  onAfterReopen,
  canOpenLinkedRonde,
  onOpenLinkedRonde,
  canOpenLinkedGardiennage,
  onOpenLinkedGardiennage
}: InterventionEntryModalProps) {
  const [siteId, setSiteId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestDate, setRequestDate] = useState(formatNowDate());
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
  const [showBillingReasonDialog, setShowBillingReasonDialog] = useState(false);
  const [billingReasonInput, setBillingReasonInput] = useState("");
  const [wordExtraDefs, setWordExtraDefs] = useState<InterventionClosureExtraFieldDef[]>([]);
  const [exportExtraValues, setExportExtraValues] = useState<Record<string, string>>({});
  const [logicalDateOverride, setLogicalDateOverride] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const selectedSite = useMemo(() => sites.find((site) => site.id === siteId) || null, [siteId, sites]);
  const selectedIntervenant = useMemo(
    () => intervenants.find((intervenant) => intervenant.id === intervenantId) || null,
    [intervenantId, intervenants]
  );
  const isBillable = entry?.billingStatus !== "NON_FACTURABLE";
  const isCreateMode = mode === "create";
  const isFacturationMode = mode === "facturation";
  const showRequiredFieldsOnly = isCreateMode;
  const allowFacturationToggle = Boolean(entry && isResponsable && isFacturationMode);
  const canFixKnownReferences = !isCreateMode && isResponsable;
  const lockCoreFields = !isCreateMode && !canFixKnownReferences;
  const formLockedClosed = entry?.status === "CLOTURE";

  // Même principe que MainCouranteEntryModal : ne pas lier la synchro aux refresh de liste ni aux référentiels.
  useEffect(() => {
    if (!isOpen) return;
    setFieldError("");
    if (!isCreateMode) return;
    setShowPendingSiteForm(false);
    setShowPendingIntervenantForm(false);
    setShowCancelReasonDialog(false);
    setCancelReasonInput("");
    setShowBillingReasonDialog(false);
    setBillingReasonInput("");
    setPendingCode("");
    setPendingName("");
    setPendingIntervenantName("");
    setSiteId("");
    setRequestReason("");
    setRequestDate(formatNowDate());
    setRequestTime("");
    setArrivalDate("");
    setArrivalTime("");
    setDepartureDate("");
    setDepartureTime("");
    setWorkOrderNumber("");
    setReport("");
    setIntervenantId("");
    setExportExtraValues({});
    setLogicalDateOverride("");
  }, [isOpen, isCreateMode]);

  useEffect(() => {
    if (!isOpen || isCreateMode || !entry) return;
    setFieldError("");
    setShowPendingSiteForm(false);
    setShowPendingIntervenantForm(false);
    setShowCancelReasonDialog(false);
    setCancelReasonInput("");
    setShowBillingReasonDialog(false);
    setBillingReasonInput("");
    setPendingCode("");
    setPendingName("");
    setPendingIntervenantName("");
    setSiteId(entry.siteId || "");
    setRequestReason(entry.requestReason || "");
    const requestDateIso = isIsoDate(entry.requestDate) ? entry.requestDate : formatNowDate();
    setRequestDate(requestDateIso);
    setRequestTime(entry.requestTime || "");
    setArrivalDate(inferArrivalDateFromEntry(entry) || requestDateIso);
    setArrivalTime(entry.arrivalTime || "");
    setDepartureDate(inferDepartureDateFromEntry(entry) || requestDateIso);
    setDepartureTime(entry.departureTime || "");
    setWorkOrderNumber(entry.workOrderNumber || "");
    setReport(entry.report || "");
    setIntervenantId(entry.intervenantId || "");
    setExportExtraValues({ ...(entry.exportExtraValues ?? {}) });
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

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void gtsApiClient.listFormVariables({ requesterRole }).then((rows) => {
      if (cancelled) return;
      const selectedFamille = String(selectedSite?.famille || "").trim().toUpperCase();
      const filtered = (rows as FormVariableDef[])
        .filter((row) => row.assignments.some((a) => a.kind === "FORM" && a.value === "INTERVENTION"))
        .filter((row) => {
          const siteScopes = row.assignments.filter((a) => a.kind === "SITE").map((a) => String(a.value || "").trim());
          const familleScopes = row.assignments.filter((a) => a.kind === "FAMILLE").map((a) => String(a.value || "").trim().toUpperCase());
          if (!siteScopes.length && !familleScopes.length) return true;
          if (siteScopes.length && selectedSite?.id && siteScopes.includes(selectedSite.id)) return true;
          if (familleScopes.length && selectedFamille && familleScopes.includes(selectedFamille)) return true;
          return false;
        })
        .map((r) => ({
          id: r.id,
          sortOrder: r.sortOrder,
          fieldKey: r.fieldKey,
          label: r.label,
          fieldType: normalizeWordTemplateFieldType(r.fieldType),
          placeholder: r.placeholder ?? "",
          options: Array.isArray(r.options) ? r.options : [],
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }));
      setWordExtraDefs(filtered);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, requesterRole, selectedSite?.id, selectedSite?.famille]);

  useEffect(() => {
    if (!wordExtraDefs.length) return;
    setExportExtraValues((prev) => {
      const next = { ...prev };
      for (const d of wordExtraDefs) {
        if (next[d.fieldKey] === undefined) next[d.fieldKey] = "";
      }
      return next;
    });
  }, [wordExtraDefs]);

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
        requestDate !== formatNowDate()
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
    requestDate
  ]);

  const createCloseGuard = useCreateModalCloseGuard({
    enabled: isCreateMode && !showCancelReasonDialog && !showBillingReasonDialog,
    isDirty: isInterventionCreateDirty,
    onClose
  });

  if (!isOpen) return null;

  const buildPayload = (freshPending?: { siteDisplay?: string; intervenantName?: string }): InterventionSavePayload | null => {
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
    if (!requestReason.trim()) {
      setFieldError("Le motif est obligatoire.");
      return null;
    }
    if (!requestDate) {
      setFieldError("La date de demande est obligatoire.");
      return null;
    }
    const requestTimeNorm = normalizeTimeForSave(requestTime);
    const arrivalTimeNorm = normalizeTimeForSave(arrivalTime);
    const departureTimeNorm = normalizeTimeForSave(departureTime);
    if (!isValidTime(requestTimeNorm)) {
      setFieldError("L'heure de demande est invalide.");
      return null;
    }
    if (arrivalTimeNorm && !isValidTime(arrivalTimeNorm)) {
      setFieldError("L'heure d'arrivée est invalide.");
      return null;
    }
    if (departureTimeNorm && !isValidTime(departureTimeNorm)) {
      setFieldError("L'heure de départ est invalide.");
      return null;
    }
    const passageValidation = validatePassageDateTimes({
      requestDate,
      requestTime: requestTimeNorm,
      arrivalDate: passageDatesResolved.arrivalDate,
      arrivalTime: arrivalTimeNorm,
      departureDate: passageDatesResolved.departureDate,
      departureTime: departureTimeNorm
    });
    if (passageValidation) {
      setFieldError(passageValidation);
      return null;
    }
    const extraPayload = Object.fromEntries(
      Object.entries(exportExtraValues || {}).map(([k, v]) => [k, String(v ?? "").trim()])
    );
    if (effectiveLogicalDate) {
      extraPayload.date_logique_passage = effectiveLogicalDate;
      extraPayload.date_logique = effectiveLogicalDate;
      if (logicalDateTransitionLabel) {
        extraPayload.transition_date = logicalDateTransitionLabel;
      } else {
        delete extraPayload.transition_date;
      }
    }
    return {
      siteId: selectedSite?.id || null,
      siteDisplay: resolvedSiteDisplay,
      requestReason: requestReason.trim(),
      requestDate,
      requestTime: requestTimeNorm,
      arrivalDate: passageDatesResolved.arrivalDate || null,
      arrivalTime: arrivalTimeNorm,
      departureDate: passageDatesResolved.departureDate || null,
      departureTime: departureTimeNorm,
      workOrderNumber: workOrderNumber.trim(),
      report: report.trim(),
      intervenantId: selectedIntervenant?.id || null,
      intervenantName: resolvedIntervenantName,
      exportExtraValues: extraPayload
    };
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isActionSubmitting) return;
    if (formLockedClosed) return;
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
      setIsActionSubmitting(true);
      let ok = false;
      try {
        ok = await onCreate(payload);
      } finally {
        setIsActionSubmitting(false);
      }
      if (ok) onClose();
      return;
    }
    setIsActionSubmitting(true);
    let updated: InterventionEntry | null = null;
    try {
      updated = await onUpdate(entry.id, entry.updatedAt, payload);
    } finally {
      setIsActionSubmitting(false);
    }
    if (updated) onClose();
  };

  const submitCancellation = async () => {
    if (isActionSubmitting) return;
    if (!entry) return;
    const cleanReason = cancelReasonInput.trim();
    if (!cleanReason) {
      setFieldError("Le motif d'annulation est obligatoire.");
      return;
    }
    setFieldError("");
    setIsActionSubmitting(true);
    let ok = false;
    try {
      ok = await onSetStatus(entry.id, entry.updatedAt, "ANNULE", cleanReason);
    } finally {
      setIsActionSubmitting(false);
    }
    if (ok) {
      setShowCancelReasonDialog(false);
      setCancelReasonInput("");
      onClose();
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={isCreateMode ? createCloseGuard.requestClose : onClose}>
        <section className="modal main-log-modal main-courante-entry-modal" onClick={(e) => e.stopPropagation()}>
          {isCreateMode ? (
            <CreateEntryModalHeader kind="intervention" onCloseRequest={createCloseGuard.requestClose} />
          ) : (
            <header className="mc-modal-head mc-modal-head-compact">
              <h3 className="mc-modal-title">
                {isFacturationMode ? "Facturation intervention" : "Édition intervention"}
              </h3>
              <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
                ×
              </button>
            </header>
          )}
        <div className="mc-field-section mc-field-section-tight">
          <form className="mc-entry-form" onSubmit={onSubmit}>
            <CreateFormSection title="Date et heure de la demande">
              <div className="mc-form-grid mc-form-grid-main">
                <label className="mc-field">
                  <span>Date de la demande</span>
                  <input
                    type="date"
                    value={requestDate}
                    disabled={formLockedClosed}
                    onChange={(e) => setRequestDate(e.target.value)}
                  />
                </label>
                <label className="mc-field">
                  <span>Heure de la demande</span>
                  <input
                    type="time"
                    value={requestTime}
                    disabled={formLockedClosed}
                    onChange={(e) => setRequestTime(e.target.value)}
                  />
                </label>
              </div>
            </CreateFormSection>

            <CreateFormSection title="Site et prestataire">
              <div className="mc-form-grid mc-form-grid-main">
                {isCreateMode ? (
                  <>
                    <SiteSearchInput
                      sites={sites}
                      disabled={false}
                      selectedSite={selectedSite}
                      onSelectedSiteChange={(site) => {
                        setSiteId(site?.id || "");
                        if (site) {
                          setShowPendingSiteForm(false);
                          setPendingCode("");
                          setPendingName("");
                        }
                      }}
                      copyNotify={onNotify}
                    />
                    <IntervenantSearchInput
                      intervenants={intervenants}
                      disabled={false}
                      selectedIntervenant={selectedIntervenant}
                      onSelectedIntervenantChange={(item) => {
                        setIntervenantId(item?.id || "");
                        if (item) {
                          setShowPendingIntervenantForm(false);
                          setPendingIntervenantName("");
                        }
                      }}
                    />
                  </>
                ) : canFixKnownReferences ? (
                  <>
                    <SiteSearchInput
                      sites={sites}
                      disabled={formLockedClosed}
                      selectedSite={selectedSite}
                      onSelectedSiteChange={(site) => setSiteId(site?.id || "")}
                      copyNotify={onNotify}
                    />
                    <IntervenantSearchInput
                      intervenants={intervenants}
                      disabled={formLockedClosed}
                      selectedIntervenant={selectedIntervenant}
                      onSelectedIntervenantChange={(item) => setIntervenantId(item?.id || "")}
                    />
                  </>
                ) : (
                  <>
                    <label className="mc-field">
                      <span>Site</span>
                      <SiteDisplayCopyButton
                        siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
                        onNotify={onNotify}
                      />
                    </label>
                    <label className="mc-field">
                      <span>Prestataire</span>
                      <input value={selectedIntervenant?.name || entry?.intervenantName || "—"} readOnly className="mc-input-readonly" />
                    </label>
                  </>
                )}
              </div>
              {isCreateMode ? (
                <PendingSiteIntervenantRefActions
                  selectedSite={selectedSite}
                  selectedIntervenant={selectedIntervenant}
                  showPendingSiteForm={showPendingSiteForm}
                  showPendingIntervenantForm={showPendingIntervenantForm}
                  onTogglePendingSite={() => setShowPendingSiteForm((current) => !current)}
                  onTogglePendingIntervenant={() => setShowPendingIntervenantForm((current) => !current)}
                  intervenantButtonLabel="Prestataire introuvable"
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
                />
              ) : null}
            </CreateFormSection>

            <CreateFormSection title="Motif de l'intervention">
              <label className="mc-field mc-field-full">
                <span>Motif</span>
                <textarea
                  value={requestReason}
                  disabled={lockCoreFields || formLockedClosed}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className={`mc-textarea intervention-motif-textarea ${lockCoreFields || formLockedClosed ? "mc-textarea-readonly" : ""}`}
                />
              </label>
            </CreateFormSection>
            {!showRequiredFieldsOnly ? (
              <>
                <h4 className="mc-modal-section-title">Compte rendu</h4>
                <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                  Les dates d&apos;arrivée et de départ reprennent par défaut la date de demande ; modifiez-les si le passage a eu lieu un autre jour.
                </p>
                <div className="intervention-passage-row">
                  <div className="intervention-passage-group">
                    <span className="intervention-passage-group__label">Arrivée</span>
                    <div className="intervention-passage-group__inputs">
                      <input
                        type="date"
                        value={arrivalDate}
                        disabled={formLockedClosed}
                        aria-label="Date d'arrivée"
                        onChange={(e) => setArrivalDate(e.target.value)}
                      />
                      <input
                        type="time"
                        value={arrivalTime}
                        disabled={formLockedClosed}
                        aria-label="Heure d'arrivée"
                        onChange={(e) => setArrivalTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="intervention-passage-group">
                    <span className="intervention-passage-group__label">Départ</span>
                    <div className="intervention-passage-group__inputs">
                      <input
                        type="date"
                        value={departureDate}
                        disabled={formLockedClosed}
                        aria-label="Date de départ"
                        onChange={(e) => setDepartureDate(e.target.value)}
                      />
                      <input
                        type="time"
                        value={departureTime}
                        disabled={formLockedClosed}
                        aria-label="Heure de départ"
                        onChange={(e) => setDepartureTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <label className="mc-field intervention-passage-bon">
                    <span>N° bon intervention</span>
                    <input
                      value={workOrderNumber}
                      disabled={formLockedClosed}
                      onChange={(e) => setWorkOrderNumber(e.target.value)}
                    />
                  </label>
                </div>
                {logicalDateComputed.shiftedAfterMidnight ? (
                  <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    Date logique auto-calculée : passage après minuit détecté.
                  </p>
                ) : null}
                <label className="mc-field mc-field-full">
                  <span>Compte-rendu</span>
                  <textarea
                    value={report}
                    disabled={formLockedClosed}
                    onChange={(e) => setReport(e.target.value)}
                    className="mc-textarea"
                  />
                </label>
                {wordExtraDefs.length ? (
                  <>
                    <h4 className="mc-modal-section-title">Champs complémentaires (export Word)</h4>
                    <div className="mc-form-grid mc-form-grid-manager">
                      {wordExtraDefs.map((def) => {
                        const value = exportExtraValues[def.fieldKey] ?? "";
                        const ph = def.placeholder?.trim() ? def.placeholder : undefined;
                        const setVal = (next: string) =>
                          setExportExtraValues((prev) => ({ ...prev, [def.fieldKey]: next }));

                        if (def.fieldType === "textarea") {
                          return (
                            <label key={def.fieldKey} className="mc-field mc-field-full">
                              <span>{def.label}</span>
                              <textarea
                                value={value}
                                disabled={formLockedClosed}
                                onChange={(e) => setVal(e.target.value)}
                                placeholder={ph}
                                className="mc-textarea"
                                rows={3}
                              />
                            </label>
                          );
                        }
                        if (def.fieldType === "number") {
                          return (
                            <label key={def.fieldKey} className="mc-field mc-field-full">
                              <span>{def.label}</span>
                              <input
                                type="number"
                                step="any"
                                value={value}
                                disabled={formLockedClosed}
                                onChange={(e) => setVal(e.target.value)}
                                placeholder={ph}
                              />
                            </label>
                          );
                        }
                        if (def.fieldType === "time") {
                          return (
                            <label key={def.fieldKey} className="mc-field mc-field-full">
                              <span>{def.label}</span>
                              <input
                                type="time"
                                step={60}
                                value={value}
                                disabled={formLockedClosed}
                                onChange={(e) => setVal(e.target.value)}
                                title={ph ?? def.label}
                              />
                            </label>
                          );
                        }
                        if (def.fieldType === "select") {
                          return (
                            <label key={def.fieldKey} className="mc-field mc-field-full">
                              <span>{def.label}</span>
                              <select
                                value={value}
                                disabled={formLockedClosed}
                                onChange={(e) => setVal(e.target.value)}
                                aria-label={def.label}
                              >
                                <option value="">—</option>
                                {def.options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }
                        return (
                          <label key={def.fieldKey} className="mc-field mc-field-full">
                            <span>{def.label}</span>
                            <input
                              value={value}
                              disabled={formLockedClosed}
                              onChange={(e) => setVal(e.target.value)}
                              placeholder={ph}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            {fieldError ? <p className="error mc-field-error">{fieldError}</p> : null}
            {isCreateMode ? (
              <CreateEntryModalFooter
                hintContent={null}
                onCancel={createCloseGuard.requestClose}
                submitting={isActionSubmitting}
              />
            ) : (
            <div className="mc-modal-footer mc-modal-footer-split">
              <div className="mc-modal-footer-start">
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Fermer
                </button>
              </div>
              <div className="mc-modal-footer-end">
                {allowFacturationToggle ? (
                  <div style={{ width: 170, flexShrink: 0 }}>
                    <ToggleSwitch
                      label="Facturable"
                      labelFirst
                      checked={isBillable}
                      onChange={(next) => {
                        if (!entry) return;
                        if (next) {
                          void onSetBillingStatus(entry.id, entry.updatedAt, "FACTURABLE");
                          return;
                        }
                        setFieldError("");
                        setBillingReasonInput("");
                        setShowBillingReasonDialog(true);
                      }}
                    />
                  </div>
                ) : null}
                {entry && mode === "edit" && canOpenLinkedRonde && onOpenLinkedRonde ? (
                  <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onOpenLinkedRonde}>
                    <span className="mc-footer-btn-with-icon">
                      <Link2 size={16} aria-hidden />
                      Créer une ronde
                    </span>
                  </button>
                ) : null}
                {entry && mode === "edit" && canOpenLinkedGardiennage && onOpenLinkedGardiennage ? (
                  <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onOpenLinkedGardiennage}>
                    <span className="mc-footer-btn-with-icon">
                      <Link2 size={16} aria-hidden />
                      Créer un gardiennage
                    </span>
                  </button>
                ) : null}
                {entry?.status === "EN_COURS" ? (
                  <>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={isActionSubmitting}
                      onClick={() => {
                        setFieldError("");
                        setCancelReasonInput("");
                        setShowCancelReasonDialog(true);
                      }}
                    >
                      Annuler l&apos;intervention
                    </button>
                    <button type="submit" className="mc-btn-primary" disabled={isActionSubmitting}>
                      {isActionSubmitting ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    <button
                      type="button"
                      className="btn-light"
                      disabled={isActionSubmitting}
                      onClick={async () => {
                        if (isActionSubmitting) return;
                        setFieldError("");
                        const missingForClose = getMissingInterventionClosureFields({
                          requestDate,
                          arrivalDate: passageDatesResolved.arrivalDate,
                          arrivalTime,
                          departureDate: passageDatesResolved.departureDate,
                          departureTime,
                          workOrderNumber,
                          report
                        });
                        if (missingForClose.length) {
                          setFieldError(
                            `Clôture impossible: complétez ${missingForClose.join(", ")}.`
                          );
                          return;
                        }
                        const payload = buildPayload();
                        if (!payload) return;
                        setIsActionSubmitting(true);
                        let updated: InterventionEntry | null = null;
                        try {
                          updated = await onUpdate(entry.id, entry.updatedAt, payload);
                        } finally {
                          if (!updated) setIsActionSubmitting(false);
                        }
                        if (!updated) {
                          return;
                        }
                        let ok = false;
                        try {
                          ok = await onSetStatus(updated.id, updated.updatedAt, "CLOTURE");
                        } finally {
                          setIsActionSubmitting(false);
                        }
                        if (ok) onClose();
                      }}
                    >
                      Clôturer l&apos;intervention
                    </button>
                  </>
                ) : entry?.status === "CLOTURE" || entry?.status === "ANNULE" ? (
                  <button
                    type="button"
                    className="mc-btn-primary"
                    disabled={isActionSubmitting}
                    onClick={async () => {
                      if (isActionSubmitting) return;
                      setIsActionSubmitting(true);
                      let ok = false;
                      try {
                        ok = await onSetStatus(entry.id, entry.updatedAt, "EN_COURS");
                      } finally {
                        setIsActionSubmitting(false);
                      }
                      if (ok) onAfterReopen?.();
                    }}
                  >
                    Rouvrir
                  </button>
                ) : entry ? (
                  <button type="submit" className="mc-btn-primary" disabled={isActionSubmitting}>
                    {isActionSubmitting ? "Enregistrement…" : "Enregistrer"}
                  </button>
                ) : null}
              </div>
            </div>
            )}
          </form>
        </div>
      </section>
    </div>
      <ConfirmModal
        isOpen={createCloseGuard.showDiscardConfirm}
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
        message="Le motif est obligatoire pour annuler l'intervention."
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
            placeholder="Ex: intervention lancée par erreur"
            autoFocus
          />
        </label>
      </ConfirmModal>
      <ConfirmModal
        isOpen={showBillingReasonDialog}
        title="Justification non facturable"
        message="Une justification est obligatoire pour passer l'intervention en non facturable."
        confirmLabel="Confirmer non facturable"
        confirmClassName="btn-danger"
        confirmDisabled={!billingReasonInput.trim()}
        cancelLabel="Fermer"
        onCancel={() => setShowBillingReasonDialog(false)}
        onConfirm={() => {
          void (async () => {
            if (!entry) return;
            const cleanReason = billingReasonInput.trim();
            if (!cleanReason) {
              setFieldError("Une justification est obligatoire pour passer en non facturable.");
              return;
            }
            setFieldError("");
            const ok = await onSetBillingStatus(entry.id, entry.updatedAt, "NON_FACTURABLE", cleanReason);
            if (ok) {
              setShowBillingReasonDialog(false);
              setBillingReasonInput("");
            }
          })();
        }}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>Justification *</span>
          <textarea
            className="mc-textarea"
            rows={2}
            value={billingReasonInput}
            onChange={(e) => setBillingReasonInput(e.target.value)}
            placeholder="Ex: intervention hors contrat"
            autoFocus
          />
        </label>
      </ConfirmModal>
    </>
  );
}
