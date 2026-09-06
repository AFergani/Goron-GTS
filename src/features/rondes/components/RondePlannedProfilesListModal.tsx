/**
 * Modale « Profils » : listing des programmations avec filtres En cours / Terminé / Tous.
 */

import { useMemo, useState } from "react";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { formatRondePlannedLineSummary } from "../model/rondePlannedSummary";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";

type StatusFilter = "active" | "ended" | "all";

type RondePlannedProfilesListModalProps = {
  isOpen: boolean;
  profiles: RondePlannedProfileRef[];
  onClose: () => void;
  onOpenProfile: (profile: RondePlannedProfileRef) => void;
};

export function RondePlannedProfilesListModal({
  isOpen,
  profiles,
  onClose,
  onOpenProfile
}: RondePlannedProfilesListModalProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...profiles]
      .filter((p) => {
        if (statusFilter === "active" && !p.isActive) return false;
        if (statusFilter === "ended" && p.isActive) return false;
        if (!q) return true;
        return (
          (p.label || "").toLowerCase().includes(q) ||
          (p.siteDisplay || "").toLowerCase().includes(q) ||
          (p.intervenantDisplay || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.label || "").localeCompare(b.label || "", "fr", { sensitivity: "base" }));
  }, [profiles, statusFilter, search]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal fransor-help-modal ronde-planned-profiles-list-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ronde-profiles-list-title"
      >
        <header className="mc-modal-head">
          <h3 id="ronde-profiles-list-title" className="mc-modal-title">
            Profils de programmation
          </h3>
          <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <div className="ronde-planned-profiles-list-toolbar">
          <div className="row-actions" role="group" aria-label="Filtrer par état">
            {(
              [
                { id: "active", label: "En cours" },
                { id: "ended", label: "Terminé" },
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
              placeholder="Profil, site, prestataire…"
            />
          </label>
        </div>

        <div className="ronde-planned-profiles-list-body app-scrollbar">
          {!filtered.length ? (
            <p className="muted">Aucune programmation dans ce filtre.</p>
          ) : (
            <ul className="ronde-planned-profiles-cards">
              {filtered.map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    className="ronde-planned-profiles-card"
                    onClick={() => onOpenProfile(profile)}
                  >
                    <div className="ronde-planned-profiles-card__head">
                      <strong>{(profile.siteDisplay || profile.label || "").trim() || "—"}</strong>
                      <span
                        className={`mc-status-badge mc-status-badge--${profile.isActive ? "en-cours" : "en-attente"}`}
                      >
                        <span className="mc-status-badge__dot" aria-hidden />
                        <span className="mc-status-badge__label">
                          {profile.isActive ? "En cours" : "Terminé"}
                        </span>
                      </span>
                    </div>
                    <div className="muted ronde-planned-profiles-card__presta">
                      {profile.intervenantDisplay || "Sans prestataire"}
                    </div>
                    <div className="ronde-planned-profiles-card__summary">
                      {profile.lines.length ? (
                        profile.lines.map((line) => (
                          <div key={line.id} className="muted ronde-planned-profiles-card__summary-line">
                            {formatRondePlannedLineSummary(line)}
                          </div>
                        ))
                      ) : (
                        <div className="muted ronde-planned-profiles-card__summary-line">—</div>
                      )}
                    </div>
                    {(profile.planningValidFrom || profile.planningValidTo) ? (
                      <div className="muted ronde-planned-profiles-card__validity">
                        Validité :{" "}
                        {formatDateShortFr(profile.planningValidFrom || "") || "—"}
                        {" → "}
                        {formatDateShortFr(profile.planningValidTo || "") || "—"}
                      </div>
                    ) : null}
                    {profile.cancellationRequestedAt ? (
                      <div className="muted ronde-planned-profiles-card__cancel-hint">
                        Demande d&apos;arrêt en attente
                        {profile.cancellationRequestedBy ? ` (${profile.cancellationRequestedBy})` : ""}
                      </div>
                    ) : null}
                  </button>
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
