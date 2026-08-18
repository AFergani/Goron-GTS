/**
 * Barre d’onglets de la page Rondes, avec actions métier à droite (hors Programmations).
 *
 * Utilisé par : `RondePage`. Les actions (export, toggle jour/liste, création) restent
 * dans le presenter/page ; ce composant ne gère que la mise en page.
 */

import type { ReactNode } from "react";

export type RondeListView = "urgence" | "planifie" | "gestion";

type RondePageTabsBarProps = {
  listView: RondeListView;
  onListViewChange: (view: RondeListView) => void;
  /** Badge sidebar du jour — rondes contractuelles en cours. */
  todayContractualCount: number;
  /** Badge sidebar du jour — rondes exceptionnelles en cours. */
  todayExceptionalCount: number;
  showProgrammations: boolean;
  onOpenProgrammations?: () => void;
  /** Export, toggle, bouton d’ajout — absents sur l’onglet Programmations. */
  actions?: ReactNode;
};

/**
 * Affiche les onglets Rondes et, si fourni, le bandeau d’actions aligné à droite.
 *
 * @param props - Vue active, badges du jour, actions optionnelles
 * @returns Barre d’onglets
 */
export function RondePageTabsBar({
  listView,
  onListViewChange,
  todayContractualCount,
  todayExceptionalCount,
  showProgrammations,
  onOpenProgrammations,
  actions
}: RondePageTabsBarProps) {
  return (
    <div className="tabs-bar">
      <div className="tabs" role="tablist" aria-label="Vues rondes">
        <button
          type="button"
          role="tab"
          aria-selected={listView === "planifie"}
          className={listView === "planifie" ? "tab active" : "tab"}
          onClick={() => onListViewChange("planifie")}
        >
          Ronde contractuelle
          {todayContractualCount > 0 ? (
            <span
              className="gard-tab-badge"
              title={`${todayContractualCount} ronde(s) contractuelle(s) en cours aujourd'hui`}
            >
              {todayContractualCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listView === "urgence"}
          className={listView === "urgence" ? "tab active" : "tab"}
          onClick={() => onListViewChange("urgence")}
        >
          Ronde exceptionnelle
          {todayExceptionalCount > 0 ? (
            <span
              className="gard-tab-badge"
              title={`${todayExceptionalCount} ronde(s) exceptionnelle(s) en cours aujourd'hui`}
            >
              {todayExceptionalCount}
            </span>
          ) : null}
        </button>
        {showProgrammations ? (
          <button
            type="button"
            role="tab"
            aria-selected={listView === "gestion"}
            className={listView === "gestion" ? "tab active" : "tab"}
            onClick={() => onOpenProgrammations?.()}
          >
            Programmations
          </button>
        ) : null}
      </div>
      {actions ? <div className="tabs-bar__actions">{actions}</div> : null}
    </div>
  );
}
