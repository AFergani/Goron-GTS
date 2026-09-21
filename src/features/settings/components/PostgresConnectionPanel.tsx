/**
 * Panneau connexion PostgreSQL (hôte, port, base, utilisateur, mot de passe chiffré).
 * Utilisé à l'initialisation / récupération (avant login). L'onglet Paramètres
 * « Gestion base de données » affiche les sauvegardes, pas ce formulaire.
 */

import { CircleHelp, Loader2 } from "lucide-react";
import type { PublicPostgresConfig, PostgresTestResult } from "../../../infrastructure/api/gtsApiClient";
import { PasswordInput } from "../../common/components/PasswordInput";
import "./PostgresConnectionPanel.css";

export type PostgresConfigDraft = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

/** Brouillon initial (labo Docker) : bootstrap avant login. */
export const DEFAULT_POSTGRES_CONFIG_DRAFT: PostgresConfigDraft = {
  host: "127.0.0.1",
  port: 5432,
  database: "goron_gts",
  user: "goron_gts_app",
  password: ""
};

export type PostgresBusyPhase = "idle" | "testing" | "saving" | "reconnecting";

type PostgresConnectionPanelProps = {
  config: PublicPostgresConfig | null;
  draft: PostgresConfigDraft;
  onDraftChange: (next: PostgresConfigDraft) => void;
  onSave: () => void | Promise<void>;
  onTest: () => void | Promise<void>;
  onReconnect?: () => void | Promise<void>;
  testResult: PostgresTestResult | null;
  busyPhase?: PostgresBusyPhase;
  /** `bootstrap` = premier paramétrage avant login (sans reconnexion manuelle). */
  variant?: "admin" | "bootstrap";
  /** Récupération depuis le login : la config existe déjà mais PostgreSQL ne répond pas. */
  isRecoveryMode?: boolean;
  /** Bouton d'aide (admin uniquement), aligné sur le texte d'intro. */
  onHelpClick?: () => void;
};

/**
 * Formulaire de configuration PostgreSQL (secret jamais prérempli).
 */
export function PostgresConnectionPanel({
  config,
  draft,
  onDraftChange,
  onSave,
  onTest,
  onReconnect,
  testResult,
  busyPhase,
  variant = "admin",
  isRecoveryMode = false,
  onHelpClick
}: PostgresConnectionPanelProps) {
  const isBootstrap = variant === "bootstrap";
  const phase: PostgresBusyPhase = busyPhase ?? "idle";
  const isBusy = phase !== "idle";

  const technicalSecretLead =
    "Le compte technique et le mot de passe sont fournis uniquement par le responsable ou le directeur de station. Ils sont stockés chiffrés sur ce poste uniquement.";
  const bootstrapLead = isRecoveryMode
    ? `Le serveur PostgreSQL configuré sur ce poste est inaccessible. Vérifiez l'adresse IP (hôte LAN, ex. après changement de réseau), le port et Docker, puis testez avant d'enregistrer. ${technicalSecretLead}`
    : `Indiquez le serveur PostgreSQL de la station (hôte LAN). Sur un 2e poste, utilisez l'adresse LAN du PC qui héberge Docker, pas localhost. ${technicalSecretLead}`;

  const sourceLabel =
    config?.source === "env"
      ? "Variables d'environnement GTS_PG_* (prioritaires)"
      : config?.source === "encrypted"
        ? "Fichier chiffré local (safeStorage)"
        : "Valeurs labo par défaut";

  const saveLabel = (() => {
    if (phase === "saving") {
      return (
        <span className="login-submit-busy">
          <Loader2 size={16} className="login-spinner" aria-hidden />
          {isBootstrap ? "Enregistrement en cours…" : "Enregistrement…"}
        </span>
      );
    }
    return isBootstrap ? "Enregistrer et continuer" : "Enregistrer et reconnecter";
  })();

  const testLabel =
    phase === "testing" ? (
      <span className="login-submit-busy">
        <Loader2 size={16} className="login-spinner" aria-hidden />
        Test en cours…
      </span>
    ) : (
      "Tester la connexion"
    );

  return (
    <div
      className={isBootstrap ? "postgres-config-panel" : "postgres-config-panel postgres-config-panel--flat"}
      aria-labelledby={isBootstrap ? "postgres-config-title" : undefined}
      aria-busy={isBusy}
    >
      {isBootstrap ? <h4 id="postgres-config-title">Connexion PostgreSQL</h4> : null}
      <div className="postgres-config-lead-row">
        <p className="muted postgres-config-lead">
          {isBootstrap
            ? bootstrapLead
            : "Compte technique unique pour l'application. Le mot de passe est stocké chiffré sur ce poste et n'est jamais réaffiché."}
        </p>
        {!isBootstrap && onHelpClick ? (
          <button
            type="button"
            className="btn-light action-icon-btn"
            title="Aide — gestion de la base de données"
            aria-label="Aide — gestion de la base de données"
            onClick={onHelpClick}
          >
            <CircleHelp size={14} />
          </button>
        ) : null}
      </div>
      <div className="postgres-config-meta muted">
        <span>Source actuelle : {sourceLabel}</span>
        {config?.hasPassword ? <span>Mot de passe : enregistré</span> : <span>Mot de passe : non défini</span>}
        {!config?.encryptionAvailable ? (
          <span className="postgres-config-warn">Chiffrement système indisponible sur ce poste.</span>
        ) : null}
        {config?.envOverridesActive ? (
          <span className="postgres-config-warn">
            Les variables d&apos;environnement bloquent l&apos;enregistrement local tant qu&apos;elles sont définies.
          </span>
        ) : null}
      </div>

      <div className="postgres-config-grid">
        <label className="postgres-config-field">
          <span>Hôte</span>
          <input
            type="text"
            autoComplete="off"
            value={draft.host}
            disabled={isBusy || Boolean(config?.envOverridesActive)}
            onChange={(e) => onDraftChange({ ...draft, host: e.target.value })}
          />
        </label>
        <label className="postgres-config-field">
          <span>Port</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={draft.port}
            disabled={isBusy || Boolean(config?.envOverridesActive)}
            onChange={(e) => onDraftChange({ ...draft, port: Number(e.target.value) || 5432 })}
          />
        </label>
        <label className="postgres-config-field">
          <span>Base</span>
          <input
            type="text"
            autoComplete="off"
            value={draft.database}
            disabled={isBusy || Boolean(config?.envOverridesActive)}
            onChange={(e) => onDraftChange({ ...draft, database: e.target.value })}
          />
        </label>
        <label className="postgres-config-field">
          <span>Utilisateur technique</span>
          <input
            type="text"
            autoComplete="off"
            value={draft.user}
            disabled={isBusy || Boolean(config?.envOverridesActive)}
            onChange={(e) => onDraftChange({ ...draft, user: e.target.value })}
          />
        </label>
        <label className="postgres-config-field postgres-config-field--wide">
          <span>Mot de passe technique {config?.hasPassword ? "(laisser vide pour conserver)" : ""}</span>
          <PasswordInput
            value={draft.password}
            onChange={(password) => onDraftChange({ ...draft, password })}
            disabled={isBusy || Boolean(config?.envOverridesActive)}
            autoComplete="new-password"
            placeholder={config?.hasPassword ? "••••••••" : ""}
            aria-label="Mot de passe technique PostgreSQL"
          />
        </label>
      </div>

      <div className="postgres-config-actions">
        <button type="button" className="btn-light" disabled={isBusy} onClick={() => void onTest()}>
          {testLabel}
        </button>
        <button
          type="button"
          disabled={isBusy || Boolean(config?.envOverridesActive) || !config?.encryptionAvailable}
          aria-busy={phase === "saving"}
          onClick={() => void onSave()}
        >
          {saveLabel}
        </button>
        {!isBootstrap && onReconnect ? (
          <button type="button" className="btn-light" disabled={isBusy} onClick={() => void onReconnect()}>
            {phase === "reconnecting" ? (
              <span className="login-submit-busy">
                <Loader2 size={16} className="login-spinner" aria-hidden />
                Reconnexion…
              </span>
            ) : (
              "Reconnecter"
            )}
          </button>
        ) : null}
      </div>

      {phase === "saving" ? (
        <p className="muted login-status" role="status">
          {isBootstrap
            ? "Enregistrement de la configuration et établissement de la connexion à la base…"
            : "Enregistrement et reconnexion au serveur PostgreSQL…"}
        </p>
      ) : null}
      {phase === "testing" ? (
        <p className="muted login-status" role="status">
          Test de connexion au serveur PostgreSQL…
        </p>
      ) : null}

      {testResult && phase === "idle" ? (
        <p
          className={testResult.reachable ? "postgres-config-result ok" : "postgres-config-result ko"}
          role="status"
        >
          {testResult.reachable
            ? `Connexion OK — ${testResult.host}:${testResult.port}/${testResult.database}`
            : `Échec — ${testResult.error || "inaccessible"}`}
        </p>
      ) : null}
    </div>
  );
}
