/**
 * Types exportés du client IPC `gtsApiClient` (réponses PostgreSQL, audit, modèles Word).
 *
 * Importés par les presenters Paramètres / bootstrap et par `AppShell` (badge DB).
 * Les entités métier restent dans `src/types.ts` et les `model/*.types` des features.
 */

import type { GardiennageEntry } from "../../features/gardiennage/model/gardiennage.types";
import type { TemplateFlowKind } from "../../features/settings/model/documentTemplates.types";

export type DbConfig = { configured: boolean; isDev?: boolean };
export type DbHealth = { configured: boolean; writable: boolean };

export type TechErrorLog = {
  occurredAt: string;
  source: string;
  code: string;
  codeLabel: string;
  messageFr: string;
  details: Record<string, unknown> | null;
};

export type PostgresLabHealth = {
  reachable: boolean;
  engine: "postgres";
  host: string;
  port: number;
  database: string;
  error: string | null;
  checkedAt: string;
  /** Transition détectée par la sonde (perte / reconnexion) — absent si non fourni. */
  transition?: "none" | "lost" | "restored" | "unavailable_at_start";
};

export type PublicPostgresConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
  source: "env" | "encrypted" | "defaults";
  encryptionAvailable: boolean;
  envOverridesActive: boolean;
};

export type PostgresTestResult = {
  reachable: boolean;
  host: string;
  port: number;
  database: string;
  error: string | null;
  checkedAt: string;
};

export type PostgresReconnectResult = {
  success: boolean;
  reachable: boolean;
  error: string | null;
};

export type TemplateAssignmentRow = {
  id: string;
  flowKind: TemplateFlowKind;
  scopeKind: "SITE" | "FAMILLE";
  scopeValue: string;
  scopeLabel: string;
  templateFileName: string;
  createdAt: string;
  updatedAt: string;
};

/** Réponse d'annulation gardiennage (lot éventuel), plus riche que le type Window. */
export type GardiennageStatusResult = GardiennageEntry & {
  batchOperation?: {
    type: "CANCEL";
    isBatch: boolean;
    cancelledCount: number;
    preservedClosedCount: number;
  };
};
