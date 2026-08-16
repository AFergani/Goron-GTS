/**
 * Presenter premier paramétrage PostgreSQL (avant login).
 *
 * Affiché uniquement si aucune config chiffrée / env n'est connue sur le poste.
 * Après enregistrement réussi, `needsSetup` passe à false et l'écran login apparaît.
 */

import { useCallback, useEffect, useState } from "react";
import {
  gtsApiClient,
  type PublicPostgresConfig,
  type PostgresTestResult
} from "../../../infrastructure/api/gtsApiClient";
import type {
  PostgresBusyPhase,
  PostgresConfigDraft
} from "../../settings/components/PostgresConnectionPanel";

/** Normalise les messages d'erreur IPC pour l'affichage utilisateur. */
function getErrorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message.replace("Error invoking remote method", "").replace(/^[:\s-]+/, "").trim();
  return raw.replace(/^\[[A-Z_]+\]\s*/, "") || fallback;
}

/** Laisse React peindre l'état « busy » avant un IPC potentiellement long. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

type UsePostgresBootstrapPresenterOptions = {
  onError: (message: string) => void;
  onToast: (message: string) => void;
};

/**
 * Charge le statut bootstrap et expose sauvegarde / test sans session.
 */
export function usePostgresBootstrapPresenter({ onError, onToast }: UsePostgresBootstrapPresenterOptions) {
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [postgresConfig, setPostgresConfig] = useState<PublicPostgresConfig | null>(null);
  const [postgresDraft, setPostgresDraft] = useState<PostgresConfigDraft>({
    host: "127.0.0.1",
    port: 5432,
    database: "goron_gts",
    user: "goron_gts_app",
    password: ""
  });
  const [postgresTestResult, setPostgresTestResult] = useState<PostgresTestResult | null>(null);
  const [busyPhase, setBusyPhase] = useState<PostgresBusyPhase>("idle");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await gtsApiClient.getPostgresBootstrapStatus();
        if (cancelled) return;
        setNeedsSetup(Boolean(status.needsSetup));
        setPostgresConfig(status.config);
        setPostgresDraft({
          host: status.config.host,
          port: status.config.port,
          database: status.config.database,
          user: status.config.user,
          password: ""
        });
      } catch (err) {
        if (!cancelled) {
          // En cas d'échec IPC, ne pas bloquer le login (repli).
          setNeedsSetup(false);
          onError(getErrorMessage(err, "Impossible de vérifier la configuration PostgreSQL."));
        }
      } finally {
        if (!cancelled) setStatusLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const onSavePostgresBootstrap = useCallback(async () => {
    if (busyPhase !== "idle") return;
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
      if (result.reconnect?.reachable) {
        setNeedsSetup(false);
        onToast("Connexion PostgreSQL enregistrée. Vous pouvez vous connecter.");
      } else {
        // Rester sur l'écran pour corriger l'hôte / le mot de passe (fenêtre bootstrap encore ouverte côté main).
        setNeedsSetup(true);
        onError(
          result.reconnect?.error
            ? `Configuration enregistrée, mais la base est inaccessible : ${result.reconnect.error}`
            : "Configuration enregistrée, mais la base est inaccessible. Corrigez l'hôte ou le mot de passe, puis réessayez."
        );
      }
    } catch (err) {
      onError(getErrorMessage(err, "Impossible d'enregistrer la connexion PostgreSQL."));
    } finally {
      setBusyPhase("idle");
    }
  }, [busyPhase, onError, onToast, postgresDraft]);

  const onTestPostgresBootstrap = useCallback(async () => {
    if (busyPhase !== "idle") return;
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
      } else {
        onError(result.error || "Connexion PostgreSQL impossible.");
      }
    } catch (err) {
      onError(getErrorMessage(err, "Échec du test PostgreSQL."));
    } finally {
      setBusyPhase("idle");
    }
  }, [busyPhase, onError, onToast, postgresDraft]);

  return {
    statusLoaded,
    needsSetup,
    postgresConfig,
    postgresDraft,
    setPostgresDraft,
    postgresTestResult,
    busyPhase,
    postgresBusy: busyPhase !== "idle",
    onSavePostgresBootstrap,
    onTestPostgresBootstrap
  };
}
