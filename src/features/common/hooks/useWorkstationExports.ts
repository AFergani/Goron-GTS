/**
 * Mémorise et rouvre les derniers exports Word/Excel de ce poste.
 *
 * Word de fiche : le bouton d’ouverture reste disponible tant qu’un fichier est mémorisé.
 * Excel et rapports « quick: » : le bouton n’est actif que 20 s après l’export.
 *
 * Utilisé par les pages métier et le journal d’audit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { NotifyToast } from "../model/toast.types";
import type { SaveExportFileResult } from "../utils/saveExportBlob";
import { readStoredExportPaths, writeStoredExportPaths } from "../utils/workstationExportPaths";

/** Durée pendant laquelle « Ouvrir » reste actif après un export de liste ou un PV vidéo. */
export const EXCEL_OPEN_WINDOW_MS = 20000;

/**
 * Vrai pour les exports dont l’ouverture ne dure que {@link EXCEL_OPEN_WINDOW_MS}.
 *
 * @param key - Clé `excel:` (listes) ou `quick:` (PV vidéo).
 */
function opensTemporarily(key: string): boolean {
  return key.startsWith("excel:") || key.startsWith("quick:");
}

/**
 * Hook de chemins d’export locaux (localStorage) + ouverture système.
 */
export function useWorkstationExports(): {
  getLastPath: (key: string) => string | null;
  rememberPath: (key: string, filePath: string) => void;
  forgetPath: (key: string) => void;
  /** Vrai uniquement pendant `EXCEL_OPEN_WINDOW_MS` après le dernier export Excel de cette clé. */
  canOpenExcelTemporarily: (key: string) => boolean;
  saveAndRemember: (
    key: string,
    run: () => Promise<SaveExportFileResult>,
    onToast: NotifyToast | undefined,
    successMessage: string
  ) => Promise<void>;
  openLastExport: (key: string, onToast?: NotifyToast) => Promise<void>;
} {
  const [paths, setPaths] = useState<Record<string, string>>(readStoredExportPaths);
  const [excelOpenUntil, setExcelOpenUntil] = useState<Record<string, number>>({});
  const excelOpenTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(excelOpenTimersRef.current)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const rememberPath = useCallback((key: string, filePath: string) => {
    setPaths((prev) => {
      const next = { ...prev, [key]: filePath };
      writeStoredExportPaths(next);
      return next;
    });
  }, []);

  const forgetPath = useCallback((key: string) => {
    setPaths((prev) => {
      const next = { ...prev };
      delete next[key];
      writeStoredExportPaths(next);
      return next;
    });
  }, []);

  const getLastPath = useCallback((key: string) => paths[key] ?? null, [paths]);

  const canOpenExcelTemporarily = useCallback(
    (key: string) => (excelOpenUntil[key] ?? 0) > Date.now(),
    [excelOpenUntil]
  );

  const armExcelOpenWindow = useCallback((key: string) => {
    if (!opensTemporarily(key)) return;
    const until = Date.now() + EXCEL_OPEN_WINDOW_MS;
    const previousTimer = excelOpenTimersRef.current[key];
    if (previousTimer) window.clearTimeout(previousTimer);
    setExcelOpenUntil((prev) => ({ ...prev, [key]: until }));
    excelOpenTimersRef.current[key] = window.setTimeout(() => {
      setExcelOpenUntil((prev) => {
        if (prev[key] !== until) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete excelOpenTimersRef.current[key];
    }, EXCEL_OPEN_WINDOW_MS);
  }, []);

  const saveAndRemember = useCallback(
    async (
      key: string,
      run: () => Promise<SaveExportFileResult>,
      onToast: NotifyToast | undefined,
      successMessage: string
    ) => {
      const result = await run();
      if (result.canceled) return;
      if (result.filePath) {
        rememberPath(key, result.filePath);
        armExcelOpenWindow(key);
      }
      onToast?.(successMessage);
    },
    [armExcelOpenWindow, rememberPath]
  );

  const openLastExport = useCallback(
    async (key: string, onToast?: NotifyToast) => {
      const filePath = paths[key];
      if (!filePath) {
        onToast?.("Aucun rapport enregistré sur ce poste. Exportez-le d’abord.", "warning");
        return;
      }
      try {
        const res = await gtsApiClient.openExportFile(filePath);
        if (!res.success) {
          forgetPath(key);
          onToast?.(res.error || "Impossible d’ouvrir le fichier.", "error");
        }
      } catch (error) {
        onToast?.(error instanceof Error ? error.message : "Impossible d’ouvrir le fichier.", "error");
      }
    },
    [forgetPath, paths]
  );

  return {
    getLastPath,
    rememberPath,
    forgetPath,
    canOpenExcelTemporarily,
    saveAndRemember,
    openLastExport
  };
}
