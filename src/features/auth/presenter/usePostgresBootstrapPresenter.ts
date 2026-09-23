/**
 * Presenter premier paramétrage / récupération PostgreSQL (avant login).
 *
 * Affiché si aucune config connue, ou si l'utilisateur ouvre la récupération
 * alors que le serveur actuel est injoignable (changement d'IP, Docker arrêté…).
 * Si Docker / le serveur revient pendant la récupération : toast + retour automatique au login.
 */

import { useCallback, useEffect, useState } from "react";
import {
  gtsApiClient,
  type PublicPostgresConfig,
  type PostgresTestResult
} from "../../../infrastructure/api/gtsApiClient";
import {
  DEFAULT_POSTGRES_CONFIG_DRAFT,
  type PostgresBusyPhase,
  type PostgresConfigDraft
} from "../../settings/components/PostgresConnectionPanel";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

const REACHABILITY_POLL_MS = 10000;
const RECOVERY_POLL_MS = 4000;

const RECOVERY_RESTORED_MESSAGE =
  "PostgreSQL est de nouveau accessible avec la configuration actuelle. Cliquez sur « Retour à la connexion ».";

/**
 * Laisse React peindre l'état « busy » avant un IPC potentiellement long.
 *
 * @returns Promesse résolue au frame suivant.
 */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

/**
 * Indique que le backend refuse le bootstrap car la config actuelle répond déjà.
 *
 * @param error - Erreur IPC
 */
function isBootstrapBlockedBecauseReachable(error: unknown): boolean {
  const message = extractUserFacingErrorMessage(error, "");
  return (
    message.includes("BOOTSTRAP_NOT_ALLOWED") ||
    message.includes("PostgreSQL est accessible avec la configuration actuelle") ||
    message.includes("Connectez-vous pour la modifier dans Paramètres")
  );
}

type UsePostgresBootstrapPresenterOptions = {
  onError: (message: string) => void;
  onToast: (message: string) => void;
  /** Efface l'erreur de l'écran login (ne pas la réafficher sur la récupération PG). */
  onClearLoginError?: () => void;
};

/**
 * Charge le statut bootstrap et expose sauvegarde / test sans session.
 *
 * @param options.onError - Message sous le panneau (échec IPC / base injoignable).
 * @param options.onToast - Succès enregistrement ou test.
 * @param options.onClearLoginError - Reset de l'erreur de connexion (écran login).
 */
export function usePostgresBootstrapPresenter({
  onError,
  onToast,
  onClearLoginError
}: UsePostgresBootstrapPresenterOptions) {
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  /** Config connue mais serveur injoignable → bouton secours sur l'écran login. */
  const [pgReachable, setPgReachable] = useState(true);
  /** Ouverture manuelle de l'écran d'init depuis le login (récupération). */
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  /** Config actuelle redevenue joignable pendant la récupération (Docker relancé, etc.). */
  const [recoveryRestored, setRecoveryRestored] = useState(false);
  const [postgresConfig, setPostgresConfig] = useState<PublicPostgresConfig | null>(null);
  const [postgresDraft, setPostgresDraft] = useState<PostgresConfigDraft>(DEFAULT_POSTGRES_CONFIG_DRAFT);
  const [postgresTestResult, setPostgresTestResult] = useState<PostgresTestResult | null>(null);
  const [busyPhase, setBusyPhase] = useState<PostgresBusyPhase>("idle");

  const markRecoveryRestored = useCallback(() => {
    setPgReachable(true);
    setRecoveryRestored(false);
    setPostgresTestResult(null);
    setRecoveryOpen(false);
    onError("");
    onClearLoginError?.();
    onToast("PostgreSQL est de nouveau accessible. Vous pouvez vous connecter.");
  }, [onClearLoginError, onError, onToast]);

  const applyStatus = useCallback((status: { needsSetup: boolean; reachable: boolean; config: PublicPostgresConfig }) => {
    setNeedsSetup(Boolean(status.needsSetup));
    setPgReachable(Boolean(status.reachable));
    setPostgresConfig(status.config);
    setPostgresDraft((prev) => ({
      host: status.config.host,
      port: status.config.port,
      database: status.config.database,
      user: status.config.user,
      // Conserve un mot de passe déjà saisi en recovery, sinon vide (= garder le stocké).
      password: prev.password || ""
    }));
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await gtsApiClient.getPostgresBootstrapStatus();
    applyStatus({
      needsSetup: Boolean(status.needsSetup),
      reachable: Boolean(status.reachable),
      config: status.config
    });
    return status;
  }, [applyStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await gtsApiClient.getPostgresBootstrapStatus();
        if (cancelled) return;
        applyStatus({
          needsSetup: Boolean(status.needsSetup),
          reachable: Boolean(status.reachable),
          config: status.config
        });
      } catch (err) {
        if (!cancelled) {
          // En cas d'échec IPC, ne pas bloquer le login (repli) ; proposer la récupération.
          setNeedsSetup(false);
          setPgReachable(false);
          onError(extractUserFacingErrorMessage(err, "Impossible de vérifier la configuration PostgreSQL."));
        }
      } finally {
        if (!cancelled) setStatusLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStatus, onError]);

  // Sur l'écran login : re-sonde périodiquement pour masquer le bouton dès que PG revient.
  useEffect(() => {
    if (!statusLoaded || needsSetup || recoveryOpen) return;
    const timer = window.setInterval(() => {
      void refreshStatus().catch(() => {
        setPgReachable(false);
      });
    }, REACHABILITY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [statusLoaded, needsSetup, recoveryOpen, refreshStatus]);

  // En récupération : détecter le retour de Docker / serveur sans écraser le brouillon saisi.
  useEffect(() => {
    if (!statusLoaded || !recoveryOpen || needsSetup) return;
    let cancelled = false;

    const pollRecovery = async () => {
      try {
        const status = await gtsApiClient.getPostgresBootstrapStatus();
        if (cancelled) return;
        if (status.reachable) {
          markRecoveryRestored();
        } else if (!cancelled) {
          setPgReachable(false);
          setRecoveryRestored(false);
        }
      } catch {
        if (!cancelled) {
          setPgReachable(false);
        }
      }
    };

    void pollRecovery();
    const timer = window.setInterval(() => {
      void pollRecovery();
    }, RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [statusLoaded, recoveryOpen, needsSetup, markRecoveryRestored]);

  const openRecoverySetup = useCallback(() => {
    onError("");
    onClearLoginError?.();
    setPostgresTestResult(null);
    setRecoveryRestored(false);
    setRecoveryOpen(true);
  }, [onClearLoginError, onError]);

  const closeRecoverySetup = useCallback(() => {
    onError("");
    setPostgresTestResult(null);
    setRecoveryRestored(false);
    setRecoveryOpen(false);
    void refreshStatus().catch(() => {
      setPgReachable(false);
    });
  }, [onError, refreshStatus]);

  const onSavePostgresBootstrap = useCallback(async () => {
    if (busyPhase !== "idle") return;
    if (recoveryRestored) return;
    onError("");
    setBusyPhase("saving");
    setPostgresTestResult(null);
    await yieldToUi();
    try {
      const result = await gtsApiClient.savePostgresBootstrapConfig({
        host: postgresDraft.host,
        port: postgresDraft.port,
        database: postgresDraft.database,
        user: postgresDraft.user,
        password: postgresDraft.password
      });
      setPostgresConfig(result.config);
      setPostgresDraft((prev) => ({ ...prev, password: "" }));
      setNeedsSetup(false);
      setRecoveryOpen(false);
      setRecoveryRestored(false);
      setPgReachable(Boolean(result.reconnect?.reachable));
      if (result.reconnect?.reachable) {
        onToast("Connexion PostgreSQL enregistrée. Vous pouvez vous connecter.");
      } else {
        onError(
          result.reconnect?.error
            ? `Configuration enregistrée sur ce poste, mais PostgreSQL est inaccessible pour l'instant : ${result.reconnect.error}`
            : "Configuration enregistrée sur ce poste. PostgreSQL est inaccessible pour l'instant — vérifiez Docker ou le pare-feu Windows, puis connectez-vous."
        );
      }
    } catch (err) {
      if (isBootstrapBlockedBecauseReachable(err)) {
        markRecoveryRestored();
      } else {
        onError(extractUserFacingErrorMessage(err, "Impossible d'enregistrer la connexion PostgreSQL."));
      }
    } finally {
      setBusyPhase("idle");
    }
  }, [busyPhase, markRecoveryRestored, onError, onToast, postgresDraft, recoveryRestored]);

  const onTestPostgresBootstrap = useCallback(async () => {
    if (busyPhase !== "idle") return;
    if (recoveryRestored) return;
    onError("");
    setBusyPhase("testing");
    await yieldToUi();
    try {
      const result = await gtsApiClient.testPostgresBootstrapConfig({
        host: postgresDraft.host,
        port: postgresDraft.port,
        database: postgresDraft.database,
        user: postgresDraft.user,
        password: postgresDraft.password
      });
      setPostgresTestResult(result);
      if (result.reachable) {
        onToast("Test PostgreSQL réussi.");
      }
      // L'échec est déjà affiché dans le panneau (« Échec — … »). Pas de second message en dessous.
    } catch (err) {
      if (isBootstrapBlockedBecauseReachable(err)) {
        markRecoveryRestored();
      } else {
        onError(extractUserFacingErrorMessage(err, "Échec du test PostgreSQL."));
      }
    } finally {
      setBusyPhase("idle");
    }
  }, [busyPhase, markRecoveryRestored, onError, onToast, postgresDraft, recoveryRestored]);

  return {
    statusLoaded,
    needsSetup,
    /** Afficher l'écran bootstrap (1ère init ou récupération). */
    showBootstrap: needsSetup || recoveryOpen,
    /** Bouton secours sur login : config déjà connue mais serveur injoignable. */
    showDbRecoveryLink: statusLoaded && !needsSetup && !pgReachable,
    isRecoveryMode: recoveryOpen && !needsSetup,
    recoveryRestored: recoveryOpen && !needsSetup && recoveryRestored,
    recoveryRestoredMessage: RECOVERY_RESTORED_MESSAGE,
    postgresConfig,
    postgresDraft,
    setPostgresDraft,
    postgresTestResult: recoveryRestored ? null : postgresTestResult,
    busyPhase,
    openRecoverySetup,
    closeRecoverySetup,
    onSavePostgresBootstrap,
    onTestPostgresBootstrap
  };
}
