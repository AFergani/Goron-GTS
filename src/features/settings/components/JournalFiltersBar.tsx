/**
 * Barre de filtres partagée du journal (logs applicatifs et logs techniques).
 * Acteur / Cible sont optionnels : masqués sur les logs techniques.
 */

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

type JournalFiltersBarProps = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  actorFilter?: string;
  actors?: string[];
  onActorChange?: (value: string) => void;
  familyFilter: string;
  families: string[];
  onFamilyChange: (value: string) => void;
  targetFilter?: string;
  targets?: string[];
  onTargetChange?: (value: string) => void;
  formatTarget?: (value: string) => string;
  statusFilter: string;
  statuses: string[];
  onStatusChange: (value: string) => void;
  formatStatus: (value: string) => string;
  onReset: () => void;
  actions: ReactNode;
};

/**
 * Indique si un horodatage est dans la période Du/Au (bornes inclusives).
 *
 * @param occurredAt - Date ISO de la ligne.
 * @param dateFrom - `YYYY-MM-DD` ou vide.
 * @param dateTo - `YYYY-MM-DD` ou vide.
 */
export function matchesJournalDateRange(occurredAt: string, dateFrom: string, dateTo: string): boolean {
  const logDate = new Date(occurredAt);
  if (Number.isNaN(logDate.getTime())) return false;
  const fromOk = !dateFrom || logDate >= new Date(`${dateFrom}T00:00:00`);
  const toOk = !dateTo || logDate <= new Date(`${dateTo}T23:59:59`);
  return fromOk && toOk;
}

/**
 * @param props.actions - Boutons d’export (à gauche du reset).
 */
export function JournalFiltersBar({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  actorFilter,
  actors,
  onActorChange,
  familyFilter,
  families,
  onFamilyChange,
  targetFilter,
  targets,
  onTargetChange,
  formatTarget = (value) => (value === "-" ? "Aucune cible" : value),
  statusFilter,
  statuses,
  onStatusChange,
  formatStatus,
  onReset,
  actions
}: JournalFiltersBarProps) {
  const showActor = Boolean(onActorChange && actors);
  const showTarget = Boolean(onTargetChange && targets);

  return (
    <div className="audit-filters">
      <div className="main-log-filters-date-range" role="group" aria-label="Période du journal">
        <label className="main-log-filter-field--date">
          Date du
          <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
        </label>
        <label className="main-log-filter-field--date">
          Date au
          <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />
        </label>
      </div>
      {showActor ? (
        <label>
          Acteur
          <select value={actorFilter ?? "all"} onChange={(e) => onActorChange?.(e.target.value)}>
            <option value="all">Tous</option>
            {actors?.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Famille
        <select value={familyFilter} onChange={(e) => onFamilyChange(e.target.value)}>
          <option value="all">Toutes</option>
          {families.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
      </label>
      {showTarget ? (
        <label>
          Cible
          <select value={targetFilter ?? "all"} onChange={(e) => onTargetChange?.(e.target.value)}>
            <option value="all">Toutes</option>
            {targets?.map((target) => (
              <option key={target} value={target}>
                {formatTarget(target)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Statut
        <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}>
          <option value="all">Tous</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>
      </label>
      <div className="audit-filter-actions">
        {actions}
        <button
          type="button"
          className="btn-light action-icon-btn audit-reset-icon-btn"
          title="Réinitialiser les filtres"
          aria-label="Réinitialiser les filtres"
          onClick={onReset}
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}
