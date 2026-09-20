/**
 * Bloc « Synthèse du mois » partagé (cartes compteurs pages métier).
 *
 * Utilisé par : main courante, interventions, gardiennage, rondes.
 */

import { getCurrentMonthSummaryTitle } from "../utils/currentMonthSummary";

export type MonthSummaryStatCard = {
  label: string;
  value: number;
};

type MonthSummaryStatsBlockProps = {
  cards: MonthSummaryStatCard[];
  /** Défaut : titre du mois civil en cours. */
  title?: string;
};

export function MonthSummaryStatsBlock({ cards, title }: MonthSummaryStatsBlockProps) {
  return (
    <section className="panel main-log-stats-block">
      <h2 className="main-log-stats-title">{title ?? getCurrentMonthSummaryTitle()}</h2>
      <div className="main-log-stats">
        {cards.map((card) => (
          <div key={card.label} className="stat-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
