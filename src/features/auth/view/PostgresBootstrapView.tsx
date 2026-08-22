/**
 * Écran de premier paramétrage PostgreSQL (avant login).
 *
 * Affiché en build packagé lorsque le poste n'a encore aucune config chiffrée ni variables GTS_PG_*.
 * En développement (appli non packagée), cet écran est ignoré : défauts Docker labo.
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
  error
}: PostgresBootstrapViewProps) {
  const isBusy = busyPhase !== "idle";

  return (
    <main className="auth-page">
      <section className="panel login-panel postgres-bootstrap-panel" aria-busy={isBusy}>
        <AuthLogo />
        <h1>Initialisation GTS</h1>
        <p className="muted">
          Avant la première connexion, indiquez le serveur PostgreSQL de la station. Sur un 2e poste, utilisez
          l&apos;adresse LAN du PC qui héberge Docker (ex. 192.168.x.x), pas localhost.
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
        {error && !isBusy ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}
