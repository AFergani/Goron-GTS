/**
 * Modale de clôture d’un gardiennage (horaires effectifs, n° bon, compte rendu).
 *
 * Liens optionnels vers intervention / ronde liées. Reprend le compte-rendu déjà saisi
 * à l’ouverture. Soumission via callback parent (audit côté API).
 */

import { useState, useEffect, useMemo } from "react";
import type { Role, SiteRef } from "../../../types";
import type { GardiennageClosePayload, GardiennageEntry } from "../model/gardiennage.types";
import { TimeInput } from "../../common/components/TimeInput";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { useFormVariableFields } from "../../common/hooks/useFormVariableFields";

type GardiennageCloseModalProps = {
  isOpen: boolean;
  entry: GardiennageEntry | null;
  requesterRole: Role;
  sites: SiteRef[];
  onClose: () => void;
  onSubmit: (id: string, expectedUpdatedAt: string, payload: GardiennageClosePayload) => Promise<boolean>;
  closeDate?: string;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
};

type CloseForm = {
  actualStartTime: string;
  actualEndTime: string;
  workOrderNumber: string;
  closureReport: string;
};

const EMPTY: CloseForm = {
  actualStartTime: "",
  actualEndTime: "",
  workOrderNumber: "",
  closureReport: ""
};

export function GardiennageCloseModal({
  isOpen,
  entry,
  requesterRole,
  sites,
  onClose,
  onSubmit,
  closeDate,
  onNavigateToLinkedIntervention,
  onNavigateToLinkedRonde
}: GardiennageCloseModalProps) {
  const [form, setForm] = useState<CloseForm>(EMPTY);
  const [baseline, setBaseline] = useState<CloseForm>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const selectedSite = useMemo(
    () => (entry?.siteId ? sites.find((site) => site.id === entry.siteId) ?? null : null),
    [entry?.siteId, sites]
  );
  const extras = useFormVariableFields({
    isOpen,
    requesterRole,
    formTarget: "GARDIENNAGE",
    site: selectedSite,
    seedValues: entry?.exportExtraValues,
    seedKey: entry?.id
  });

  useEffect(() => {
    if (!isOpen || !entry) return;
    const seeded: CloseForm = {
      actualStartTime: entry.actualStartTime || "",
      actualEndTime: entry.actualEndTime || "",
      workOrderNumber: entry.workOrderNumber || "",
      closureReport: entry.closureReport || ""
    };
    setForm(seeded);
    setBaseline(seeded);
    setIsSaving(false);
  }, [
    isOpen,
    entry?.id,
    entry?.updatedAt,
    entry?.actualStartTime,
    entry?.actualEndTime,
    entry?.workOrderNumber,
    entry?.closureReport
  ]);

  const extrasFilled = Object.values(extras.values).some((value) => String(value || "").trim());
  const seedExtras = entry?.exportExtraValues || {};
  const extrasChanged = Object.keys({ ...extras.values, ...seedExtras }).some(
    (key) => String(extras.values[key] || "").trim() !== String(seedExtras[key] || "").trim()
  );
  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline) || extrasChanged;
  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } = useCreateModalCloseGuard({
    enabled: isOpen && !isSaving,
    isDirty,
    onClose
  });

  if (!isOpen || !entry) return null;

  const canNavigateIntervention = Boolean(entry.linkedInterventionId) && Boolean(onNavigateToLinkedIntervention);
  const canNavigateRonde = Boolean(entry.linkedRondeId) && Boolean(onNavigateToLinkedRonde);

  const handleSubmit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const ok = await onSubmit(entry.id, entry.updatedAt, {
        actualStartTime: form.actualStartTime,
        actualEndTime: form.actualEndTime,
        workOrderNumber: form.workOrderNumber,
        closureReport: form.closureReport,
        closeDate,
        exportExtraValues: extras.values
      });
      if (ok) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <div className="modal-overlay" onClick={requestClose}>
      <section
        className="modal main-log-modal main-courante-entry-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <header className="mc-modal-head mc-modal-head-compact">
          <div className="mc-modal-title-block">
            <h3 className="mc-modal-title">Clôturer le gardiennage</h3>
            <p className="mc-modal-subtitle muted">{entry.siteDisplay || "—"}</p>
          </div>
          <div className="row-actions">
            {canNavigateRonde && (
              <button
                type="button"
                className="btn-light"
                title="Ouvrir la ronde liée"
                aria-label="Ronde liée"
                onClick={() => {
                  if (!entry.linkedRondeId || !onNavigateToLinkedRonde) return;
                  onNavigateToLinkedRonde(entry.linkedRondeId);
                  onClose();
                }}
              >
                Ronde liée
              </button>
            )}
            {canNavigateIntervention && (
              <button
                type="button"
                className="btn-light"
                title="Ouvrir l'intervention liée"
                aria-label="Intervention liée"
                onClick={() => {
                  if (!entry.linkedInterventionId || !onNavigateToLinkedIntervention) return;
                  onNavigateToLinkedIntervention(entry.linkedInterventionId);
                  onClose();
                }}
              >
                Intervention liée
              </button>
            )}
            <button type="button" className="mc-modal-close" onClick={requestClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </header>

        {/* BODY */}
        <div className="mc-field-section mc-field-section-tight">
          <div className="gardiennage-close-info">
            <span className="muted">
              Horaires prévus :{" "}
              <strong>
                {entry.startTime} → {entry.endTime}
                {entry.crossesMidnight && " +1j"}
              </strong>
            </span>
            {entry.intervenantName && (
              <span className="muted">Prestataire : <strong>{entry.intervenantName}</strong></span>
            )}
          </div>

          <div className="gardiennage-horaires-row" style={{ marginBottom: 8, marginTop: 8 }}>
            <label className="gardiennage-time-field">
              <span className="gardiennage-date-label">Début effectif</span>
              <TimeInput
                value={form.actualStartTime}
                disabled={isSaving}
                onChange={(value) => setForm((f) => ({ ...f, actualStartTime: value }))}
              />
            </label>
            <span className="gardiennage-date-sep">→</span>
            <label className="gardiennage-time-field">
              <span className="gardiennage-date-label">Fin effective</span>
              <TimeInput
                value={form.actualEndTime}
                disabled={isSaving}
                onChange={(value) => setForm((f) => ({ ...f, actualEndTime: value }))}
              />
            </label>
            <label className="gardiennage-time-field">
              <span className="gardiennage-date-label">N° de bon</span>
              <input
                type="text"
                value={form.workOrderNumber}
                disabled={isSaving}
                maxLength={50}
                placeholder="—"
                onChange={(e) => setForm((f) => ({ ...f, workOrderNumber: e.target.value }))}
              />
            </label>
          </div>

          <label className="mc-field mc-field-full">
            <span className="gardiennage-date-label" style={{ display: "block", marginBottom: 4 }}>
              Compte rendu
            </span>
            <textarea
              rows={4}
              value={form.closureReport}
              disabled={isSaving}
              maxLength={3000}
              placeholder="Compte rendu de la prestation effectuée…"
              className="mc-textarea"
              onChange={(e) => setForm((f) => ({ ...f, closureReport: e.target.value }))}
            />
          </label>
          <FormVariableFields
            defs={extras.requestDefs}
            values={extras.values}
            onValuesChange={extras.setValues}
            disabled
            title="Champs de la demande"
          />
          <FormVariableFields
            defs={extras.closureDefs}
            values={extras.values}
            onValuesChange={extras.setValues}
            disabled={isSaving}
          />
        </div>

        {/* FOOTER */}
        <div className="mc-modal-footer mc-modal-footer-split" style={{ padding: "10px 12px" }}>
          <div className="mc-modal-footer-start">
            <button type="button" className="btn-ghost" onClick={requestClose} disabled={isSaving}>
              Fermer
            </button>
          </div>
          <div className="mc-modal-footer-end">
            <button
              type="button"
              className="mc-btn-primary"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
            >
              {isSaving ? "Enregistrement…" : "Clôturer"}
            </button>
          </div>
        </div>
      </section>
    </div>
    <DiscardConfirmModal
      isOpen={showDiscardConfirm}
      onCancel={cancelDiscard}
      onConfirm={confirmDiscardAndClose}
    />
    </>
  );
}
