/**
 * Écran de premier paramétrage / récupération PostgreSQL (avant login).
 *
 * Affiché en build packagé sans config, ou depuis le login si la base est injoignable.
 * Si le serveur redevient joignable pendant la récupération : message vert + retour login.
 * Réutilise `PostgresConnectionPanel` en variante bootstrap.
 */

import { CircleHelp } from "lucide-react";
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
  /** Ouvre le centre d'aide sur la rubrique connexion PostgreSQL. */
  onOpenHelp?: () => void;
};

/**
 * Vue contrôlée : logo + panneau connexion serveur PostgreSQL.
 *
 * @param props - Formulaire bootstrap / récupération et actions associées.
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
  onCancelRecovery,
  onOpenHelp
}: PostgresBootstrapViewProps) {
  const isBusy = busyPhase !== "idle";

  return (
    <main className="auth-page">
      <section className="panel login-panel postgres-bootstrap-panel" aria-busy={isBusy}>
        <AuthLogo />
        <div className="postgres-bootstrap-title-row">
          <h1>{isRecoveryMode ? "Connexion base de données" : "Initialisation GTS"}</h1>
          {onOpenHelp ? (
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Aide — connexion PostgreSQL"
              aria-label="Aide — connexion PostgreSQL"
              onClick={onOpenHelp}
            >
              <CircleHelp size={14} />
            </button>
          ) : null}
        </div>

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
            <PostgresConnectionPanel
              variant="bootstrap"
              isRecoveryMode={isRecoveryMode}
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
