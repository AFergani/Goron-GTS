/**
 * Signatures IPC système (PostgreSQL, modèles Word, fenêtre) pour `window.gtsApi`.
 *
 * Assemblées dans `src/vite-env.d.ts`. Tenir aligné avec `electron/preload.js`.
 */

import type { Role } from "../../types";
import type { PostgresBackupStatus, PostgresCompareResult, PostgresRestoreResult } from "./gtsApi.types";
import type { TemplateFlowKind } from "../../features/settings/model/documentTemplates.types";

/** Canaux boot PG, sauvegardes, modèles Word et fenêtre. */
export interface GtsApiSystemChannels {
      getDbConfig: (payload?: { sessionToken?: string | null }) => Promise<{ configured: boolean; isDev?: boolean }>;
      setDevToolsEnabled: (payload: { enabled: boolean; sessionToken?: string | null }) => Promise<{ success: boolean; enabled: boolean }>;
      getDocumentTemplate: (payload: {
        templateName: string;
      }) => Promise<{ found: boolean; dataBase64: string | null; sourcePath: string | null }>;
      listDocumentTemplates: (payload: { sessionToken: string }) => Promise<{
        templates: Array<{
          kind: "builtin" | "custom";
          templateKey: string;
          title: string;
          fileName: string;
          helpId: string;
          resolvedPath: string | null;
          exists: boolean;
          targetInstallPath: string | null;
        }>;
        writableTemplatesDir: string | null;
      }>;
      installDocumentTemplateCopy: (payload: {
        sessionToken: string;
        targetFileName: string;
      }) => Promise<{
        canceled: boolean;
        success: boolean;
        fileName?: string;
        resolvedPath?: string | null;
        templatesRelativePath?: string;
      }>;
      deleteCustomDocumentTemplate: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        targetFileName: string;
      }) => Promise<{ success: boolean; fileName: string }>;
      listTemplateAssignments: (payload: { sessionToken: string; requesterRole: Role }) => Promise<
        Array<{
          id: string;
          flowKind: TemplateFlowKind;
          scopeKind: "SITE" | "FAMILLE";
          scopeValue: string;
          scopeLabel: string;
          templateFileName: string;
          createdAt: string;
          updatedAt: string;
        }>
      >;
      upsertScopedDocumentTemplate: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        flowKind: TemplateFlowKind;
        scopeKind: "SITE" | "FAMILLE";
        scopeValue: string;
        scopeLabel: string;
      }) => Promise<{
        canceled: boolean;
        success: boolean;
        fileName?: string;
        templatesRelativePath?: string;
        assignment?: {
          id: string;
          flowKind: TemplateFlowKind;
          scopeKind: "SITE" | "FAMILLE";
          scopeValue: string;
          scopeLabel: string;
          templateFileName: string;
          createdAt: string;
          updatedAt: string;
        };
      }>;
      deleteTemplateAssignment: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean; templateFileName?: string }>;
      resolveTemplateFileForContext: (payload: {
        sessionToken: string;
        requesterRole: Role;
        flowKind: TemplateFlowKind;
        siteId?: string | null;
        famille?: string | null;
      }) => Promise<{ templateFileName: string | null }>;
      openTemplatesFolder: (payload: {
        sessionToken: string;
      }) => Promise<{ success: boolean; path: string | null; error: string | null }>;
      saveExportFile: (payload: {
        sessionToken: string;
        defaultFileName: string;
        kind: "docx" | "xlsx";
        bytes: ArrayBuffer | Uint8Array;
      }) => Promise<{ canceled: boolean; filePath: string | null }>;
      openExportFile: (payload: {
        sessionToken: string;
        filePath: string;
      }) => Promise<{ success: boolean; error: string | null }>;
      getDbHealth: (payload?: { sessionToken?: string | null }) => Promise<{ configured: boolean; writable: boolean }>;
      getPostgresLabHealth: (payload?: { sessionToken?: string | null }) => Promise<{
        reachable: boolean;
        engine: "postgres";
        host: string;
        port: number;
        database: string;
        error: string | null;
        checkedAt: string;
        transition?: "none" | "lost" | "restored" | "unavailable_at_start";
      }>;
      getPostgresBootstrapStatus: (payload?: Record<string, never>) => Promise<{
        needsSetup: boolean;
        reachable: boolean;
        config: {
          host: string;
          port: number;
          database: string;
          user: string;
          hasPassword: boolean;
          source: "env" | "encrypted" | "defaults";
          encryptionAvailable: boolean;
          envOverridesActive: boolean;
        };
      }>;
      savePostgresBootstrapConfig: (payload: {
        host: string;
        port: number;
        database: string;
        user: string;
        password?: string;
      }) => Promise<{
        success: boolean;
        config: {
          host: string;
          port: number;
          database: string;
          user: string;
          hasPassword: boolean;
          source: "env" | "encrypted" | "defaults";
          encryptionAvailable: boolean;
          envOverridesActive: boolean;
        };
        reconnect: { success: boolean; reachable: boolean; error: string | null };
      }>;
      testPostgresBootstrapConfig: (payload: {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
      }) => Promise<{
        reachable: boolean;
        host: string;
        port: number;
        database: string;
        error: string | null;
        checkedAt: string;
      }>;
      getPostgresConfig: (payload: { sessionToken: string }) => Promise<{
        host: string;
        port: number;
        database: string;
        user: string;
        hasPassword: boolean;
        source: "env" | "encrypted" | "defaults";
        encryptionAvailable: boolean;
        envOverridesActive: boolean;
      }>;
      savePostgresConfig: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        host: string;
        port: number;
        database: string;
        user: string;
        password?: string;
      }) => Promise<{
        success: boolean;
        config: {
          host: string;
          port: number;
          database: string;
          user: string;
          hasPassword: boolean;
          source: "env" | "encrypted" | "defaults";
          encryptionAvailable: boolean;
          envOverridesActive: boolean;
        };
        reconnect: { success: boolean; reachable: boolean; error: string | null };
      }>;
      testPostgresConfig: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
      }) => Promise<{
        reachable: boolean;
        host: string;
        port: number;
        database: string;
        error: string | null;
        checkedAt: string;
      }>;
      reconnectPostgres: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ success: boolean; reachable: boolean; error: string | null }>;
      getPostgresBackupStatus: (payload?: { sessionToken?: string | null }) => Promise<PostgresBackupStatus>;
      pickPostgresBackupFolder: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ canceled: boolean; folderPath: string | null; config: PostgresBackupStatus }>;
      savePostgresBackupSettings: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        autoEnabled: boolean;
      }) => Promise<PostgresBackupStatus>;
      openPostgresBackupFolder: (payload: { sessionToken: string }) => Promise<{
        success: boolean;
        path: string | null;
        error: string | null;
      }>;
      runPostgresBackup: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ success: boolean; fileName: string; config: PostgresBackupStatus }>;
      runPostgresBackupSaveAs: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{
        canceled: boolean;
        fileName: string | null;
        filePath: string | null;
        config: PostgresBackupStatus;
      }>;
      startPostgresBackupCycle: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ success: boolean; fileName: string; config: PostgresBackupStatus }>;
      pickPostgresBackupFile: (payload?: { sessionToken?: string | null }) => Promise<{
        canceled: boolean;
        filePath: string | null;
        fileName: string | null;
      }>;
      restorePostgresBackup: (payload: {
        filePath?: string;
        fileName?: string;
      }) => Promise<PostgresRestoreResult>;
      restorePostgresBackupAuth: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        filePath?: string;
        fileName?: string;
      }) => Promise<PostgresRestoreResult>;
      comparePostgresBackup: (payload: {
        filePath?: string;
        fileName?: string;
      }) => Promise<PostgresCompareResult>;
      comparePostgresBackupAuth: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        filePath?: string;
        fileName?: string;
      }) => Promise<PostgresCompareResult>;
      quitApp: (payload?: { sessionToken?: string | null }) => Promise<{ success: boolean }>;
      minimizeApp: (payload?: { sessionToken?: string | null }) => Promise<{ success: boolean }>;
      subscribeAppExitChoiceRequest: (callback: () => void) => () => void;
}
