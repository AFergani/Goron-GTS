/**
 * Barre latérale permanente : identité, navigation pages, badge DB, aide, thème, paramètres.
 *
 * Montée par `AppShell` une fois la session établie. L'horloge locale est interne
 * (pas de remontée vers la coque).
 */

import { useEffect, useState } from "react";
import { Moon, Power, Settings, Sun } from "lucide-react";
import logoGts from "../assets/logo-gts.png";
import type { PageAccess } from "../types";
import type { PostgresLabHealth } from "../infrastructure/api/gtsApiClient";
import type { AppPage } from "./appNavigation";
import { APP_VERSION } from "./appVersion";

type ThemeMode = "dark" | "light";

type AppSidebarProps = {
  fullName: string;
  userPageAccess: PageAccess;
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  interventionOpenCount: number;
  rondeTodayInProgressCount: number;
  gardiennageTodayInProgressCount: number;
  isManager: boolean;
  mainCouranteUnconsultedCount: number;
  mainCouranteOperatorResponseCount: number;
  postgresLabHealth: PostgresLabHealth | null;
  pendingRefsCount: number;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onOpenHelp: () => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  onOpenExitChoice: () => void;
};

/** Horodatage sidebar au format français lisible. */
function formatSidebarDateTime(date: Date): string {
  const datePart = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  const timePart = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${datePart}, ${timePart}`;
}

function getStatusTone(isOk: boolean | null): "ok" | "ko" | "unknown" {
  if (isOk === true) return "ok";
  if (isOk === false) return "ko";
  return "unknown";
}

/**
 * Sidebar de navigation (thème dédié, indépendant du contenu principal).
 */
export function AppSidebar({
  fullName,
  userPageAccess,
  activePage,
  onNavigate,
  interventionOpenCount,
  rondeTodayInProgressCount,
  gardiennageTodayInProgressCount,
  isManager,
  mainCouranteUnconsultedCount,
  mainCouranteOperatorResponseCount,
  postgresLabHealth,
  pendingRefsCount,
  themeMode,
  onToggleTheme,
  onOpenHelp,
  onOpenAbout,
  onOpenSettings,
  onOpenExitChoice
}: AppSidebarProps) {
  const [now, setNow] = useState(() => new Date());
  const todayLabel = formatSidebarDateTime(now);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navClass = (page: AppPage) => (activePage === page ? "nav-btn active" : "nav-btn");

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-logo-wrap">
          <img src={logoGts} alt="Logo GTS" className="sidebar-logo" />
        </div>
        <div className="sidebar-title-row">
          <h2 className="sidebar-title">Télésurveillance GTS</h2>
          <button
            type="button"
            className="sidebar-about-btn"
            title="À propos de l'application"
            aria-label={`À propos, version ${APP_VERSION}`}
            onClick={onOpenAbout}
          >
            {APP_VERSION}
          </button>
        </div>
        <div className="user-badge">{fullName}</div>
        <div className="sidebar-today">{todayLabel}</div>
      </div>
      <div className="sidebar-nav-scroll app-scrollbar">
        <nav className="sidebar-pages" aria-label="Navigation principale">
          {userPageAccess.intervention && (
            <button type="button" className={navClass("intervention")} onClick={() => onNavigate("intervention")}>
              <span className="nav-btn-label">Interventions</span>
              {interventionOpenCount > 0 ? (
                <span
                  className="nav-btn-badge"
                  title={`${interventionOpenCount} intervention(s) en cours`}
                  aria-label={`${interventionOpenCount} intervention(s) en cours`}
                >
                  {interventionOpenCount}
                </span>
              ) : null}
            </button>
          )}
          {userPageAccess.rondes && (
            <button type="button" className={navClass("rondes")} onClick={() => onNavigate("rondes")}>
              <span className="nav-btn-label">Rondes</span>
              {rondeTodayInProgressCount > 0 ? (
                <span
                  className="nav-btn-badge"
                  title={`${rondeTodayInProgressCount} ronde(s) en cours aujourd'hui`}
                  aria-label={`${rondeTodayInProgressCount} ronde(s) en cours aujourd'hui`}
                >
                  {rondeTodayInProgressCount}
                </span>
              ) : null}
            </button>
          )}
          {userPageAccess.gardiennage && (
            <button type="button" className={navClass("gardiennage")} onClick={() => onNavigate("gardiennage")}>
              <span className="nav-btn-label">Gardiennage</span>
              {gardiennageTodayInProgressCount > 0 ? (
                <span
                  className="nav-btn-badge"
                  title={`${gardiennageTodayInProgressCount} gardiennage(s) en cours aujourd'hui`}
                  aria-label={`${gardiennageTodayInProgressCount} gardiennage(s) en cours aujourd'hui`}
                >
                  {gardiennageTodayInProgressCount}
                </span>
              ) : null}
            </button>
          )}
          {userPageAccess.mainCourante && (
            <button type="button" className={navClass("mainCourante")} onClick={() => onNavigate("mainCourante")}>
              <span className="nav-btn-label">Main courante</span>
              {isManager && mainCouranteUnconsultedCount > 0 ? (
                <span
                  className="nav-btn-badge"
                  title={`${mainCouranteUnconsultedCount} entrée(s) non consultée(s)`}
                  aria-label={`${mainCouranteUnconsultedCount} entrée(s) non consultée(s)`}
                >
                  {mainCouranteUnconsultedCount}
                </span>
              ) : null}
              {!isManager && mainCouranteOperatorResponseCount > 0 ? (
                <span
                  className="nav-btn-badge"
                  title={`${mainCouranteOperatorResponseCount} réponse(s) encadrement sur vos entrées`}
                  aria-label={`${mainCouranteOperatorResponseCount} réponse(s) encadrement sur vos entrées`}
                >
                  {mainCouranteOperatorResponseCount}
                </span>
              ) : null}
            </button>
          )}
          {userPageAccess.fransor && (
            <button type="button" className={navClass("fransor")} onClick={() => onNavigate("fransor")}>
              <span className="nav-btn-label">Fransor</span>
            </button>
          )}
          {userPageAccess.videoRemarks && (
            <button type="button" className={navClass("videoRemarks")} onClick={() => onNavigate("videoRemarks")}>
              <span className="nav-btn-label">Remarques vidéo</span>
            </button>
          )}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-footer-inline" aria-label="Actions rapides">
          <span
            className={`sidebar-db-dot ${getStatusTone(postgresLabHealth?.reachable ?? null)}`}
            title={
              postgresLabHealth?.reachable
                ? `Base accessible (${postgresLabHealth.host}:${postgresLabHealth.port}/${postgresLabHealth.database})`
                : `Base inaccessible${postgresLabHealth?.error ? ` — ${postgresLabHealth.error}` : ""}`
            }
            aria-label={postgresLabHealth?.reachable ? "Base de données accessible" : "Base de données inaccessible"}
            role="status"
          />
          <button type="button" title="Centre d'aide" aria-label="Centre d'aide" className="icon-btn sidebar-help-trigger" onClick={onOpenHelp}>
            <span aria-hidden className="sidebar-help-icon">
              ?
            </span>
          </button>
          <button
            title={themeMode === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}
            className="icon-btn"
            onClick={onToggleTheme}
          >
            {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {userPageAccess.settings && (
            <button
              title="Paramètres"
              className={activePage === "settings" ? "icon-btn active" : "icon-btn"}
              onClick={onOpenSettings}
            >
              <Settings size={16} />
              {pendingRefsCount > 0 ? (
                <span
                  className="icon-btn-badge"
                  title={`${pendingRefsCount} élément(s) en attente de validation`}
                  aria-label={`${pendingRefsCount} élément(s) en attente de validation`}
                >
                  {pendingRefsCount}
                </span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            title="Fermeture : déconnexion, minimiser ou quitter"
            aria-label="Fermeture : déconnexion, minimiser ou quitter"
            className="icon-btn quit"
            onClick={onOpenExitChoice}
          >
            <Power size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
