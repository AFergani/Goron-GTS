/**
 * Coque applicative Goron-GTS : authentification, sidebar, navigation métier et indicateurs writer.
 *
 * Montée sous `SessionProvider` dans `App.tsx`. Orchestre les pages features (main courante,
 * interventions, rondes, gardiennage, Fransor, paramètres) selon `pageAccess` du compte connecté.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Power, Settings, Sun } from "lucide-react";
import logoGts from "../assets/logo-gts.png";
import { useSession } from "./session/SessionProvider";
import { useAuthPresenter } from "../features/auth/presenter/useAuthPresenter";
import { FirstLoginModal } from "../features/auth/view/FirstLoginModal";
import { LoginView } from "../features/auth/view/LoginView";
import { useSettingsPresenter } from "../features/settings/presenter/useSettingsPresenter";
import { SettingsPage } from "../features/settings/view/SettingsPage";
import { MainCourantePage } from "../features/mainCourante/view/MainCourantePage";
import { FransorPage } from "../features/fransor/view/FransorPage";
import { InterventionPage } from "../features/intervention/view/InterventionPage";
import { RondePage } from "../features/rondes/view/RondePage";
import { GardiennagePage } from "../features/gardiennage/view/GardiennagePage";
import { ConfirmModal } from "../features/common/components/ConfirmModal";
import { Toast } from "../features/common/components/Toast";
import { CredentialShareModal } from "../features/common/components/CredentialShareModal";
import { useGlobalDraggableModals } from "../features/common/hooks/useGlobalDraggableModals";
import { gtsApiClient } from "../infrastructure/api/gtsApiClient";
import type { WriterQueueStats, WriterStatus } from "../infrastructure/api/gtsApiClient";
import { HelpCenterModal } from "../features/help/components/HelpCenterModal";
import type { HelpTopicId } from "../features/help/model/helpTopics";
import "../styles/app.css";

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
 * Racine UI après connexion : layout sidebar + contenu, badges, thème et santé writer.
 */
export function AppShell() {
  useGlobalDraggableModals();
  const { session, setSession, clearSession } = useSession();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [toast, setToast] = useState("");
  const [credentialsToShare, setCredentialsToShare] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [activePage, setActivePage] = useState<AppPage>("mainCourante");
  const previousSessionUsernameRef = useRef<string | null>(null);
  const [mainCouranteUnconsultedCount, setMainCouranteUnconsultedCount] = useState(0);
  const [interventionOpenCount, setInterventionOpenCount] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("gts-theme");
    return saved === "light" ? "light" : "dark";
  });
  const [themeReadyForSessionSave, setThemeReadyForSessionSave] = useState(false);
  /** Deep-link ronde → intervention : ouvre la modale intervention ciblée. */
  const [focusInterventionIdFromRonde, setFocusInterventionIdFromRonde] = useState<string | null>(null);
  const [writerStatus, setWriterStatus] = useState<WriterStatus | null>(null);
  const [writerQueueStats, setWriterQueueStats] = useState<WriterQueueStats | null>(null);
  const [showCloseAppModal, setShowCloseAppModal] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [helpCenterInitialTopic, setHelpCenterInitialTopic] = useState<HelpTopicId | null>(null);
  const [fransorRefreshToken, setFransorRefreshToken] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const todayLabel = formatSidebarDateTime(now);
  const writerQueueTotal =
    writerQueueStats && writerQueueStats.available
      ? writerQueueStats.incoming + writerQueueStats.processing + writerQueueStats.ack
      : null;
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
  const getStatusTitle = (label: string, isOk: boolean | null) => {
    if (isOk === true) return `${label}: accessible`;
    if (isOk === false) return `${label}: inaccessible`;
    return `${label}: état inconnu`;
  };

  const navigateToLinkedIntervention = (interventionId: string) => {
    if (!userPageAccess.intervention) {
      setToast("Accès à la page Interventions non autorisé.");
      return;
    }
    setFocusInterventionIdFromRonde(interventionId);
    setActivePage("intervention");
  };

  /** Bascule vers Rondes (sélection de ligne ciblée à brancher sur `RondePage` si besoin). */
  const navigateToLinkedRonde = (_rondeId: string) => {
    if (!userPageAccess.rondes) {
      setToast("Accès à la page Rondes non autorisé.");
      return;
    }
    setActivePage("rondes");
  };

  const openSettingsAtFirstTabs = () => {
    if (!userPageAccess.settings) return;
    setActivePage("settings");
    // Toujours ouvrir Paramètres sur le premier onglet visible.
    settings.setActiveSettingsTab(settings.canAccessOperatorsTab ? "operators" : "data");
    // Et dans Gestion des données, revenir au premier onglet à gauche.
    settings.setActiveDataTab("sites");
  };

  const auth = useAuthPresenter({
    onSessionCreated: setSession,
    onError: setError,
    onToast: setToast
  });

  const settings = useSettingsPresenter({
    session,
    onError: setError,
    onInfo: setInfo,
    onToast: setToast,
    onCredentialsReady: setCredentialsToShare
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
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

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
      }
    }
    previousSessionUsernameRef.current = currentUsername;
  }, [firstSidebarPage, session?.user?.username, settings.canAccessOperatorsTab, settings.setActiveDataTab, settings.setActiveSettingsTab]);

  useEffect(() => {
    if (activePage !== "settings") return;
    // À chaque entrée dans Paramètres, forcer le premier onglet principal + premier sous-onglet data.
    settings.setActiveSettingsTab(settings.canAccessOperatorsTab ? "operators" : "data");
    settings.setActiveDataTab("sites");
  }, [activePage, settings.canAccessOperatorsTab, settings.setActiveDataTab, settings.setActiveSettingsTab]);

  useEffect(() => {
    if (activePage !== "fransor") return;
    setFransorRefreshToken((value) => value + 1);
  }, [activePage]);

  useEffect(() => {
    if (!session) {
      setWriterStatus(null);
      setWriterQueueStats(null);
      return;
    }
    const loadWriterStatus = async () => {
      try {
        const [status, queueStats] = await Promise.all([gtsApiClient.getWriterStatus(), gtsApiClient.getWriterQueueStats()]);
        setWriterStatus(status);
        setWriterQueueStats(queueStats);
      } catch {
        setWriterStatus(null);
        setWriterQueueStats(null);
      }
    };
    void loadWriterStatus();
    const timer = setInterval(() => {
      void loadWriterStatus();
    }, 5000);
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

  const runDisconnect = () => {
    setShowCloseAppModal(false);
    clearSession();
    settings.resetSettingsState();
    setInfo("");
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
    return (
      <>
        <LoginView
          loginForm={auth.loginForm}
          dbConfigured={settings.dbConfigured}
          error={error}
          showLockedDialog={auth.showLockedDialog}
          onCloseLockedDialog={() => auth.setShowLockedDialog(false)}
          onChooseDbPath={settings.onChooseDbPath}
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
        <Toast message={toast} />
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
            </button>
          )}
          {userPageAccess.gardiennage && (
            <button
              type="button"
              className={activePage === "gardiennage" ? "nav-btn active" : "nav-btn"}
              onClick={() => setActivePage("gardiennage")}
            >
              <span className="nav-btn-label">Gardiennage</span>
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
        <div className="sidebar-writer-health">
          <div
            className={`writer-health-chip ${settings.dbWritable ? "ok" : "ko"}`}
            title={getStatusTitle("DB", settings.dbWritable)}
            aria-label={getStatusTitle("DB", settings.dbWritable)}
          >
            DB
          </div>
          <div
            className={`writer-health-chip ${getStatusTone(
              writerStatus?.role === "master"
                ? true
                : writerStatus?.role === "backup"
                  ? writerStatus?.connectivity.masterReachable ?? null
                  : writerStatus?.connectivity.masterReachable ?? null
            )}`}
            title={getStatusTitle(
              "Master",
              writerStatus?.role === "master"
                ? true
                : writerStatus?.role === "backup"
                  ? writerStatus?.connectivity.masterReachable ?? null
                  : writerStatus?.connectivity.masterReachable ?? null
            )}
            aria-label={getStatusTitle(
              "Master",
              writerStatus?.role === "master"
                ? true
                : writerStatus?.role === "backup"
                  ? writerStatus?.connectivity.masterReachable ?? null
                  : writerStatus?.connectivity.masterReachable ?? null
            )}
          >
            Master
          </div>
          <div
            className={`writer-health-chip ${getStatusTone(
              writerStatus?.role === "backup"
                ? true
                : writerStatus?.connectivity.backupReachable ?? null
            )}`}
            title={getStatusTitle(
              "Backup",
              writerStatus?.role === "backup"
                ? true
                : writerStatus?.connectivity.backupReachable ?? null
            )}
            aria-label={getStatusTitle(
              "Backup",
              writerStatus?.role === "backup"
                ? true
                : writerStatus?.connectivity.backupReachable ?? null
            )}
          >
            Backup
          </div>
        </div>
        <div className="writer-queue-counter" title="Nombre total d'entrées en attente de validation writer">
          Queue: {writerQueueTotal ?? "--"}
        </div>
        <div className="sidebar-footer-inline" aria-label="Actions rapides">
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

        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}

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
            auditMetadata={settings.auditMetadata}
            sites={settings.sites}
            intervenants={settings.intervenants}
            anomalyTypes={settings.anomalyTypes}
            holidays={settings.holidays}
            rondeMotifTypes={settings.rondeMotifTypes}
            rondePlannedProfiles={settings.rondePlannedProfiles}
            fransorResponsables={settings.fransorResponsables}
            interventionPendingSites={settings.interventionPendingSites}
            interventionPendingIntervenants={settings.interventionPendingIntervenants}
            databaseItems={settings.databaseItems}
            archiveStatus={settings.archiveStatus}
            dbPath={settings.dbPath}
            currentUsername={session.user.username}
            hasArchiveSourceActive={settings.hasArchiveSourceActive}
            archiveOpenedBy={settings.archiveOpenedBy}
            onTabChange={settings.setActiveSettingsTab}
            activeDataTab={settings.activeDataTab}
            onDataTabChange={settings.setActiveDataTab}
            onOpenCreate={settings.onOpenCreateUserModal}
            onChooseDbPath={settings.onChooseDbPath}
            onOpenWriterLogFolder={() => void settings.onOpenWriterLogFolder()}
            onExportAuditLogs={settings.onExportAuditLogs}
            onDeleteUser={settings.onDeleteUser}
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
            onNotify={setToast}
            onRefreshDatabases={() => void settings.loadDatabaseList()}
            onSwitchDatabase={(dbPath) => void settings.onSwitchDatabase(dbPath)}
            onRefreshArchiveStatus={() => void settings.loadArchiveStatus()}
            onRunArchiveNow={() => void settings.onRunArchiveNow()}
            onRestoreLocalActiveDb={() => void settings.onRestoreLocalActiveDb()}
            writerConfigDraft={settings.writerConfigDraft}
            onWriterConfigDraftChange={settings.setWriterConfigDraft}
            onPrefillWriterNode={(target) => void settings.onPrefillWriterNode(target)}
            onGenerateWriterConfig={() => void settings.onGenerateWriterConfig()}
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
            onToast={setToast}
          />
        )}
        {activePage === "fransor" && userPageAccess.fransor && (
          <FransorPage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={setToast}
            refreshToken={fransorRefreshToken}
          />
        )}
        {activePage === "intervention" && userPageAccess.intervention && (
          <InterventionPage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            canAccessRondes={Boolean(userPageAccess.rondes)}
            canAccessGardiennage={Boolean(userPageAccess.gardiennage)}
            onToast={setToast}
            focusInterventionId={focusInterventionIdFromRonde}
            onFocusInterventionConsumed={() => setFocusInterventionIdFromRonde(null)}
          />
        )}
        {activePage === "gardiennage" && userPageAccess.gardiennage && (
          <GardiennagePage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={setToast}
            onNavigateToLinkedIntervention={userPageAccess.intervention ? navigateToLinkedIntervention : undefined}
            onNavigateToLinkedRonde={userPageAccess.rondes ? navigateToLinkedRonde : undefined}
          />
        )}
        {activePage === "rondes" && userPageAccess.rondes && (
          <RondePage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={setToast}
            onNavigateToLinkedIntervention={userPageAccess.intervention ? navigateToLinkedIntervention : undefined}
            onUpsertRondePlannedProfile={(payload) => void settings.onUpsertRondePlannedProfile(payload)}
            onDeleteRondePlannedProfile={(id, reason) => void settings.onDeleteRondePlannedProfile(id, reason)}
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
        <ConfirmModal
          isOpen={settings.confirmDialog.isOpen}
          title={settings.confirmDialog.title}
          message={settings.confirmDialog.message}
          confirmLabel={settings.confirmDialog.confirmLabel}
          confirmClassName={settings.confirmDialog.confirmClassName}
          onCancel={settings.closeConfirmDialog}
          onConfirm={() => void settings.handleConfirmDialog()}
        />
        {exitChoiceModal}
        <CredentialShareModal
          isOpen={Boolean(credentialsToShare)}
          username={credentialsToShare?.username || ""}
          temporaryPassword={credentialsToShare?.temporaryPassword || ""}
          onClose={() => setCredentialsToShare(null)}
        />
        <Toast message={toast} />
      </section>
    </main>
  );
}
