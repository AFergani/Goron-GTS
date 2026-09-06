/**
 * File de validation des demandes de suppression de lots exceptionnels (responsables).
 */

import { useMemo, useState } from "react";
import type { RondeBatchDeleteRequestRef } from "../model/ronde.types";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";

type RondeBatchDeleteQueueModalProps = {
  isOpen: boolean;
  requests: RondeBatchDeleteRequestRef[];
  onClose: () => void;
  onApprove: (requestBatchId: string, reviewReason: string) => Promise<boolean>;
  onReject: (requestBatchId: string, reviewReason: string) => Promise<boolean>;
};

export function RondeBatchDeleteQueueModal({
  isOpen,
  requests,
  onClose,
  onApprove,
  onReject
}: RondeBatchDeleteQueueModalProps) {
  const pending = useMemo(
    () =>
      [...requests].sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || "")),
    [requests]
  );
  const [decisionTarget, setDecisionTarget] = useState<{
    request: RondeBatchDeleteRequestRef;
    decision: "approve" | "reject";
  } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <section
          className="modal fransor-help-modal ronde-batch-delete-queue-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ronde-batch-delete-queue-title"
        >
          <header className="mc-modal-head">
            <h3 id="ronde-batch-delete-queue-title" className="mc-modal-title">
              Demandes de suppression
            </h3>
            <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </header>

          <p className="muted data-pending-submissions-hint">
            Validez ou refusez les demandes de suppression de lots exceptionnels. L&apos;approbation applique les
            règles avant/après passage.
          </p>

          <div className="table-scroll-x">
            <table className="data-table-fixed">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Demandeur</th>
                  <th>Motif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!pending.length ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Aucune demande en attente.
                    </td>
                  </tr>
                ) : (
                  pending.map((row) => (
                    <tr key={row.requestBatchId}>
                      <td>
                        <div>
                          <strong>{(row.siteDisplay || "").trim() || "—"}</strong>
                        </div>
                        <div className="muted" style={{ fontSize: "0.85em" }}>
                          {row.entryCount} fiche{row.entryCount > 1 ? "s" : ""}
                          {row.dateFrom
                            ? ` · ${formatDateShortFr(row.dateFrom)}${
                                row.dateTo && row.dateTo !== row.dateFrom
                                  ? ` → ${formatDateShortFr(row.dateTo)}`
                                  : ""
                              }`
                            : ""}
                        </div>
                      </td>
                      <td>{row.requestedBy || "—"}</td>
                      <td>{row.reason || "—"}</td>
                      <td>
                        <div className="row-actions table-row-actions table-row-actions--text">
                          <button
                            type="button"
                            className="table-action-btn table-action-btn--text table-action-btn--validate"
                            onClick={() => {
                              setReviewReason("");
                              setDecisionTarget({ request: row, decision: "approve" });
                            }}
                          >
                            Approuver
                          </button>
                          <button
                            type="button"
                            className="table-action-btn table-action-btn--text"
                            onClick={() => {
                              setReviewReason("");
                              setDecisionTarget({ request: row, decision: "reject" });
                            }}
                          >
                            Refuser
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={Boolean(decisionTarget)}
        title={
          decisionTarget?.decision === "approve"
            ? "Approuver la suppression du lot"
            : "Refuser la demande de suppression"
        }
        message={
          decisionTarget?.decision === "approve"
            ? "Le lot sera traité selon les règles avant/après passage (non effectuées, conservation ou suppression)."
            : "Le lot réapparaîtra pour les opérateurs."
        }
        confirmLabel={decisionTarget?.decision === "approve" ? "Approuver" : "Refuser"}
        confirmClassName={decisionTarget?.decision === "approve" ? "btn-danger" : undefined}
        confirmDisabled={!reviewReason.trim() || busy}
        onCancel={() => setDecisionTarget(null)}
        onConfirm={async () => {
          if (!decisionTarget || !reviewReason.trim()) return;
          setBusy(true);
          const ok =
            decisionTarget.decision === "approve"
              ? await onApprove(decisionTarget.request.requestBatchId, reviewReason.trim())
              : await onReject(decisionTarget.request.requestBatchId, reviewReason.trim());
          setBusy(false);
          if (ok) setDecisionTarget(null);
        }}
      >
        <label className="form-block" style={{ marginTop: 10 }}>
          Motif de décision obligatoire
          <textarea
            className="mc-textarea"
            rows={3}
            value={reviewReason}
            onChange={(e) => setReviewReason(e.target.value)}
          />
        </label>
      </ConfirmModal>
    </>
  );
}
