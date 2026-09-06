/**
 * File d'attente générique des demandes rondes (arrêt de profil / suppression de lot).
 */

import type { ReactNode } from "react";

export type RondePendingRequestQueueRow = {
  id: string;
  title: string;
  subtitle?: ReactNode;
  requestedBy: string;
  reason: string;
};

type RondePendingRequestsQueueModalProps = {
  isOpen: boolean;
  title: string;
  hint: string;
  subjectColumnLabel: string;
  rows: RondePendingRequestQueueRow[];
  emptyLabel?: string;
  onClose: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onView?: (id: string) => void;
  acceptLabel?: string;
  rejectLabel?: string;
};

export function RondePendingRequestsQueueModal({
  isOpen,
  title,
  hint,
  subjectColumnLabel,
  rows,
  emptyLabel = "Aucune demande en attente.",
  onClose,
  onAccept,
  onReject,
  onView,
  acceptLabel = "Accepter",
  rejectLabel = "Refuser"
}: RondePendingRequestsQueueModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal fransor-help-modal ronde-pending-requests-queue-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ronde-pending-requests-queue-title"
      >
        <header className="mc-modal-head">
          <h3 id="ronde-pending-requests-queue-title" className="mc-modal-title">
            {title}
          </h3>
          <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <p className="muted data-pending-submissions-hint">{hint}</p>

        <div className="table-scroll-x">
          <table className="data-table-fixed">
            <thead>
              <tr>
                <th>{subjectColumnLabel}</th>
                <th>Demandeur</th>
                <th>Motif</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div>
                        <strong>{row.title}</strong>
                      </div>
                      {row.subtitle ? (
                        <div className="muted" style={{ fontSize: "0.85em" }}>
                          {row.subtitle}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.requestedBy || "—"}</td>
                    <td>{row.reason || "—"}</td>
                    <td>
                      <div className="row-actions table-row-actions table-row-actions--text">
                        {onView ? (
                          <button
                            type="button"
                            className="table-action-btn table-action-btn--text"
                            onClick={() => onView(row.id)}
                          >
                            Voir
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text table-action-btn--validate"
                          onClick={() => onAccept(row.id)}
                        >
                          {acceptLabel}
                        </button>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text"
                          onClick={() => onReject(row.id)}
                        >
                          {rejectLabel}
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
