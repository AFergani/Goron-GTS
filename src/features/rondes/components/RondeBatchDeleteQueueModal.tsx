/**
 * Demandes de suppression de lots : même coque cartes/filtres que « Profils de programmation ».
 * Filtres : En attente / Annulé / Tous. Permet d'ouvrir la demande liée avant décision.
 */

import { useMemo, useState } from "react";
import type { RondeBatchDeleteRequestRef } from "../model/ronde.types";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { RondeConfirmReasonField } from "./RondeConfirmReasonField";

type StatusFilter = "pending" | "cancelled" | "all";

type RondeBatchDeleteQueueModalProps = {
  isOpen: boolean;
  requests: RondeBatchDeleteRequestRef[];
  onClose: () => void;
  onApprove: (requestBatchId: string, reviewReason: string) => Promise<boolean>;
  onReject: (requestBatchId: string, reviewReason: string) => Promise<boolean>;
  /** Ouvre la demande exceptionnelle liée pour contextualiser avant décision. */
  onOpenLinkedDemand?: (request: RondeBatchDeleteRequestRef) => void;
};

function statusBadge(status: string): { tone: string; label: string } {
  if (status === "PENDING") return { tone: "en-cours", label: "En attente" };
  if (status === "APPROVED") return { tone: "cloture", label: "Approuvée" };
  if (status === "REJECTED") return { tone: "en-attente", label: "Annulée" };
  return { tone: "en-attente", label: status || "—" };
}

function requesterLabel(row: RondeBatchDeleteRequestRef): string {
  return (row.requestedByDisplay || row.requestedBy || "").trim() || "—";
}

export function RondeBatchDeleteQueueModal({
  isOpen,
  requests,
  onClose,
  onApprove,
  onReject,
  onOpenLinkedDemand
}: RondeBatchDeleteQueueModalProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<{
    request: RondeBatchDeleteRequestRef;
    decision: "approve" | "reject";
  } | null>(null);
  const [reviewReason, setReviewReason] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...requests]
      .filter((row) => {
        if (statusFilter === "pending" && row.status !== "PENDING") return false;
        if (statusFilter === "cancelled" && row.status === "PENDING") return false;
        if (!q) return true;
        const hay = [
          row.siteDisplay,
          row.reason,
          row.requestedBy,
          row.requestedByDisplay,
          row.reviewReason,
          row.reviewedByDisplay
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));
  }, [requests, statusFilter, search]);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <section
          className="modal fransor-help-modal ronde-planned-profiles-list-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ronde-batch-delete-list-title"
        >
          <header className="mc-modal-head">
            <h3 id="ronde-batch-delete-list-title" className="mc-modal-title">
              Demandes de suppression
            </h3>
            <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </header>

          <div className="ronde-planned-profiles-list-toolbar">
            <div className="row-actions" role="group" aria-label="Filtrer par état">
              {(
                [
                  { id: "pending", label: "En attente" },
                  { id: "cancelled", label: "Annulé" },
                  { id: "all", label: "Tous" }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={statusFilter === opt.id ? "btn-light is-active" : "btn-light"}
                  aria-pressed={statusFilter === opt.id}
                  onClick={() => setStatusFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="mc-field ronde-planned-profiles-list-search">
              <span>Rechercher</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Site, demandeur, motif…"
              />
            </label>
          </div>

          <div className="ronde-planned-profiles-list-body app-scrollbar">
            {!filtered.length ? (
              <p className="muted">Aucune demande dans ce filtre.</p>
            ) : (
              <ul className="ronde-planned-profiles-cards">
                {filtered.map((row) => {
                  const badge = statusBadge(row.status);
                  const canDecide = row.status === "PENDING";
                  const canOpenDemand = Boolean(onOpenLinkedDemand && row.entryIds.length);
                  return (
                    <li key={row.requestBatchId}>
                      <div className="ronde-planned-profiles-card ronde-batch-delete-card">
                        <div className="ronde-planned-profiles-card__head">
                          <strong>{(row.siteDisplay || "").trim() || "Lot sans fiches restantes"}</strong>
                          <span className={`mc-status-badge mc-status-badge--${badge.tone}`}>
                            <span className="mc-status-badge__dot" aria-hidden />
                            <span className="mc-status-badge__label">{badge.label}</span>
                          </span>
                        </div>
                        <div className="muted ronde-planned-profiles-card__presta">
                          Demandeur : {requesterLabel(row)}
                          {row.requestedAt
                            ? ` · ${formatDateShortFr(row.requestedAt.slice(0, 10)) || row.requestedAt}`
                            : ""}
                        </div>
                        <div className="ronde-planned-profiles-card__summary">
                          <div className="muted ronde-planned-profiles-card__summary-line">
                            {row.entryCount} fiche{row.entryCount > 1 ? "s" : ""}
                            {row.dateFrom
                              ? ` · ${formatDateShortFr(row.dateFrom)}${
                                  row.dateTo && row.dateTo !== row.dateFrom
                                    ? ` → ${formatDateShortFr(row.dateTo)}`
                                    : ""
                                }`
                              : ""}
                          </div>
                          <div className="muted ronde-planned-profiles-card__summary-line">
                            Motif : {row.reason || "—"}
                          </div>
                          {row.status !== "PENDING" && (row.reviewedByDisplay || row.reviewReason) ? (
                            <div className="muted ronde-planned-profiles-card__summary-line">
                              Décision
                              {row.reviewedByDisplay ? ` (${row.reviewedByDisplay})` : ""}
                              {row.reviewReason ? ` : ${row.reviewReason}` : ""}
                            </div>
                          ) : null}
                        </div>
                        <div className="row-actions table-row-actions table-row-actions--text ronde-batch-delete-card__actions">
                          {canOpenDemand ? (
                            <button
                              type="button"
                              className="table-action-btn table-action-btn--text"
                              onClick={() => onOpenLinkedDemand?.(row)}
                            >
                              Demande liée
                            </button>
                          ) : null}
                          {canDecide ? (
                            <>
                              <button
                                type="button"
                                className="table-action-btn table-action-btn--text table-action-btn--validate"
                                onClick={() => {
                                  setReviewReason(row.reason || "");
                                  setDecisionTarget({ request: row, decision: "approve" });
                                }}
                              >
                                Accepter
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
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="row-actions modal-actions ronde-planned-profiles-list-footer">
            <button type="button" className="btn-light" onClick={onClose}>
              Fermer
            </button>
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={Boolean(decisionTarget)}
        title={
          decisionTarget?.decision === "approve"
            ? "Accepter la suppression du lot"
            : "Refuser la demande de suppression"
        }
        message={
          decisionTarget?.decision === "approve"
            ? `Lot « ${(decisionTarget.request.siteDisplay || "").trim() || "sans site"} » : le motif du demandeur est repris ci-dessous (modifiable si besoin). Le lot sera traité selon les règles avant/après passage.`
            : decisionTarget
              ? `Lot « ${(decisionTarget.request.siteDisplay || "").trim() || "sans site"} » : le lot réapparaîtra pour les opérateurs.`
              : ""
        }
        confirmLabel={decisionTarget?.decision === "approve" ? "Accepter" : "Refuser la demande"}
        confirmClassName={decisionTarget?.decision === "approve" ? "btn-danger" : undefined}
        confirmDisabled={!reviewReason.trim()}
        onCancel={() => setDecisionTarget(null)}
        onConfirm={async () => {
          if (!decisionTarget || !reviewReason.trim()) return;
          const ok =
            decisionTarget.decision === "approve"
              ? await onApprove(decisionTarget.request.requestBatchId, reviewReason.trim())
              : await onReject(decisionTarget.request.requestBatchId, reviewReason.trim());
          if (ok) setDecisionTarget(null);
        }}
      >
        <RondeConfirmReasonField
          value={reviewReason}
          onChange={setReviewReason}
          placeholder={
            decisionTarget?.decision === "approve"
              ? "Motif du demandeur (modifiable)"
              : "Ex. suppression non justifiée, lot encore utile"
          }
          autoFocus
        />
      </ConfirmModal>
    </>
  );
}
