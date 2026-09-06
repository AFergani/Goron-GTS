/**
 * Modale « Demandes d'arrêt » : file d'attente Accepter / Refuser pour les responsables.
 */

import { useMemo } from "react";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { summarizeRondePlannedProfile } from "../model/rondePlannedSummary";

type RondePlannedCancellationQueueModalProps = {
  isOpen: boolean;
  profiles: RondePlannedProfileRef[];
  onClose: () => void;
  onApprove: (profile: RondePlannedProfileRef) => void;
  onReject: (profile: RondePlannedProfileRef) => void;
  onOpenProfile?: (profile: RondePlannedProfileRef) => void;
};

export function RondePlannedCancellationQueueModal({
  isOpen,
  profiles,
  onClose,
  onApprove,
  onReject,
  onOpenProfile
}: RondePlannedCancellationQueueModalProps) {
  const pending = useMemo(
    () =>
      profiles
        .filter((p) => Boolean(p.cancellationRequestedAt))
        .sort((a, b) =>
          (a.cancellationRequestedAt || "").localeCompare(b.cancellationRequestedAt || "")
        ),
    [profiles]
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal fransor-help-modal ronde-planned-cancellation-queue-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ronde-cancellation-queue-title"
      >
        <header className="mc-modal-head">
          <h3 id="ronde-cancellation-queue-title" className="mc-modal-title">
            Demandes d&apos;arrêt
          </h3>
          <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <p className="muted data-pending-submissions-hint">
          Validez ou refusez les demandes d&apos;arrêt de programmation en attente.
        </p>

        <div className="table-scroll-x">
          <table className="data-table-fixed">
            <thead>
              <tr>
                <th>Profil</th>
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
                  <tr key={row.id}>
                    <td>
                      <div>
                        <strong>{(row.siteDisplay || row.label || "").trim() || "—"}</strong>
                      </div>
                      <div className="muted" style={{ fontSize: "0.85em" }} title={summarizeRondePlannedProfile(row)}>
                        {summarizeRondePlannedProfile(row)}
                      </div>
                    </td>
                    <td>{row.cancellationRequestedBy || "—"}</td>
                    <td>{row.cancellationRequestReason || "—"}</td>
                    <td>
                      <div className="row-actions table-row-actions table-row-actions--text">
                        {onOpenProfile ? (
                          <button
                            type="button"
                            className="table-action-btn table-action-btn--text"
                            onClick={() => onOpenProfile(row)}
                          >
                            Voir
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text table-action-btn--validate"
                          onClick={() => onApprove(row)}
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text"
                          onClick={() => onReject(row)}
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
  );
}
