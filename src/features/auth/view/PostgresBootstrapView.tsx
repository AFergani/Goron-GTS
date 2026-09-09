/**
 * Écran de premier paramétrage / récupération PostgreSQL (avant login).
 *
 * Affiché en build packagé sans config, ou depuis le login si la base est injoignable.
 * Si le serveur redevient joignable pendant la récupération : message vert + retour login.
 * Réutilise `PostgresConnectionPanel` en variante bootstrap.
 */

import { AuthLogo } from "../components/AuthLogo";
import {
  PostgresConnectionPanel,
  type PostgresBusyPhase,
  type PostgresConfigDraft
} from "../../settings/components/PostgresConnectionPanel";
import type { PublicPostgresConfig, PostgresTestResult } from "../../../infrastructure/api/gtsApiClient";

type PostgresBootstrapViewProps = {
  config: PublicPostgresConfig | null;
  draft: PostgresConfigDraft;
  onDraftChange: (next: PostgresConfigDraft) => void;
  onSave: () => void | Promise<void>;
  onTest: () => void | Promise<void>;
  testResult: PostgresTestResult | null;
  busyPhase: PostgresBusyPhase;
  error: string;
  /** Récupération depuis l'écran login (config déjà connue mais injoignable). */
  isRecoveryMode?: boolean;
  /** Config actuelle redevenue joignable (ex. Docker relancé). */
  recoveryRestored?: boolean;
  recoveryRestoredMessage?: string;
  onCancelRecovery?: () => void;
};

/**
 * Vue contrôlée : logo + panneau connexion serveur PostgreSQL.
 */
export function PostgresBootstrapView({
  config,
  draft,
  onDraftChange,
  onSave,
  onTest,
  testResult,
  busyPhase,
  error,
  isRecoveryMode = false,
  recoveryRestored = false,
  recoveryRestoredMessage = "",
  onCancelRecovery
}: PostgresBootstrapViewProps) {
  const isBusy = busyPhase !== "idle";

  return (
    <main className="auth-page">
      <section className="panel login-panel postgres-bootstrap-panel" aria-busy={isBusy}>
        <AuthLogo />
        <h1>{isRecoveryMode ? "Connexion base de données" : "Initialisation GTS"}</h1>

        {isRecoveryMode && recoveryRestored ? (
          <>
            <p className="postgres-config-result ok" role="status">
              {recoveryRestoredMessage ||
                "PostgreSQL est de nouveau accessible. Cliquez sur « Retour à la connexion »."}
            </p>
            {onCancelRecovery ? (
              <button type="button" onClick={onCancelRecovery}>
                Retour à la connexion
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p className="muted">
              {isRecoveryMode ? (
                <>
                  Le serveur PostgreSQL configuré sur ce poste est inaccessible. Vérifiez l&apos;adresse IP (ex. après
                  changement de réseau), le port et Docker, puis testez avant d&apos;enregistrer.
                </>
              ) : (
                <>
                  Avant la première connexion, indiquez le serveur PostgreSQL de la station. Sur un 2e poste, utilisez
                  l&apos;adresse LAN du PC qui héberge Docker (ex. 192.168.x.x), pas localhost.
                </>
              )}
            </p>
            <PostgresConnectionPanel
              variant="bootstrap"
              config={config}
              draft={draft}
              onDraftChange={onDraftChange}
              onSave={onSave}
              onTest={onTest}
              testResult={testResult}
              busyPhase={busyPhase}
            />
            {isRecoveryMode && onCancelRecovery ? (
              <div className="login-links">
                <button type="button" className="link-btn" onClick={onCancelRecovery} disabled={isBusy}>
                  Retour à la connexion
                </button>
              </div>
            ) : null}
            {error && !isBusy ? <p className="error">{error}</p> : null}
          </>
        )}
      </section>
    </main>
  );
}
