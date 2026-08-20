/**
 * Coque applicative Goron-GTS : authentification, sidebar, navigation métier et badge DB (PostgreSQL).
 *
 * Montée sous `SessionProvider` dans `App.tsx`. Orchestre les pages features (main courante,
 * interventions, rondes, gardiennage, Fransor, paramètres) selon `pageAccess` du compte connecté.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Power, Settings, Sun } from "lucide-react";
import logoGts from "../assets/logo-gts.png";
import { useSession } from "./session/SessionProvider";
import { useAuthPresenter } from "../features/auth/presenter/useAuthPresenter";
import { usePostgresBootstrapPresenter } from "../features/auth/presenter/usePostgresBootstrapPresenter";
import { FirstLoginModal } from "../features/auth/view/FirstLoginModal";
import { LoginView } from "../features/auth/view/LoginView";
import { PostgresBootstrapView } from "../features/auth/view/PostgresBootstrapView";
import { useSettingsPresenter } from "../features/settings/presenter/useSettingsPresenter";
import { SettingsPage } from "../features/settings/view/SettingsPage";
import { MainCourantePage } from "../features/mainCourante/view/MainCourantePage";
import { FransorPage } from "../features/fransor/view/FransorPage";
import { InterventionPage } from "../features/intervention/view/InterventionPage";
import { RondePage } from "../features/rondes/view/RondePage";
import { GardiennagePage } from "../features/gardiennage/view/GardiennagePage";
import { ConfirmModal } from "../features/common/components/ConfirmModal";
import { PgOfflineBlockingModal } from "../features/common/components/PgOfflineBlockingModal";
import { ToastStack } from "../features/common/components/Toast";
import { CredentialShareModal } from "../features/common/components/CredentialShareModal";
import { useGlobalDraggableModals } from "../features/common/hooks/useGlobalDraggableModals";
import { useToastStack } from "../features/common/hooks/useToastStack";
import type { NotifyToast } from "../features/common/model/toast.types";
import { gtsApiClient } from "../infrastructure/api/gtsApiClient";
import type { PostgresLabHealth } from "../infrastructure/api/gtsApiClient";
import { getLocalDateIso } from "../features/common/utils/localDateIso";
import { HelpCenterModal } from "../features/help/components/HelpCenterModal";
import type { HelpTopicId } from "../features/help/model/helpTopics";
import "../styles/app.css";
import "../styles/fransor.css";
import "../styles/helpfransor.css";

type AppPage = "mainCourante" | "fransor" | "intervention" | "rondes" | "settings" | "gardiennage";
type ThemeMode = "dark" | "light";

/** Première page autorisée dans l'ordre sidebar (intervention → … → paramètres). */
function getFirstSidebarPageAccess(pageAccess: Record<AppPage, boolean>): AppPage {
  const sidebarOrder: AppPage[] = ["intervention", "rondes", "gardiennage", "mainCourante", "fransor", "settings"];
  for (const page of sidebarOrder) {
    if (pageAccess[page]) return page;
  }
  return "mainCourante";
}

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

/**
 * Racine UI après connexion : layout sidebar + contenu, badges, thème et santé DB (PostgreSQL).
 */
export function AppShell() {
  useGlobalDraggableModals();
  const { session, setSession, clearSession } = useSession();
  /** Erreurs formulaires auth / bootstrap uniquement (pas de bandeau haut de page métier). */
  const [error, setError] = useState("");
  const { toasts, notify: notifyToast, dismiss: dismissToast } = useToastStack();
  const notifyError: NotifyToast = useCallback(
    (message) => {
      if (!String(message || "").trim()) return;
      notifyToast(message, "error");
    },
    [notifyToast]
  );
  const notifyInfo: NotifyToast = useCallback(
    (message) => {
      if (!String(message || "").trim()) return;
      notifyToast(message, "success");
    },
    [notifyToast]
  );
  const [credentialsToShare, setCredentialsToShare] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [activePage, setActivePage] = useState<AppPage>("mainCourante");
  const previousSessionUsernameRef = useRef<string | null>(null);
  const [mainCouranteUnconsultedCount, setMainCouranteUnconsultedCount] = useState(0);
  const [mainCouranteOperatorResponseCount, setMainCouranteOperatorResponseCount] = useState(0);
  const [interventionOpenCount, setInterventionOpenCount] = useState(0);
  const [rondeTodayInProgressCount, setRondeTodayInProgressCount] = useState(0);
  const [gardiennageTodayInProgressCount, setGardiennageTodayInProgressCount] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("gts-theme");
    return saved === "light" ? "light" : "dark";
  });
  const [themeReadyForSessionSave, setThemeReadyForSessionSave] = useState(false);
  /** Deep-link ronde → intervention : ouvre la modale intervention ciblée. */
  const [focusInterventionIdFromRonde, setFocusInterventionIdFromRonde] = useState<string | null>(null);
  /** Deep-link intervention → ronde : ouvre la modale ronde ciblée. */
  const [focusRondeIdFromIntervention, setFocusRondeIdFromIntervention] = useState<string | null>(null);
  /** Deep-link intervention → gardiennage : ouvre la modale gardiennage ciblée. */
  const [focusGardiennageIdFromIntervention, setFocusGardiennageIdFromIntervention] = useState<string | null>(null);
  const [postgresLabHealth, setPostgresLabHealth] = useState<PostgresLabHealth | null>(null);
  const previousPostgresReachableRef = useRef<boolean | null>(null);
  const [showPgUnavailableModal, setShowPgUnavailableModal] = useState(false);
  const [showCloseAppModal, setShowCloseAppModal] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [helpCenterInitialTopic, setHelpCenterInitialTopic] = useState<HelpTopicId | null>(null);
  const [now, setNow] = useState(() => new Date());
  const todayLabel = formatSidebarDateTime(now);
  const isManager = session?.user.role === "RESPONSABLE" || session?.user.role === "DEV";
  const userPageAccess = useMemo(() => {
    if (session?.user.role === "DEV") {
      return { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: true, gardiennage: true };
    }
    return (
      session?.user.pageAccess ?? {
        mainCourante: true,
        fransor: true,
        intervention: true,
        rondes: true,
        settings: session?.user.role !== "OPERATEUR",
        gardiennage: true
      }
    );
  }, [session?.user.role, session?.user.pageAccess]);
  const firstSidebarPage = useMemo(() => getFirstSidebarPageAccess(userPageAccess), [userPageAccess]);

  const getStatusTone = (isOk: boolean | null) => {
    if (isOk === true) return "ok";
    if (isOk === false) return "ko";
    return "unknown";
  };

  const navigateToLinkedIntervention = (interventionId: string) => {
    if (!userPageAccess.intervention) {
      notifyToast("Accès à la page Interventions non autorisé.", "warning");
      return;
    }
    setFocusInterventionIdFromRonde(interventionId);
    setActivePage("intervention");
  };

  const navigateToLinkedRonde = (rondeId: string) => {
    if (!userPageAccess.rondes) {
      notifyToast("Accès à la page Rondes non autorisé.", "warning");
      return;
    }
    setFocusRondeIdFromIntervention(rondeId);
    setActivePage("rondes");
  };

  const navigateToLinkedGardiennage = (gardiennageId: string) => {
    if (!userPageAccess.gardiennage) {
      notifyToast("Accès à la page Gardiennage non autorisé.", "warning");
      return;
    }
    setFocusGardiennageIdFromIntervention(gardiennageId);
    setActivePage("gardiennage");
  };

  const openSettingsAtFirstTabs = () => {
    if (!userPageAccess.settings) return;
    setActivePage("settings");
    // Toujours ouvrir Paramètres sur le premier onglet visible.
    settings.setActiveSettingsTab(settings.canAccessOperatorsTab ? "operators" : "data");
    // Et dans Gestion des données, revenir au premier onglet à gauche.
    settings.setActiveDataTab("sites");
    settings.setActiveDocumentsTab("templates");
  };

  const auth = useAuthPresenter({
    onSessionCreated: setSession,
    onError: setError,
    onToast: notifyToast
  });

  const pgBootstrap = usePostgresBootstrapPresenter({
    onError: setError,
    onToast: notifyToast
  });

  const settings = useSettingsPresenter({
    session,
    onError: notifyError,
    onInfo: notifyInfo,
    onToast: notifyToast,
    onCredentialsReady: setCredentialsToShare,
    onSessionUserPatch: (patch) => {
      if (!session) return;
      setSession({
        ...session,
        user: {
          ...session.user,
          ...patch
        }
      });
    }
  });

  const openHelpCenter = useCallback((topicId?: HelpTopicId | null) => {
    setHelpCenterInitialTopic(topicId ?? null);
    setHelpCenterOpen(true);
  }, []);

  const helpAccess = useMemo(
    () => ({
      pageAccess: {
        intervention: userPageAccess.intervention,
        rondes: userPageAccess.rondes,
        gardiennage: userPageAccess.gardiennage,
        mainCourante: userPageAccess.mainCourante,
        fransor: userPageAccess.fransor,
        settings: userPageAccess.settings
      },
      canManageUsers: settings.canManageUsers,
      canAccessOperatorsTab: settings.canAccessOperatorsTab,
      canManageData: settings.canManageData
    }),
    [userPageAccess, settings.canManageUsers, settings.canAccessOperatorsTab, settings.canManageData]
  );

  useEffect(() => {
    if (!window.gtsApi.subscribeAppExitChoiceRequest) return;
    return window.gtsApi.subscribeAppExitChoiceRequest(() => setShowCloseAppModal(true));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    window.localStorage.setItem("gts-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;
    setThemeReadyForSessionSave(false);
    if (!session?.user) return;

    const loadThemePreference = async () => {
      try {
        const pref = await gtsApiClient.getUserPreferences({
          requesterRole: session.user.role,
          requesterUsername: session.user.username
        });
        if (cancelled) return;
        setThemeMode(pref.themeMode === "light" ? "light" : "dark");
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setThemeReadyForSessionSave(true);
      }
    };

    void loadThemePreference();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.username, session?.user?.role]);

  useEffect(() => {
    if (!session?.user || !themeReadyForSessionSave) return;
    void gtsApiClient.setUserPreferences({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      themeMode
    });
  }, [session?.user?.username, session?.user?.role, themeMode, themeReadyForSessionSave]);

  useEffect(() => {
    if (!session) return;
    if (userPageAccess[activePage]) return;
    setActivePage(firstSidebarPage);
  }, [activePage, firstSidebarPage, session, userPageAccess]);

  useEffect(() => {
    const currentUsername = session?.user?.username || null;
    if (!currentUsername) {
      previousSessionUsernameRef.current = null;
      return;
    }
    if (previousSessionUsernameRef.current !== currentUsername) {
      // À chaque nouvelle connexion, revenir sur le premier onglet de navigation autorisé.
      setActivePage(firstSidebarPage);
      if (firstSidebarPage === "settings") {
        settings.setActiveSettingsTab(settings.canAccessOperatorsTab ? "operators" : "data");
        settings.setActiveDataTab("sites");
        settings.setActiveDocumentsTab("templates");
      }
    }
    previousSessionUsernameRef.current = currentUsername;
  }, [firstSidebarPage, session?.user?.username, settings.canAccessOperatorsTab, settings.setActiveDataTab, settings.setActiveDocumentsTab, settings.setActiveSettingsTab]);

  useEffect(() => {
    if (activePage !== "settings") return;
    // À chaque entrée dans Paramètres, forcer le premier onglet principal + premier sous-onglet data.
    settings.setActiveSettingsTab(settings.canAccessOperatorsTab ? "operators" : "data");
    settings.setActiveDataTab("sites");
    settings.setActiveDocumentsTab("templates");
  }, [activePage, settings.canAccessOperatorsTab, settings.setActiveDataTab, settings.setActiveDocumentsTab, settings.setActiveSettingsTab]);

  useEffect(() => {
    if (!session) {
      setPostgresLabHealth(null);
      previousPostgresReachableRef.current = null;
      setShowPgUnavailableModal(false);
      return;
    }
    const loadDbHealth = async () => {
      try {
        const pgHealth = await gtsApiClient.getPostgresLabHealth();
        setPostgresLabHealth(pgHealth);

        const previous = previousPostgresReachableRef.current;
        const reachable = Boolean(pgHealth?.reachable);
        // Modale bloquante synchronisée sur l'état réel (non fermable manuellement).
        setShowPgUnavailableModal(!reachable);
        if (!reachable) {
          setError("");
        }
        if (previous === true && reachable === false) {
          notifyToast(
            "Base de données inaccessible. Les pages métier et le journal d'actions sont indisponibles jusqu'au retour du serveur.",
            "error"
          );
        } else if (previous === false && reachable === true) {
          notifyToast("Base de données de nouveau accessible.");
        }
        previousPostgresReachableRef.current = reachable;
      } catch {
        setPostgresLabHealth(null);
      }
    };
    void loadDbHealth();
    const timer = setInterval(() => {
      void loadDbHealth();
    }, 5000);
    return () => clearInterval(timer);
  }, [session, notifyToast]);

  /** Présence multi-postes : heartbeat PG pour le badge « connecté » partagé. */
  useEffect(() => {
    if (!session) return;
    const beat = () => {
      void gtsApiClient.touchPresence().catch(() => {
        // Ignore si PG down : la modale offline couvre déjà ce cas.
      });
    };
    beat();
    const timer = setInterval(beat, 20000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setInterventionOpenCount(0);
      return;
    }
    const loadOpenCount = async () => {
      try {
        const result = await gtsApiClient.getInterventionOpenCount({ requesterRole: session.user.role });
        setInterventionOpenCount(Math.max(0, Number(result.count) || 0));
      } catch {
        setInterventionOpenCount(0);
      }
    };
    void loadOpenCount();
    const timer = setInterval(() => {
      void loadOpenCount();
    }, 5000);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session || !isManager) {
      setMainCouranteUnconsultedCount(0);
      return;
    }
    const loadUnconsultedCount = async () => {
      try {
        const result = await gtsApiClient.getMainCouranteUnconsultedCount({ requesterRole: session.user.role });
        setMainCouranteUnconsultedCount(Math.max(0, Number(result.count) || 0));
      } catch {
        setMainCouranteUnconsultedCount(0);
      }
    };
    void loadUnconsultedCount();
    const timer = setInterval(() => {
      void loadUnconsultedCount();
    }, 5000);
    return () => clearInterval(timer);
  }, [session, isManager]);

  useEffect(() => {
    if (!session || isManager) {
      setMainCouranteOperatorResponseCount(0);
      return;
    }
    const loadOperatorResponseCount = async () => {
      try {
        const result = await gtsApiClient.getMainCouranteOperatorResponseCount({ requesterRole: session.user.role });
        setMainCouranteOperatorResponseCount(Math.max(0, Number(result.count) || 0));
      } catch {
        setMainCouranteOperatorResponseCount(0);
      }
    };
    void loadOperatorResponseCount();
    const timer = setInterval(() => {
      void loadOperatorResponseCount();
    }, 5000);
    return () => clearInterval(timer);
  }, [session, isManager]);

  useEffect(() => {
    if (!session || !userPageAccess.rondes) {
      setRondeTodayInProgressCount(0);
      return;
    }
    const loadRondeTodayCount = async () => {
      try {
        const result = await gtsApiClient.getRondeTodayInProgressCounts({
          requesterRole: session.user.role,
          todayIso: getLocalDateIso()
        });
        setRondeTodayInProgressCount(Math.max(0, Number(result.total) || 0));
      } catch {
        setRondeTodayInProgressCount(0);
      }
    };
    void loadRondeTodayCount();
    const timer = setInterval(() => {
      void loadRondeTodayCount();
    }, 5000);
    return () => clearInterval(timer);
  }, [session, userPageAccess.rondes]);

  useEffect(() => {
    if (!session || !userPageAccess.gardiennage) {
      setGardiennageTodayInProgressCount(0);
      return;
    }
    const loadGardiennageTodayCount = async () => {
      try {
        const result = await gtsApiClient.getGardiennageTodayInProgressCount({
          requesterRole: session.user.role,
          todayIso: getLocalDateIso()
        });
        setGardiennageTodayInProgressCount(Math.max(0, Number(result.count) || 0));
      } catch {
        setGardiennageTodayInProgressCount(0);
      }
    };
    void loadGardiennageTodayCount();
    const timer = setInterval(() => {
      void loadGardiennageTodayCount();
    }, 5000);
    return () => clearInterval(timer);
  }, [session, userPageAccess.gardiennage]);

  const runDisconnect = () => {
    setShowCloseAppModal(false);
    clearSession();
    settings.resetSettingsState();
    setError("");
    setCredentialsToShare(null);
  };

  const exitChoiceModal =
    showCloseAppModal ? (
      <div className="modal-overlay" onClick={() => setShowCloseAppModal(false)}>
        <section className="modal confirm-modal app-exit-choice-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Fermeture de l&apos;application</h3>
          <p className="muted">Déconnexion, réduction en zone de notification ou arrêt complet.</p>
          <div className="row-actions app-exit-choice-modal__actions">
            <button type="button" className="btn-light" onClick={() => setShowCloseAppModal(false)}>
              Annuler
            </button>
            {session ? (
              <button type="button" className="btn-light" onClick={runDisconnect}>
                Déconnexion
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setShowCloseAppModal(false);
                void settings.onMinimizeApp();
              }}
            >
              Minimiser
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                setShowCloseAppModal(false);
                void settings.onQuitAppNow();
              }}
            >
              Quitter
            </button>
          </div>
        </section>
      </div>
    ) : null;

  if (!session) {
    if (!pgBootstrap.statusLoaded) {
      return (
        <>
          <main className="auth-page" aria-busy="true">
            <section className="panel login-panel">
              <p className="muted" role="status">
                Vérification de la connexion PostgreSQL…
              </p>
            </section>
          </main>
          {exitChoiceModal}
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
        </>
      );
    }

    if (pgBootstrap.needsSetup) {
      return (
        <>
          <PostgresBootstrapView
            config={pgBootstrap.postgresConfig}
            draft={pgBootstrap.postgresDraft}
            onDraftChange={pgBootstrap.setPostgresDraft}
            onSave={pgBootstrap.onSavePostgresBootstrap}
            onTest={pgBootstrap.onTestPostgresBootstrap}
            testResult={pgBootstrap.postgresTestResult}
            busyPhase={pgBootstrap.busyPhase}
            error={error}
          />
          {exitChoiceModal}
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
        </>
      );
    }

    return (
      <>
        <LoginView
          loginForm={auth.loginForm}
          error={error}
          showLockedDialog={auth.showLockedDialog}
          isLoggingIn={auth.isLoggingIn}
          onCloseLockedDialog={() => auth.setShowLockedDialog(false)}
          onLogin={auth.onLogin}
          onChange={auth.setLoginForm}
        />
        <FirstLoginModal
          isOpen={auth.showPasswordUpdateModal}
          form={auth.passwordUpdateForm}
          isPasswordLongEnough={auth.isPasswordLongEnough}
          isPasswordConfirmed={auth.isPasswordConfirmed}
          displayName={auth.pendingFirstLogin?.displayName || ""}
          onChange={auth.setPasswordUpdateForm}
          onSubmit={auth.onFirstLogin}
        />
        {exitChoiceModal}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <main className="page">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="sidebar-logo-wrap">
            <img src={logoGts} alt="Logo GTS" className="sidebar-logo" />
          </div>
          <h2 className="sidebar-title">Télésurveillance GTS</h2>
          <div className="user-badge">{session.user.fullName}</div>
          <div className="sidebar-today">{todayLabel}</div>
        </div>
        <div className="sidebar-nav-scroll app-scrollbar">
          <nav className="sidebar-pages" aria-label="Navigation principale">
          {userPageAccess.intervention && (
            <button
              type="button"
              className={activePage === "intervention" ? "nav-btn active" : "nav-btn"}
              onClick={() => setActivePage("intervention")}
            >
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
            <button type="button" className={activePage === "rondes" ? "nav-btn active" : "nav-btn"} onClick={() => setActivePage("rondes")}>
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
            <button
              type="button"
              className={activePage === "gardiennage" ? "nav-btn active" : "nav-btn"}
              onClick={() => setActivePage("gardiennage")}
            >
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
            <button
              type="button"
              className={activePage === "mainCourante" ? "nav-btn active" : "nav-btn"}
              onClick={() => setActivePage("mainCourante")}
            >
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
            <button type="button" className={activePage === "fransor" ? "nav-btn active" : "nav-btn"} onClick={() => setActivePage("fransor")}>
              <span className="nav-btn-label">Fransor</span>
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
            aria-label={
              postgresLabHealth?.reachable ? "Base de données accessible" : "Base de données inaccessible"
            }
            role="status"
          />
          <button
            type="button"
            title="Centre d'aide"
            aria-label="Centre d'aide"
            className="icon-btn sidebar-help-trigger"
            onClick={() => openHelpCenter(null)}
          >
            <span aria-hidden className="sidebar-help-icon">
              ?
            </span>
          </button>
          <button
            title={themeMode === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}
            className="icon-btn"
            onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
          >
            {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {userPageAccess.settings && (
            <button
              title="Paramètres"
              className={activePage === "settings" ? "icon-btn active" : "icon-btn"}
              onClick={openSettingsAtFirstTabs}
            >
              <Settings size={16} />
              {(settings.pendingSites.length + settings.pendingIntervenants.length) > 0 ? (
                <span
                  className="icon-btn-badge"
                  title={`${settings.pendingSites.length + settings.pendingIntervenants.length} élément(s) en attente de validation`}
                  aria-label={`${settings.pendingSites.length + settings.pendingIntervenants.length} élément(s) en attente de validation`}
                >
                  {settings.pendingSites.length + settings.pendingIntervenants.length}
                </span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            title="Fermeture : déconnexion, minimiser ou quitter"
            aria-label="Fermeture : déconnexion, minimiser ou quitter"
            className="icon-btn quit"
            onClick={() => setShowCloseAppModal(true)}
          >
            <Power size={16} />
          </button>
        </div>
        </div>
      </aside>

      <section className="content simple app-scrollbar">
        <header className="topbar">
          <h1>
            {activePage === "settings"
              ? "Paramètres"
              : activePage === "mainCourante"
                ? "Main courante"
                : activePage === "fransor"
                  ? "Accompagnement Fransor"
                  : activePage === "intervention"
                    ? "Interventions"
                  : activePage === "rondes"
                    ? "Rondes"
                  : activePage === "gardiennage"
                    ? "Gardiennage"
                  : "Main courante"}
          </h1>
        </header>

        {activePage === "settings" && userPageAccess.settings && (
          <SettingsPage
            session={session}
            requesterRole={session.user.role}
            canManageUsers={settings.canManageUsers}
            canAccessOperatorsTab={settings.canAccessOperatorsTab}
            canEditPageAccess={settings.canManagePageAccess}
            canManageData={settings.canManageData}
            canDeleteData={settings.canDeleteData}
            activeTab={settings.activeSettingsTab}
            users={settings.users}
            activeUsernames={settings.activeUsernames}
            auditLogs={settings.auditLogs}
            techErrorLogs={settings.techErrorLogs}
            auditMetadata={settings.auditMetadata}
            sites={settings.sites}
            intervenants={settings.intervenants}
            anomalyTypes={settings.anomalyTypes}
            holidays={settings.holidays}
            rondeMotifTypes={settings.rondeMotifTypes}
            rondePlannedProfiles={settings.rondePlannedProfiles}
            fransorResponsables={settings.fransorResponsables}
            pendingSites={settings.pendingSites}
            pendingIntervenants={settings.pendingIntervenants}
            currentUsername={session.user.username}
            onTabChange={settings.setActiveSettingsTab}
            activeDataTab={settings.activeDataTab}
            onDataTabChange={settings.setActiveDataTab}
            activeDocumentsTab={settings.activeDocumentsTab}
            onDocumentsTabChange={settings.setActiveDocumentsTab}
            onOpenCreate={settings.onOpenCreateUserModal}
            onExportAuditLogs={settings.onExportAuditLogs}
            onDeactivateUser={settings.onDeactivateUser}
            onReactivateUser={settings.onReactivateUser}
            onUnlockUser={(username) => void settings.onUnlockUser(username)}
            onRequestPasswordReset={(user) => void settings.onRequestPasswordReset(user)}
            onOpenEditUser={settings.onOpenEditUser}
            onCreateSite={(payload) => void settings.onCreateSite(payload)}
            onUpdateSite={(payload) => void settings.onUpdateSite(payload)}
            onDeleteSite={(id, reason) => void settings.onDeleteSite(id, reason)}
            onCreateIntervenant={(name) => void settings.onCreateIntervenant(name)}
            onUpdateIntervenant={(id, name) => void settings.onUpdateIntervenant(id, name)}
            onDeleteIntervenant={(id, reason) => void settings.onDeleteIntervenant(id, reason)}
            onCreateType={(label, colorHex) => void settings.onCreateAnomalyType(label, colorHex)}
            onUpdateType={(id, label, colorHex) => void settings.onUpdateAnomalyType(id, label, colorHex)}
            onDeleteType={(id, reason) => void settings.onDeleteAnomalyType(id, reason)}
            onCreateHoliday={(dateIso, label) => void settings.onCreateHoliday(dateIso, label)}
            onUpdateHoliday={(id, dateIso, label) => void settings.onUpdateHoliday(id, dateIso, label)}
            onDeleteHoliday={(id, reason) => void settings.onDeleteHoliday(id, reason)}
            onCreateRondeMotifType={(label, colorHex) => void settings.onCreateRondeMotifType(label, colorHex)}
            onUpdateRondeMotifType={(id, label, colorHex) => void settings.onUpdateRondeMotifType(id, label, colorHex)}
            onDeleteRondeMotifType={(id, reason) => void settings.onDeleteRondeMotifType(id, reason)}
            onCreateFransorResponsable={(name) => void settings.onCreateFransorResponsable(name)}
            onUpdateFransorResponsable={(id, name) => void settings.onUpdateFransorResponsable(id, name)}
            onDeleteFransorResponsable={(id, reason) => void settings.onDeleteFransorResponsable(id, reason)}
            onImportSiteRow={(payload) => settings.onImportSiteRow(payload)}
            onImportIntervenantRow={(name) => settings.onImportIntervenantRow(name)}
            onImportTypeRow={(label) => settings.onImportTypeRow(label)}
            onLogImportSummary={(payload) => settings.onLogImportSummary(payload)}
            onRefreshImportedData={(target) => settings.onRefreshImportedData(target)}
            onResolvePendingSite={(payload) => void settings.onResolvePendingSite(payload)}
            onResolvePendingIntervenant={(payload) => void settings.onResolvePendingIntervenant(payload)}
            onDeletePendingSiteSubmission={(payload) => settings.onDeletePendingSiteSubmission(payload)}
            onDeletePendingIntervenantSubmission={(payload) => settings.onDeletePendingIntervenantSubmission(payload)}
            onNotify={notifyToast}
            postgresConfig={settings.postgresConfig}
            postgresDraft={settings.postgresDraft}
            postgresTestResult={settings.postgresTestResult}
            postgresBusy={settings.postgresBusy}
            postgresBusyPhase={settings.postgresBusyPhase}
            onPostgresDraftChange={settings.setPostgresDraft}
            onSavePostgresConfig={() => void settings.onSavePostgresConfig()}
            onTestPostgresConfig={() => void settings.onTestPostgresConfig()}
            onReconnectPostgres={() => void settings.onReconnectPostgres()}
            onOpenHelpTopic={openHelpCenter}
            showCreateModal={settings.showCreateModal}
            onCloseCreateModal={() => settings.setShowCreateModal(false)}
            onCreateFormChange={settings.setCreateForm}
            createForm={settings.createForm}
            onSubmitCreate={settings.onCreateUser}
            userModalMode={settings.userModalMode}
            editingTechnicalUsername={settings.editingTechnicalUsername}
          />
        )}

        {activePage === "mainCourante" && userPageAccess.mainCourante && (
          <MainCourantePage
            operatorName={session.user.fullName}
            requesterUsername={session.user.username}
            requesterRole={session.user.role}
            onToast={notifyToast}
          />
        )}
        {activePage === "fransor" && userPageAccess.fransor && (
          <FransorPage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={notifyToast}
          />
        )}
        {activePage === "intervention" && userPageAccess.intervention && (
          <InterventionPage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            canAccessRondes={Boolean(userPageAccess.rondes)}
            canAccessGardiennage={Boolean(userPageAccess.gardiennage)}
            onToast={notifyToast}
            focusInterventionId={focusInterventionIdFromRonde}
            onFocusInterventionConsumed={() => setFocusInterventionIdFromRonde(null)}
            onNavigateToLinkedRonde={userPageAccess.rondes ? navigateToLinkedRonde : undefined}
            onNavigateToLinkedGardiennage={userPageAccess.gardiennage ? navigateToLinkedGardiennage : undefined}
          />
        )}
        {activePage === "gardiennage" && userPageAccess.gardiennage && (
          <GardiennagePage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={notifyToast}
            onNavigateToLinkedIntervention={userPageAccess.intervention ? navigateToLinkedIntervention : undefined}
            onNavigateToLinkedRonde={userPageAccess.rondes ? navigateToLinkedRonde : undefined}
            focusGardiennageId={focusGardiennageIdFromIntervention}
            onFocusGardiennageConsumed={() => setFocusGardiennageIdFromIntervention(null)}
          />
        )}
        {activePage === "rondes" && userPageAccess.rondes && (
          <RondePage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={notifyToast}
            onNavigateToLinkedIntervention={userPageAccess.intervention ? navigateToLinkedIntervention : undefined}
            focusRondeId={focusRondeIdFromIntervention}
            onFocusRondeConsumed={() => setFocusRondeIdFromIntervention(null)}
            onUpsertRondePlannedProfile={(payload) => void settings.onUpsertRondePlannedProfile(payload)}
            onDeleteRondePlannedProfile={(id, reason) => void settings.onDeleteRondePlannedProfile(id, reason)}
            onRequestRondePlannedProfileCancellation={(id, reason) =>
              void settings.onRequestRondePlannedProfileCancellation(id, reason)
            }
            onReviewRondePlannedProfileCancellationRequest={(id, payload) =>
              void settings.onReviewRondePlannedProfileCancellationRequest(id, payload)
            }
            onSetRondePlannedProfilePlanningEnd={(id, planningEndDate, reason) =>
              void settings.onSetRondePlannedProfilePlanningEnd(id, planningEndDate, reason)
            }
          />
        )}
        <HelpCenterModal
          isOpen={helpCenterOpen}
          onClose={() => setHelpCenterOpen(false)}
          access={helpAccess}
          initialTopicId={helpCenterInitialTopic}
        />
        <PgOfflineBlockingModal
          isOpen={showPgUnavailableModal}
          onQuitApp={() => void settings.onQuitAppNow()}
        />
        <ConfirmModal
          isOpen={settings.confirmDialog.isOpen}
          title={settings.confirmDialog.title}
          message={settings.confirmDialog.message}
          confirmLabel={settings.confirmDialog.confirmLabel}
          confirmClassName={settings.confirmDialog.confirmClassName}
          confirmDisabled={Boolean(settings.confirmDialog.confirmDisabled)}
          cancelLabel={settings.confirmDialog.cancelLabel}
          onCancel={settings.closeConfirmDialog}
          onConfirm={() => void settings.handleConfirmDialog()}
        >
          {settings.confirmDialog.children}
        </ConfirmModal>
        {exitChoiceModal}
        <CredentialShareModal
          isOpen={Boolean(credentialsToShare)}
          username={credentialsToShare?.username || ""}
          temporaryPassword={credentialsToShare?.temporaryPassword || ""}
          onClose={() => setCredentialsToShare(null)}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </section>
    </main>
  );
}
