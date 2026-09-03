/**
 * Modale main courante : création, édition opérateur, traitement responsable, lecture seule.
 *
 * Site optionnel, type d’anomalie, proposition site en attente, garde fermeture en création.
 * Hydratation formulaire : `[isOpen, mode, entry?.id]`.
 */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { SearchEntry } from "../../common/components/SearchEntry";
import type { MainCouranteCreatePayload, MainCouranteEntry, MainCouranteSavePayload } from "../model/mainCourante.types";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import type { AnomalyTypeRef, SiteRef } from "../../../types";
import { createPendingSiteIfNeededForSubmit } from "../../common/utils/pendingRefsBeforeSave";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { CreateEntryModalFooter, CreateEntryModalHeader } from "../../common/components/CreateEntryModalChrome";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { getDefaultSystemRefId } from "../../common/model/systemReferentials";
import type { NotifyToast } from "../../common/model/toast.types";
import { formatMainCouranteDateOrDash } from "../export/mainCouranteExportFormat";

export type EntryModalMode = "create" | "edit" | "manager" | "view";

type MainCouranteEntryModalProps = {
  isOpen: boolean;
  mode: EntryModalMode;
  operatorName: string;
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
    payload: { managerObservation: string; decision: "suivre" | "cloture" }
  ) => Promise<boolean>;
  onReopenEntry?: (entry: MainCouranteEntry) => Promise<boolean>;
};

function buildPayload(
  selectedSite: SiteRef | null,
  anomalyTypeId: string,
  anomalyTypes: AnomalyTypeRef[],
  information: string,
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
      information: information.trim()
    };
  }
  return {
    siteId: null,
    siteDisplay: (freshSiteDisplay ?? "").trim(),
    anomalyTypeId: typ.id,
    anomalyTypeLabel: typ.label,
    information: information.trim()
  };
}

export function MainCouranteEntryModal({
  isOpen,
  mode,
  operatorName,
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
  onReopenEntry
}: MainCouranteEntryModalProps) {
  const [selectedSite, setSelectedSite] = useState<SiteRef | null>(null);
  const [dateCouranteAffichee, setDateCouranteAffichee] = useState(() => formatMainCouranteDateOrDash(new Date().toISOString()));
  const [anomalyTypeId, setAnomalyTypeId] = useState("");
  const [information, setInformation] = useState("");
  const [priseEnCompteAffichee, setPriseEnCompteAffichee] = useState("");
  const [managerObservation, setManagerObservation] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [showPendingSiteForm, setShowPendingSiteForm] = useState(false);
  const isViewMode = mode === "view";

  useEffect(() => {
    if (!isOpen) return;
    setFieldError("");
    if (mode !== "create") return;
    // En création, ne pas réinitialiser le formulaire à chaque auto-refresh des référentiels.
    setDateCouranteAffichee(formatMainCouranteDateOrDash(new Date().toISOString()));
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
      setPriseEnCompteAffichee(formatMainCouranteDateOrDash(new Date().toISOString()));
    } else {
      setPriseEnCompteAffichee(formatMainCouranteDateOrDash(entry.priseEnCompteAt));
    }
  }, [isOpen, mode, entry?.id]);

  /** Titres hors création (la création utilise CreateEntryModalHeader). */
  const title =
    mode === "edit"
      ? "Modifier l'entrée"
      : mode === "view"
        ? "Consulter l'entrée"
        : entry?.status === "EN_ATTENTE"
          ? "Validation"
          : "Suivi / clôture";
  const secondColumnLabel = "Date de création";
  const secondColumnValue = mode === "edit" && entry ? formatMainCouranteDateOrDash(entry.createdAt) : dateCouranteAffichee;

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
      setFieldError("L'observation (opérateur) est obligatoire.");
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

    const payload = buildPayload(selectedSite, anomalyTypeId, anomalyTypes, information, freshSiteDisplay);
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
      ok = await onManagerAction(entry, { managerObservation: obs, decision });
    } finally {
      setIsActionSubmitting(false);
    }
    if (ok) onClose();
  };

  const isMainCouranteCreateDirty = useMemo(() => {
    if (mode !== "create") return false;
    return Boolean(
      information.trim() ||
        anomalyTypeId ||
        selectedSite ||
        pendingCode.trim() ||
        pendingName.trim() ||
        showPendingSiteForm
    );
  }, [mode, information, anomalyTypeId, selectedSite, pendingCode, pendingName, showPendingSiteForm]);

  const createCloseGuard = useCreateModalCloseGuard({
    enabled: mode === "create",
    isDirty: isMainCouranteCreateDirty,
    onClose
  });

  if (!isOpen) {
    return null;
  }

  const submitLabel = mode === "create" ? "Créer" : "Enregistrer";

  if (mode === "manager" || mode === "view") {
    if (!entry || (mode === "manager" && entry.status === "CLOTURE")) return null;
    const dateClotureAffichee = formatMainCouranteDateOrDash(entry.closedAt);
    return (
      <div className="modal-overlay" onClick={onClose}>
        <section className="modal main-log-modal main-courante-manager-modal" onClick={(ev) => ev.stopPropagation()}>
          <header className="mc-modal-head mc-modal-head-compact">
            <h3 className="mc-modal-title">{title}</h3>
            <button type="button" className="mc-modal-close" aria-label="Fermer" onClick={onClose}>
              ×
            </button>
          </header>

          <div className="mc-field-section mc-field-section-tight">
            <div className="mc-op-readonly-block">
              <p className="mc-block-title">Données opérateur (lecture seule)</p>
              <div className="mc-form-grid mc-form-grid-main">
                <label className="mc-field">
                  <span>Opérateur</span>
                  <input value={entry.operatorName} readOnly className="mc-input-readonly" />
                </label>
                <label className="mc-field">
                  <span>Date de création</span>
                  <input value={formatMainCouranteDateOrDash(entry.createdAt)} readOnly className="mc-input-readonly" />
                </label>
                <label className="mc-field">
                  <span>Site</span>
                  <SiteDisplayCopyButton siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
                </label>
                <label className="mc-field">
                  <span>Type d’anomalie</span>
                  <input value={entry.anomalyTypeLabel} readOnly className="mc-input-readonly" />
                </label>
                <label className="mc-field mc-field-span-2">
                  <span>Information</span>
                  <textarea value={entry.information} readOnly className="mc-textarea mc-textarea-readonly" rows={4} />
                </label>
              </div>
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
                  <label className="mc-field">
                    <span className="mc-label-row">
                      <span>Prise en compte</span>
                      <span className="mc-badge">auto</span>
                    </span>
                    <input value={priseEnCompteAffichee} readOnly className="mc-input-readonly" />
                  </label>
                  <label className="mc-field">
                    <span className="mc-label-row">
                      <span>Date de clôture</span>
                      <span className="mc-badge">auto</span>
                    </span>
                    <input value={dateClotureAffichee} readOnly className="mc-input-readonly" />
                  </label>
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

                {fieldError ? <p className="error mc-field-error">{fieldError}</p> : null}

                <div className="mc-modal-footer mc-modal-footer-split mc-modal-footer-manager">
                  <div className="mc-modal-footer-start">
                    <button type="button" className="btn-ghost" onClick={onClose}>
                      Fermer
                    </button>
                  </div>
                  <div className="mc-modal-footer-end">
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
    );
  }

  return (
    <>
      <div className="modal-overlay" onClick={mode === "create" ? createCloseGuard.requestClose : onClose}>
        <section className="modal main-log-modal main-courante-entry-modal" onClick={(e) => e.stopPropagation()}>
          {mode === "create" ? (
            <CreateEntryModalHeader kind="mainCourante" onCloseRequest={createCloseGuard.requestClose} />
          ) : (
            <header className="mc-modal-head mc-modal-head-compact">
              <h3 className="mc-modal-title">{title}</h3>
              <button type="button" className="mc-modal-close" aria-label="Fermer" onClick={onClose}>
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
            <CreateFormSection title="Date de création">
              <div className="mc-form-grid mc-form-grid-main">
                <label className="mc-field">
                  <span>Opérateur</span>
                  <input value={operatorName} readOnly className="mc-input-readonly" />
                </label>
                <label className="mc-field">
                  <span>{secondColumnLabel}</span>
                  <input value={secondColumnValue} readOnly className="mc-input-readonly" />
                </label>
              </div>
            </CreateFormSection>

            {mode === "create" ? (
              <SearchEntry
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
                showIntervenantField={false}
                onNotify={onNotify}
                showSiteAction={!selectedSite}
              />
            ) : (
              <div className="mc-form-grid mc-form-grid-main">
                <SiteDisplayCopyButton
                  siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
                  onNotify={onNotify}
                />
              </div>
            )}

            <CreateFormSection title="Type et observation (opérateur)">
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
              <label className="mc-field mc-field-full">
                <span>Observation (opérateur)</span>
                <textarea
                  className="mc-textarea"
                  value={information}
                  onChange={(e) => setInformation(e.target.value)}
                  placeholder="Décrire l'événement, l'incident ou la consigne…"
                  required
                />
              </label>
            </CreateFormSection>

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
                  <button type="button" className="btn-ghost" onClick={onClose}>
                    Fermer
                  </button>
                </div>
                <div className="mc-modal-footer-end">
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
    </>
  );
}
