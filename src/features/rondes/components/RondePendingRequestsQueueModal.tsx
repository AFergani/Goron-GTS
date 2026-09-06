/**
 * File d'attente générique des demandes rondes (arrêt de profil, etc.).
 * Même coque cartes / recherche que « Profils de programmation » et suppression de lot.
 */

import { useMemo, useState, type ReactNode } from "react";

export type RondePendingRequestQueueRow = {
  id: string;
  title: string;
  subtitle?: ReactNode;
  requestedBy: string;
  reason: string;
  /** Ligne secondaire optionnelle (ex. date de demande). */
  metaLine?: string;
};

type RondePendingRequestsQueueModalProps = {
  isOpen: boolean;
  title: string;
  hint: string;
  rows: RondePendingRequestQueueRow[];
  emptyLabel?: string;
  searchPlaceholder?: string;
  onClose: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onView?: (id: string) => void;
  acceptLabel?: string;
  rejectLabel?: string;
  viewLabel?: string;
};

export function RondePendingRequestsQueueModal({
  isOpen,
  title,
  hint,
  rows,
  emptyLabel = "Aucune demande en attente.",
  searchPlaceholder = "Site, demandeur, motif…",
  onClose,
  onAccept,
  onReject,
  onView,
  acceptLabel = "Accepter",
  rejectLabel = "Refuser",
  viewLabel = "Voir"
}: RondePendingRequestsQueueModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [row.title, row.requestedBy, row.reason, row.metaLine]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal fransor-help-modal ronde-planned-profiles-list-modal"
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

        <p className="muted data-pending-submissions-hint" style={{ margin: "0 1rem 0.75rem" }}>
          {hint}
        </p>

        <div className="ronde-planned-profiles-list-toolbar">
          <label className="mc-field ronde-planned-profiles-list-search">
            <span>Rechercher</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
        </div>

        <div className="ronde-planned-profiles-list-body app-scrollbar">
          {!filtered.length ? (
            <p className="muted">{emptyLabel}</p>
          ) : (
            <ul className="ronde-planned-profiles-cards">
              {filtered.map((row) => (
                <li key={row.id}>
                  <div className="ronde-planned-profiles-card">
                    <div className="ronde-planned-profiles-card__head">
                      <strong>{row.title}</strong>
                      <span className="mc-status-badge mc-status-badge--en-cours">
                        <span className="mc-status-badge__dot" aria-hidden />
                        <span className="mc-status-badge__label">En attente</span>
                      </span>
                    </div>
                    <div className="muted ronde-planned-profiles-card__presta">
                      Demandeur : {row.requestedBy || "—"}
                      {row.metaLine ? ` · ${row.metaLine}` : ""}
                    </div>
                    <div className="ronde-planned-profiles-card__summary">
                      {row.subtitle ? (
                        <div className="muted ronde-planned-profiles-card__summary-line">{row.subtitle}</div>
                      ) : null}
                      <div className="muted ronde-planned-profiles-card__summary-line">
                        Motif : {row.reason || "—"}
                      </div>
                    </div>
                    <div className="row-actions table-row-actions table-row-actions--text">
                      {onView ? (
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text"
                          onClick={() => onView(row.id)}
                        >
                          {viewLabel}
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
                  </div>
                </li>
              ))}
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
  );
}
