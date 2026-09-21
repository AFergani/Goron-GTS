/**
 * Modale main courante : création, édition opérateur, traitement responsable, lecture seule.
 *
 * Site optionnel, type d’anomalie, proposition site en attente, garde fermeture en création.
 * Hydratation formulaire : `[isOpen, mode, entry?.id]`.
 */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { SearchEntry } from "../../common/components/SearchEntry";
import { PendingSiteInlineFields } from "../../common/components/PendingRefInlineFields";
import type { MainCouranteCreatePayload, MainCouranteEntry, MainCouranteSavePayload } from "../model/mainCourante.types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import type { AnomalyTypeRef, Role, SiteRef } from "../../../types";
import { createPendingSiteIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import { RequestDateTimeField } from "../../common/components/RequestDateTimeField";
import { WordExportRowButtons } from "../../common/components/ExportFileButtons";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { useFormVariableFields } from "../../common/hooks/useFormVariableFields";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { getDefaultSystemRefId } from "../../common/model/systemReferentials";
import type { NotifyToast } from "../../common/model/toast.types";
import { splitIsoToLocalDateTime } from "../../common/utils/localDateIso";
import { reportTitleWithDailyCode } from "../../common/utils/dailyEntryCode";

export type EntryModalMode = "create" | "edit" | "manager" | "view";

type MainCouranteEntryModalProps = {
  isOpen: boolean;
  mode: EntryModalMode;
  operatorName: string;
  requesterRole: Role;
  /** Obligatoire si mode édition/manager */
  entry: MainCouranteEntry | null;
  managerDisplayName: string;
  sites: SiteRef[];
  anomalyTypes: AnomalyTypeRef[];
  referencesLoading: boolean;
  referencesError: string;
  canReopenEntry?: boolean;
  onNotify?: NotifyToast;
  onClose: () => void;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreate: (payload: MainCouranteCreatePayload) => Promise<boolean>;
  onUpdate?: (id: string, payload: MainCouranteSavePayload, expectedUpdatedAt: string) => Promise<boolean>;
  onManagerAction?: (
    entry: MainCouranteEntry,
    payload: {
      managerObservation: string;
      decision: "suivre" | "cloture";
      exportExtraValues?: Record<string, string>;
    }
  ) => Promise<boolean>;
  onReopenEntry?: (entry: MainCouranteEntry) => Promise<boolean>;
  onSaveWord?: (entry: MainCouranteEntry) => void;
  onOpenWord?: (entry: MainCouranteEntry) => void;
  getWordFilePath?: (entryId: string) => string | null;
};

function buildPayload(
  selectedSite: SiteRef | null,
  anomalyTypeId: string,
  anomalyTypes: AnomalyTypeRef[],
  information: string,
  extraValues: Record<string, string>,
  freshSiteDisplay?: string | null
): MainCouranteSavePayload | null {
  const typ = anomalyTypes.find((t) => t.id === anomalyTypeId);
  if (!typ) return null;
  if (selectedSite) {
    return {
      siteId: selectedSite.id,
      siteDisplay: formatSiteSelectedLabel(selectedSite),
      anomalyTypeId: typ.id,
      anomalyTypeLabel: typ.label,
      information: information.trim(),
      exportExtraValues: extraValues
    };
  }
  return {
    siteId: null,
    siteDisplay: (freshSiteDisplay ?? "").trim(),
    anomalyTypeId: typ.id,
    anomalyTypeLabel: typ.label,
    information: information.trim(),
    exportExtraValues: extraValues
  };
}

export function MainCouranteEntryModal({
  isOpen,
  mode,
  operatorName,
  requesterRole,
  entry,
  managerDisplayName,
  sites,
  anomalyTypes,
  referencesLoading,
  referencesError,
  canReopenEntry = false,
  onNotify,
  onClose,
  onCreatePendingSite,
  onCreate,
  onUpdate,
  onManagerAction,
  onReopenEntry,
  onSaveWord,
  onOpenWord,
  getWordFilePath
}: MainCouranteEntryModalProps) {
  const [selectedSite, setSelectedSite] = useState<SiteRef | null>(null);
  const [createdAtIso, setCreatedAtIso] = useState(() => new Date().toISOString());
  const [anomalyTypeId, setAnomalyTypeId] = useState("");
  const [information, setInformation] = useState("");
  const [priseEnCompteIso, setPriseEnCompteIso] = useState("");
  const [managerObservation, setManagerObservation] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const extrasSite = useMemo(() => {
    if (selectedSite) return selectedSite;
    if (!entry?.siteId) return null;
    return sites.find((site) => site.id === entry.siteId) ?? null;
  }, [selectedSite, entry?.siteId, sites]);
  const extras = useFormVariableFields({
    isOpen,
    requesterRole,
    formTarget: "MAIN_COURANTE",
    site: extrasSite,
    seedValues: mode === "create" ? {} : entry?.exportExtraValues,
    seedKey: mode === "create" ? "create" : `${mode}:${entry?.id || ""}`
  });
  const isViewMode = mode === "view";
  const wordFileButtons =
    entry && onSaveWord && onOpenWord ? (
      <WordExportRowButtons
        variant="modal"
        disabled={isActionSubmitting}
        onExportWord={() => onSaveWord(entry)}
        onOpenReport={() => onOpenWord(entry)}
        canOpenReport={Boolean(getWordFilePath?.(entry.id))}
        lastFilePath={getWordFilePath?.(entry.id) ?? null}
      />
    ) : null;

  useEffect(() => {
    if (!isOpen) return;
    setFieldError("");
    if (mode !== "create") return;
    // En création, ne pas réinitialiser le formulaire à chaque auto-refresh des référentiels.
    setCreatedAtIso(new Date().toISOString());
    setSelectedSite(null);
    setAnomalyTypeId("");
    setInformation("");
    setPendingCode("");
    setPendingName("");
    setShowPendingSiteForm(false);
  }, [isOpen, mode]);

  /** Pré-sélection du type système « Voir Observation » une fois la liste chargée. */
  useEffect(() => {
    if (!isOpen || mode !== "create") return;
    if (anomalyTypeId) return;
    const defaultId = getDefaultSystemRefId(anomalyTypes);
    if (defaultId) setAnomalyTypeId(defaultId);
  }, [isOpen, mode, anomalyTypeId, anomalyTypes]);

  useEffect(() => {
    if (!isOpen || mode !== "edit" || !entry) return;
    setFieldError("");
    setAnomalyTypeId(entry.anomalyTypeId);
    setInformation(entry.information);
    setPendingCode("");
    setPendingName("");
    setShowPendingSiteForm(false);
    if (entry.siteId) {
      const found = sites.find((s) => s.id === entry.siteId) || null;
      setSelectedSite(found);
    } else {
      setSelectedSite(null);
    }
  }, [isOpen, mode, entry?.id]);

  useEffect(() => {
    if (!isOpen || (mode !== "manager" && mode !== "view") || !entry) return;
    setFieldError("");
    if (mode === "manager") {
      setManagerObservation("");
    }
    if (mode === "manager" && entry.status === "EN_ATTENTE") {
      setPriseEnCompteIso(new Date().toISOString());
    } else {
      setPriseEnCompteIso(entry.priseEnCompteAt || "");
    }
  }, [isOpen, mode, entry?.id]);

  /** Titres hors création (la création utilise CreateEntryModalHeader). */
  const title = reportTitleWithDailyCode(
    mode === "edit"
      ? "Modifier l'entrée"
      : mode === "view"
        ? "Consulter l'entrée"
        : entry?.status === "EN_ATTENTE"
          ? "Validation"
          : "Suivi / clôture",
    entry?.dailyCode
  );
  const createdAtParts = splitIsoToLocalDateTime(mode === "edit" && entry ? entry.createdAt : createdAtIso);
  const missingTypes = !referencesLoading && anomalyTypes.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isActionSubmitting) return;
    setFieldError("");
    if (referencesLoading) {
      setFieldError("Chargement des listes en cours…");
      return;
    }
    if (!anomalyTypeId) {
      setFieldError("Le type d’anomalie est obligatoire.");
      return;
    }
    if (!information.trim()) {
      setFieldError("L'observation est obligatoire.");
      return;
    }
    let freshSiteDisplay: string | undefined;
    if (mode === "create") {
      const prep = await createPendingSiteIfNeededForSubmit({
        selectedFromCatalogSite: Boolean(selectedSite),
        pendingCode,
        pendingName,
        onCreatePendingSite
      });
      if (!prep.ok) {
        if (prep.errorMessage) setFieldError(prep.errorMessage);
        return;
      }
      if (prep.createdSiteDisplay) {
        freshSiteDisplay = prep.createdSiteDisplay;
      }
    }

    const payload = buildPayload(
      selectedSite,
      anomalyTypeId,
      anomalyTypes,
      information,
      extras.values,
      freshSiteDisplay
    );
    if (!payload) {
      setFieldError("Type d’anomalie invalide.");
      return;
    }
    if (mode === "create") {
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
    if (mode === "edit" && entry && onUpdate) {
      setIsActionSubmitting(true);
      let ok = false;
      try {
        ok = await onUpdate(entry.id, payload, entry.updatedAt);
      } finally {
        setIsActionSubmitting(false);
      }
      if (ok) onClose();
    }
  };

  const runManagerSubmit = async (e: FormEvent | null, decision: "suivre" | "cloture") => {
    if (e) e.preventDefault();
    if (isActionSubmitting) return;
    if (!entry || !onManagerAction) return;
    setFieldError("");
    const obs = managerObservation.trim();
    if (!obs) {
      setFieldError("L’observation responsable est obligatoire.");
      return;
    }
    setIsActionSubmitting(true);
    let ok = false;
    try {
      ok = await onManagerAction(entry, {
        managerObservation: obs,
        decision,
        exportExtraValues: extras.values
      });
    } finally {
      setIsActionSubmitting(false);
    }
    if (ok) onClose();
  };

  const defaultAnomalyTypeId = useMemo(() => getDefaultSystemRefId(anomalyTypes), [anomalyTypes]);

  const extrasFilled = Object.values(extras.values).some((value) => String(value || "").trim());

  const isMainCouranteDirty = useMemo(() => {
    if (mode === "view") return false;
    if (mode === "manager") return managerObservation.trim().length > 0;
    if (mode === "create") {
      const typeChangedFromDefault = Boolean(anomalyTypeId && defaultAnomalyTypeId && anomalyTypeId !== defaultAnomalyTypeId);
      return Boolean(
        information.trim() ||
          typeChangedFromDefault ||
          selectedSite ||
          pendingCode.trim() ||
          pendingName.trim() ||
          showPendingSiteForm ||
          extrasFilled
      );
    }
    if (mode === "edit" && entry) {
      const extrasChanged = Object.keys({ ...extras.values, ...(entry.exportExtraValues || {}) }).some(
        (key) => String(extras.values[key] || "").trim() !== String((entry.exportExtraValues || {})[key] || "").trim()
      );
      return Boolean(
        information !== (entry.information || "") ||
          anomalyTypeId !== (entry.anomalyTypeId || "") ||
          extrasChanged
      );
    }
    return false;
  }, [
    mode,
    managerObservation,
    information,
    anomalyTypeId,
    defaultAnomalyTypeId,
    selectedSite,
    pendingCode,
    pendingName,
    showPendingSiteForm,
    extrasFilled,
    extras.values,
    entry
  ]);

  const createCloseGuard = useCreateModalCloseGuard({
    enabled: isOpen,
    isDirty: isMainCouranteDirty,
    onClose
  });

  if (!isOpen) {
    return null;
  }

  const submitLabel = mode === "create" ? "Créer" : "Enregistrer";
  const discardConfirm = (
    <DiscardConfirmModal
      isOpen={createCloseGuard.showDiscardConfirm}
      kind={mode === "create" ? "create" : "edit"}
      onCancel={createCloseGuard.cancelDiscard}
      onConfirm={createCloseGuard.confirmDiscardAndClose}
    />
  );

  if (mode === "manager" || mode === "view") {
    if (!entry || (mode === "manager" && entry.status === "CLOTURE")) return null;
    const createdParts = splitIsoToLocalDateTime(entry.createdAt);
    const priseParts = splitIsoToLocalDateTime(priseEnCompteIso);
    const clotureParts = splitIsoToLocalDateTime(entry.closedAt);
    return (
      <>
      <div className="modal-overlay" onClick={createCloseGuard.requestClose}>
        <section className="modal main-log-modal main-courante-entry-modal main-courante-manager-modal" onClick={(ev) => ev.stopPropagation()}>
          <header className="mc-modal-head mc-modal-head-compact">
            <h3 className="mc-modal-title">{title}</h3>
            <button type="button" className="mc-modal-close" aria-label="Fermer" onClick={createCloseGuard.requestClose}>
              ×
            </button>
          </header>

          <div className="mc-field-section mc-field-section-tight">
            <div className="mc-op-readonly-block">
              <p className="mc-block-title">Données opérateur (lecture seule)</p>
              <div className="request-head-row">
                <RequestDateTimeField
                  date={createdParts.date}
                  time={createdParts.time}
                  label="Date de création"
                  disabled
                />
                <label className="mc-field">
                  <span>Opérateur</span>
                  <input value={entry.operatorName} readOnly className="mc-input-readonly" />
                </label>
                <label className="mc-field">
                  <span>Site</span>
                  <SiteDisplayCopyButton siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
                </label>
              </div>
              <div className="mc-form-grid mc-form-grid-main">
                <label className="mc-field">
                  <span>Type d’anomalie</span>
                  <input value={entry.anomalyTypeLabel} readOnly className="mc-input-readonly" />
                </label>
                <label className="mc-field mc-field-span-2">
                  <span>Observation</span>
                  <textarea value={entry.information} readOnly className="mc-textarea mc-textarea-readonly" rows={4} />
                </label>
              </div>
              <FormVariableFields
                defs={extras.requestDefs}
                values={extras.values}
                onValuesChange={extras.setValues}
                disabled
                title="Champs de la demande"
              />
            </div>

            <div className="mc-manager-block">
              <div className="mc-manager-head">
                <span className="mc-manager-accent" aria-hidden />
                <span className="mc-manager-title">{isViewMode ? "Vue responsable (lecture seule)" : "Traitement responsable"}</span>
                {!isViewMode ? <span className="mc-manager-badge muted">Accès réservé</span> : null}
              </div>

              <form
                className="mc-entry-form"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <div className="mc-form-grid mc-form-grid-manager">
                  <label className="mc-field">
                    <span className="mc-label-row">
                      <span>Responsable</span>
                      <span className="mc-badge">auto</span>
                    </span>
                    <input value={isViewMode ? entry.managerName || "—" : managerDisplayName} readOnly className="mc-input-readonly" />
                  </label>
                  <RequestDateTimeField
                    date={priseParts.date}
                    time={priseParts.time}
                    label="Prise en compte"
                    disabled
                    dateLabelExtra={<span className="mc-badge">auto</span>}
                  />
                  <RequestDateTimeField
                    date={clotureParts.date}
                    time={clotureParts.time}
                    label="Date de clôture"
                    disabled
                    dateLabelExtra={<span className="mc-badge">auto</span>}
                  />
                </div>

                <label className="mc-field mc-field-full">
                  <span>Observation</span>
                  <textarea
                    className="mc-textarea"
                    value={isViewMode ? entry.managerObservation || "" : managerObservation}
                    onChange={(e) => setManagerObservation(e.target.value)}
                    placeholder={
                      isViewMode
                        ? "Aucune observation"
                        : entry.status === "EN_COURS"
                          ? "Saisie obligatoire : ajoutez une note de suivi ou de clôture (cumulée aux observations précédentes)."
                          : "Saisie obligatoire : compléments, suivi, décision…"
                    }
                    rows={5}
                    required={!isViewMode}
                    readOnly={isViewMode}
                  />
                </label>
                <FormVariableFields
                  defs={extras.closureDefs}
                  values={extras.values}
                  onValuesChange={extras.setValues}
                  disabled={isViewMode || isActionSubmitting}
                />

                {fieldError ? <p className="error mc-field-error">{fieldError}</p> : null}

                <div className="mc-modal-footer mc-modal-footer-split mc-modal-footer-manager">
                  <div className="mc-modal-footer-start">
                    <button type="button" className="btn-ghost" onClick={createCloseGuard.requestClose}>
                      Fermer
                    </button>
                  </div>
                  <div className="mc-modal-footer-end">
                    {wordFileButtons}
                    {isViewMode && canReopenEntry && entry.status === "CLOTURE" ? (
                      <button
                        type="button"
                        className="mc-btn-primary"
                        disabled={isActionSubmitting}
                        onClick={async () => {
                          if (isActionSubmitting) return;
                          if (!onReopenEntry) return;
                          setIsActionSubmitting(true);
                          let ok = false;
                          try {
                            ok = await onReopenEntry(entry);
                          } finally {
                            setIsActionSubmitting(false);
                          }
                          if (ok) onClose();
                        }}
                      >
                        Rouvrir
                      </button>
                    ) : null}
                    {!isViewMode ? (
                      <>
                        <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={(e) => runManagerSubmit(e, "suivre")}>
                          À suivre
                        </button>
                        <button type="button" className="mc-btn-primary" disabled={isActionSubmitting} onClick={(e) => runManagerSubmit(e, "cloture")}>
                          Clôturer l&apos;entrée
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
      {discardConfirm}
      </>
    );
  }

  return (
    <>
      <div className="modal-overlay" onClick={createCloseGuard.requestClose}>
        <section className="modal main-log-modal main-courante-entry-modal" onClick={(e) => e.stopPropagation()}>
          {mode === "create" ? (
            <CreateEntryModalHeader kind="mainCourante" onCloseRequest={createCloseGuard.requestClose} />
          ) : (
            <header className="mc-modal-head mc-modal-head-compact">
              <h3 className="mc-modal-title">{title}</h3>
              <button type="button" className="mc-modal-close" aria-label="Fermer" onClick={createCloseGuard.requestClose}>
                ×
              </button>
            </header>
          )}

        <div className="mc-field-section mc-field-section-tight">
          {referencesError ? <p className="error mc-field-error">{referencesError}</p> : null}

          {missingTypes ? (
            <p className="muted mc-ref-hint">Ajoutez des types d’anomalie dans Paramètres → Gestion des données.</p>
          ) : null}

          <form className="mc-entry-form" onSubmit={submit}>
            <div className="request-head-row">
              <RequestDateTimeField
                date={createdAtParts.date}
                time={createdAtParts.time}
                label="Date de création"
                disabled
              />
              <label className="mc-field">
                <span>Opérateur</span>
                <input value={operatorName} readOnly className="mc-input-readonly" />
              </label>
              {mode === "create" ? (
                <SearchEntry
                  className="request-head-row__refs"
                  sites={sites}
                  selectedSite={selectedSite}
                  onSelectedSiteChange={(site) => {
                    setSelectedSite(site);
                    if (site) {
                      setShowPendingSiteForm(false);
                      setPendingCode("");
                      setPendingName("");
                    }
                  }}
                  showPendingSiteForm={showPendingSiteForm}
                  onTogglePendingSite={() => setShowPendingSiteForm((current) => !current)}
                  pendingSiteForm={(
                    <PendingSiteInlineFields
                      code={pendingCode}
                      name={pendingName}
                      onCodeChange={setPendingCode}
                      onNameChange={setPendingName}
                    />
                  )}
                  showIntervenantField={false}
                  onNotify={onNotify}
                  showSiteAction={!selectedSite}
                />
              ) : (
                <div className="request-head-row__refs">
                  <label className="mc-field">
                    <span>Site</span>
                    <SiteDisplayCopyButton
                      siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
                      onNotify={onNotify}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="mc-form-grid mc-form-grid-main">
              <label className="mc-field mc-field-full">
                <span>Type d’anomalie</span>
                <select
                  value={anomalyTypeId}
                  onChange={(e) => setAnomalyTypeId(e.target.value)}
                  disabled={referencesLoading || anomalyTypes.length === 0}
                  required
                >
                  {referencesLoading && !anomalyTypes.length ? (
                    <option value="">Chargement…</option>
                  ) : null}
                  {anomalyTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className={
                extras.requestDefs.length === 1
                  ? "request-motif-row request-motif-row--with-extra"
                  : undefined
              }
            >
              <label className={`mc-field ${extras.requestDefs.length === 1 ? "request-motif-row__motif" : "mc-field-full"}`}>
                <span>Observation</span>
                <textarea
                  className="mc-textarea"
                  value={information}
                  onChange={(e) => setInformation(e.target.value)}
                  placeholder="Décrire l'événement, l'incident ou la consigne…"
                  required
                />
              </label>
              {extras.requestDefs.length === 1 ? (
                <FormVariableFields
                  defs={extras.requestDefs}
                  values={extras.values}
                  onValuesChange={extras.setValues}
                  compact
                />
              ) : null}
            </div>
            {extras.requestDefs.length > 1 ? (
              <FormVariableFields
                defs={extras.requestDefs}
                values={extras.values}
                onValuesChange={extras.setValues}
                title="Champs de la demande"
              />
            ) : null}

            {fieldError ? <p className="error mc-field-error">{fieldError}</p> : null}

            {mode === "create" ? (
              <CreateEntryModalFooter
                hintContent={null}
                onCancel={createCloseGuard.requestClose}
                submitDisabled={missingTypes || Boolean(referencesError)}
                submitLabel={submitLabel}
                submitting={isActionSubmitting}
              />
            ) : (
              <div className="mc-modal-footer mc-modal-footer-split">
                <div className="mc-modal-footer-start">
                  <button type="button" className="btn-ghost" onClick={createCloseGuard.requestClose}>
                    Fermer
                  </button>
                </div>
                <div className="mc-modal-footer-end">
                  {wordFileButtons}
                  <button type="submit" className="mc-btn-primary" disabled={missingTypes || Boolean(referencesError) || isActionSubmitting}>
                    {isActionSubmitting ? "Enregistrement…" : submitLabel}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
      {discardConfirm}
    </>
  );
}
