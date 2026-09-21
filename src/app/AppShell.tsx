/**
 * Coque applicative Goron-GTS : authentification, sidebar, navigation métier et badge DB (PostgreSQL).
 *
 * Montée sous `SessionProvider` dans `App.tsx`. Orchestre les pages features (main courante,
 * interventions, rondes, gardiennage, Fransor, paramètres) selon `pageAccess` du compte connecté.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "./session/SessionProvider";
import { AppExitChoiceModal } from "./AppExitChoiceModal";
import { AppSidebar } from "./AppSidebar";
import {
  APP_PAGE_TITLES,
  getFirstSidebarPageAccess,
  resolveUserPageAccess,
  type AppPage
} from "./appNavigation";
import { useAppShellNavBadges } from "./useAppShellNavBadges";
import { useAuthPresenter } from "../features/auth/presenter/useAuthPresenter";
import { usePostgresBootstrapPresenter } from "../features/auth/presenter/usePostgresBootstrapPresenter";
import { FirstLoginModal } from "../features/auth/view/FirstLoginModal";
import { LoginView } from "../features/auth/view/LoginView";
import { PeerResetModal } from "../features/auth/view/PeerResetModal";
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
import { useEnabledInterval } from "../features/common/hooks/useEnabledInterval";
import { useGlobalDraggableModals } from "../features/common/hooks/useGlobalDraggableModals";
import { useToastStack } from "../features/common/hooks/useToastStack";
import type { NotifyToast } from "../features/common/model/toast.types";
import {
  gtsApiClient,
  isSessionUserFacingMessage,
  setOnSessionExpired,
  type PostgresLabHealth
} from "../infrastructure/api/gtsApiClient";
import { HelpCenterModal } from "../features/help/components/HelpCenterModal";
import type { HelpTopicId } from "../features/help/model/helpTopics";
import { OFFLINE_CONNECTION_HELP_ACCESS } from "../features/help/model/helpAccess";
import { DATA_REFRESH_POLL_MS } from "../features/common/constants/dataRefreshPoll";
import "../styles/app.css";
import "../styles/fransor.css";
import "../styles/helpfransor.css";

type ThemeMode = "dark" | "light";

const PRESENCE_HEARTBEAT_MS = 20000;

/**
 * Racine UI après connexion : layout sidebar + contenu, badges, thème et santé DB (PostgreSQL).
 */
export function AppShell() {
  useGlobalDraggableModals();
  const { session, setSession, clearSession } = useSession();
  /** Erreur formulaire de connexion uniquement (ne pas la réafficher sur l'écran bootstrap PG). */
  const [error, setError] = useState("");
  /** Erreur du panneau premier paramétrage / récupération PostgreSQL. */
  const [bootstrapError, setBootstrapError] = useState("");
  const { toasts, notify: notifyToastRaw, dismiss: dismissToast } = useToastStack();
  /** Filtre les messages de session : une seule alerte via `setOnSessionExpired`. */
  const notifyToast: NotifyToast = useCallback(
    (message, variant = "success") => {
      if (isSessionUserFacingMessage(message)) return;
      notifyToastRaw(message, variant);
    },
    [notifyToastRaw]
  );
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

  useEffect(() => {
    setOnSessionExpired((message) => {
      notifyToastRaw(message, "error");
      clearSession();
    });
    return () => setOnSessionExpired(null);
  }, [clearSession, notifyToastRaw]);
  const [credentialsToShare, setCredentialsToShare] = useState<{ username: string; temporaryPassword: string } | null>(
    null
  );
  const [activePage, setActivePage] = useState<AppPage>("mainCourante");
  const previousSessionUsernameRef = useRef<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
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
  const isManager = session?.user.role === "RESPONSABLE" || session?.user.role === "DEV";
  const userPageAccess = useMemo(
    () => resolveUserPageAccess(session?.user.role, session?.user.pageAccess),
    [session?.user.role, session?.user.pageAccess]
  );
  const firstSidebarPage = useMemo(() => getFirstSidebarPageAccess(userPageAccess), [userPageAccess]);
  const navBadges = useAppShellNavBadges(session, isManager, userPageAccess.rondes, userPageAccess.gardiennage);

  const navigateToLinkedPage = (
    page: AppPage,
    id: string,
    setFocusId: (id: string) => void,
    deniedMessage: string
  ) => {
    if (!userPageAccess[page]) {
      notifyToast(deniedMessage, "warning");
      return;
    }
    setFocusId(id);
    setActivePage(page);
  };

  const auth = useAuthPresenter({
    onSessionCreated: setSession,
    onError: setError,
    onToast: notifyToast
  });

  const pgBootstrap = usePostgresBootstrapPresenter({
    onError: setBootstrapError,
    onToast: notifyToast,
    onClearLoginError: () => setError("")
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

  const resetSettingsToFirstTabs = useCallback(() => {
    settings.setActiveSettingsTab(settings.canAccessOperatorsTab ? "operators" : "data");
    settings.setActiveDataTab("sites");
    settings.setActiveDocumentsTab("templates");
  }, [
    settings.canAccessOperatorsTab,
    settings.setActiveDataTab,
    settings.setActiveDocumentsTab,
    settings.setActiveSettingsTab
  ]);

  const openSettingsAtFirstTabs = () => {
    if (!userPageAccess.settings) return;
    setActivePage("settings");
    resetSettingsToFirstTabs();
  };

  const openHelpCenter = useCallback((topicId?: HelpTopicId | null) => {
    setHelpCenterInitialTopic(topicId ?? null);
    setHelpCenterOpen(true);
  }, []);

  useEffect(() => {
    if (!session && !pgBootstrap.showBootstrap) {
      setHelpCenterOpen(false);
    }
  }, [session, pgBootstrap.showBootstrap]);

  const helpAccess = useMemo(
    () => ({
      pageAccess: userPageAccess,
      canManageUsers: settings.canManageUsers,
      canAccessOperatorsTab: settings.canAccessOperatorsTab,
      canManageData: settings.canManageData
    }),
    [userPageAccess, settings.canManageUsers, settings.canAccessOperatorsTab, settings.canManageData]
  );

  useEffect(() => {
    return gtsApiClient.subscribeAppExitChoiceRequest(() => setShowCloseAppModal(true));
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
      setActivePage(firstSidebarPage);
      if (firstSidebarPage === "settings") {
        resetSettingsToFirstTabs();
      }
    }
    previousSessionUsernameRef.current = currentUsername;
  }, [firstSidebarPage, resetSettingsToFirstTabs, session?.user?.username]);

  useEffect(() => {
    if (activePage !== "settings") return;
    resetSettingsToFirstTabs();
  }, [activePage, resetSettingsToFirstTabs]);

  useEnabledInterval(
    Boolean(session),
    DATA_REFRESH_POLL_MS,
    async () => {
      try {
        const pgHealth = await gtsApiClient.getPostgresLabHealth();
        setPostgresLabHealth(pgHealth);

        const previous = previousPostgresReachableRef.current;
        const reachable = Boolean(pgHealth?.reachable);
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
    },
    [session, notifyToast],
    () => {
      setPostgresLabHealth(null);
      previousPostgresReachableRef.current = null;
      setShowPgUnavailableModal(false);
    }
  );

  useEnabledInterval(
    Boolean(session),
    PRESENCE_HEARTBEAT_MS,
    () => {
      void gtsApiClient.touchPresence().catch(() => {
        // Ignore si PG down : la modale offline couvre déjà ce cas.
      });
    },
    [session]
  );

  const runDisconnect = () => {
    setShowCloseAppModal(false);
    clearSession();
    settings.resetSettingsState();
    setError("");
    setBootstrapError("");
    setCredentialsToShare(null);
  };

  const exitChoiceModal = (
    <AppExitChoiceModal
      isOpen={showCloseAppModal}
      hasSession={Boolean(session)}
      onCancel={() => setShowCloseAppModal(false)}
      onDisconnect={runDisconnect}
      onMinimize={() => {
        setShowCloseAppModal(false);
        void settings.onMinimizeApp();
      }}
      onQuit={() => {
        setShowCloseAppModal(false);
        void settings.onQuitAppNow();
      }}
    />
  );

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

    if (pgBootstrap.showBootstrap) {
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
            error={bootstrapError}
            isRecoveryMode={pgBootstrap.isRecoveryMode}
            recoveryRestored={pgBootstrap.recoveryRestored}
            recoveryRestoredMessage={pgBootstrap.recoveryRestoredMessage}
            onCancelRecovery={pgBootstrap.closeRecoverySetup}
            onOpenHelp={() => openHelpCenter("settings-connection")}
          />
          <HelpCenterModal
            isOpen={helpCenterOpen}
            onClose={() => setHelpCenterOpen(false)}
            access={OFFLINE_CONNECTION_HELP_ACCESS}
            initialTopicId="settings-connection"
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
          onOpenPeerReset={auth.onOpenPeerReset}
          showDbRecoveryLink={pgBootstrap.showDbRecoveryLink}
          onOpenDbRecovery={pgBootstrap.openRecoverySetup}
        />
        <PeerResetModal
          isOpen={auth.showPeerResetModal}
          form={auth.peerResetForm}
          error={auth.peerResetError}
          busy={auth.isPeerResetting}
          onChange={auth.setPeerResetForm}
          onClose={auth.onClosePeerReset}
          onSubmit={auth.onSubmitPeerReset}
        />
        <FirstLoginModal
          isOpen={auth.showPasswordUpdateModal}
          form={auth.passwordUpdateForm}
          isPasswordLongEnough={auth.isPasswordLongEnough}
          isPasswordConfirmed={auth.isPasswordConfirmed}
          isPasswordDifferentFromTemporary={auth.isPasswordDifferentFromTemporary}
          error={auth.passwordUpdateError}
          displayName={auth.pendingFirstLoginDisplayName}
          onChange={auth.onPasswordUpdateFormChange}
          onSubmit={auth.onFirstLogin}
        />
        {exitChoiceModal}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <main className="page">
      <AppSidebar
        fullName={session.user.fullName}
        userPageAccess={userPageAccess}
        activePage={activePage}
        onNavigate={setActivePage}
        interventionOpenCount={navBadges.interventionOpenCount}
        rondeTodayInProgressCount={navBadges.rondeTodayInProgressCount}
        gardiennageTodayInProgressCount={navBadges.gardiennageTodayInProgressCount}
        isManager={isManager}
        mainCouranteUnconsultedCount={navBadges.mainCouranteUnconsultedCount}
        mainCouranteOperatorResponseCount={navBadges.mainCouranteOperatorResponseCount}
        postgresLabHealth={postgresLabHealth}
        pendingRefsCount={settings.pendingSites.length + settings.pendingIntervenants.length}
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
        onOpenHelp={() => openHelpCenter(null)}
        onOpenSettings={openSettingsAtFirstTabs}
        onOpenExitChoice={() => setShowCloseAppModal(true)}
      />

      <section className="content simple app-scrollbar">
        <header className="topbar">
          <h1>{APP_PAGE_TITLES[activePage]}</h1>
        </header>

        {activePage === "settings" && userPageAccess.settings && (
          <SettingsPage
            session={session}
            requesterRole={session.user.role}
            canManageUsers={settings.canManageUsers}
            canAccessOperatorsTab={settings.canAccessOperatorsTab}
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
            onExportTechErrorLogs={settings.onExportTechErrorLogs}
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
            onNavigateToLinkedRonde={
              userPageAccess.rondes
                ? (id) =>
                    navigateToLinkedPage("rondes", id, setFocusRondeIdFromIntervention, "Accès à la page Rondes non autorisé.")
                : undefined
            }
            onNavigateToLinkedGardiennage={
              userPageAccess.gardiennage
                ? (id) =>
                    navigateToLinkedPage(
                      "gardiennage",
                      id,
                      setFocusGardiennageIdFromIntervention,
                      "Accès à la page Gardiennage non autorisé."
                    )
                : undefined
            }
          />
        )}
        {activePage === "gardiennage" && userPageAccess.gardiennage && (
          <GardiennagePage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={notifyToast}
            onNavigateToLinkedIntervention={
              userPageAccess.intervention
                ? (id) =>
                    navigateToLinkedPage(
                      "intervention",
                      id,
                      setFocusInterventionIdFromRonde,
                      "Accès à la page Interventions non autorisé."
                    )
                : undefined
            }
            onNavigateToLinkedRonde={
              userPageAccess.rondes
                ? (id) =>
                    navigateToLinkedPage("rondes", id, setFocusRondeIdFromIntervention, "Accès à la page Rondes non autorisé.")
                : undefined
            }
            focusGardiennageId={focusGardiennageIdFromIntervention}
            onFocusGardiennageConsumed={() => setFocusGardiennageIdFromIntervention(null)}
          />
        )}
        {activePage === "rondes" && userPageAccess.rondes && (
          <RondePage
            requesterRole={session.user.role}
            requesterUsername={session.user.username}
            onToast={notifyToast}
            onNavigateToLinkedIntervention={
              userPageAccess.intervention
                ? (id) =>
                    navigateToLinkedPage(
                      "intervention",
                      id,
                      setFocusInterventionIdFromRonde,
                      "Accès à la page Interventions non autorisé."
                    )
                : undefined
            }
            onNavigateToLinkedGardiennage={
              userPageAccess.gardiennage
                ? (id) =>
                    navigateToLinkedPage(
                      "gardiennage",
                      id,
                      setFocusGardiennageIdFromIntervention,
                      "Accès à la page Gardiennage non autorisé."
                    )
                : undefined
            }
            canAccessGardiennage={Boolean(userPageAccess.gardiennage)}
            focusRondeId={focusRondeIdFromIntervention}
            onFocusRondeConsumed={() => setFocusRondeIdFromIntervention(null)}
            onUpsertRondePlannedProfile={(payload) => settings.onUpsertRondePlannedProfile(payload)}
            onDeleteRondePlannedProfile={(id, reason) => settings.onDeleteRondePlannedProfile(id, reason)}
            onRequestRondePlannedProfileCancellation={(id, reason) =>
              settings.onRequestRondePlannedProfileCancellation(id, reason)
            }
            onReviewRondePlannedProfileCancellationRequest={(id, payload) =>
              settings.onReviewRondePlannedProfileCancellationRequest(id, payload)
            }
            onSetRondePlannedProfilePlanningEnd={(id, planningEndDate, reason) =>
              settings.onSetRondePlannedProfilePlanningEnd(id, planningEndDate, reason)
            }
          />
        )}
        <HelpCenterModal
          isOpen={helpCenterOpen}
          onClose={() => setHelpCenterOpen(false)}
          access={helpAccess}
          initialTopicId={helpCenterInitialTopic}
        />
        <PgOfflineBlockingModal isOpen={showPgUnavailableModal} onQuitApp={() => void settings.onQuitAppNow()} />
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
