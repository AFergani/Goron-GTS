/**
 * Import Excel des référentiels (sites, intervenants, types d’anomalie).
 *
 * Utilisé par `DataManagementPanel` : lecture XLS/XLSX, mapping d’en-têtes, lot séquentiel.
 */

import * as XLSX from "xlsx";
import type { DataRefreshTarget, DataTab } from "./settings.types";
import type { NotifyToast } from "../../common/model/toast.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

export type DataExcelImportHandlers = {
  onImportSiteRow: (payload: { code: string; name: string; address: string; parc: string; famille: string }) => Promise<void>;
  onImportIntervenantRow: (name: string) => Promise<void>;
  onImportTypeRow: (label: string) => Promise<void>;
  onLogImportSummary: (payload: {
    target: "sites" | "intervenants" | "types";
    fileName: string;
    total: number;
    success: number;
    failed: number;
    errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
  }) => Promise<void>;
};

export type DataExcelImportSelectionOptions = {
  handlers: DataExcelImportHandlers;
  onRefreshImportedData: (target: DataRefreshTarget) => Promise<void>;
  onNotify: NotifyToast;
  setIsImporting: (value: boolean) => void;
  setImportBatchProgress: (value: { current: number; total: number } | null) => void;
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const expected = normalizeHeader(alias);
    const matchedKey = keys.find((key) => normalizeHeader(key) === expected);
    if (!matchedKey) continue;
    const raw = row[matchedKey];
    if (raw == null) return "";
    return String(raw).trim();
  }
  return "";
}

/** Adresse complète : rue + colonne « CP/Ville » (export logiciel tiers), séparés par une virgule si les deux sont présents. */
function mergeSiteAddressFromRow(row: Record<string, unknown>): string {
  const street = getCell(row, ["adresse", "adresse site", "address", "adresse_site"]);
  const cpVille = getCell(row, ["cp/ville", "cp ville", "cp-ville", "code postal / ville", "cp et ville"]);
  if (street && cpVille) {
    return `${street}, ${cpVille}`.trim();
  }
  return street || cpVille || "";
}

const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMPORT_MAX_ROWS = 20000;
const DANGEROUS_IMPORT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INTERVENANT_IMPORT_ALIASES = [
  "name",
  "nom",
  "intervenant",
  "intervenants",
  "societe",
  "société",
  "prestataire",
  "entreprise",
  "raison sociale",
  "raison_sociale"
];

function sanitizeImportedRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    // Objet sans prototype pour éviter toute pollution du prototype chain.
    const safeRow: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) continue;
      if (DANGEROUS_IMPORT_KEYS.has(normalizedKey)) continue;
      safeRow[normalizedKey] = value;
    }
    return safeRow;
  });
}

/** Retire le bruit IPC Electron pour cause lisible (toast + Import_error.txt). */
function humanizeImportError(error: unknown): string {
  return extractUserFacingErrorMessage(error, "Erreur inconnue");
}

/**
 * Lit la première feuille d’un XLS/XLSX (en-têtes + lignes, sans formules).
 *
 * @param file - Fichier sélectionné par l’opérateur
 * @returns Lignes normalisées (clés dangereuses retirées)
 */
function parseRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      reject(new Error("Fichier trop volumineux (max 10 Mo)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          reject(new Error("Lecture du fichier impossible."));
          return;
        }
        const workbook = XLSX.read(data, { type: "array", dense: true, cellFormula: false });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
          reject(new Error("Le classeur est vide (aucune feuille). Formats pris en charge : XLS, XLSX."));
          return;
        }
        const sheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false, blankrows: false });
        if (rows.length > IMPORT_MAX_ROWS) {
          reject(new Error("Le fichier contient trop de lignes (max 20 000)."));
          return;
        }
        resolve(sanitizeImportedRows(rows));
      } catch (err) {
        reject(
          new Error(
            "Impossible de lire ce fichier. Utilisez un classeur XLS ou XLSX (première feuille = données avec ligne d'en-têtes)."
          )
        );
      }
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsArrayBuffer(file);
  });
}

export type SingleImportOutcome =
  | { ok: true; fileName: string; success: number; failed: number; total: number }
  | { ok: false; fileName: string; message: string };

/**
 * Importe un fichier vers un sous-onglet (sites / intervenants / types).
 *
 * @param file - Classeur
 * @param target - Onglet actif
 * @param handlers - Écritures backend du panneau
 */
export async function runSingleFileImport(file: File, target: DataTab, handlers: DataExcelImportHandlers): Promise<SingleImportOutcome> {
  try {
    const rows = await parseRows(file);
    if (!rows.length) {
      return { ok: false, fileName: file.name, message: "Aucune ligne détectée dans le fichier." };
    }
    let success = 0;
    let failed = 0;
    const errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        if (target === "sites") {
          const code = getCell(row, ["code site", "code", "code_site"]);
          const name = getCell(row, ["site", "nom site", "name", "nom", "site name"]);
          const address = mergeSiteAddressFromRow(row);
          const parc = getCell(row, ["parc"]);
          const famille = getCell(row, ["famille", "family"]);
          if (!code || !name) {
            throw new Error("Colonnes requises : « Code site » et « Site » (ou équivalents nom / nom site).");
          }
          await handlers.onImportSiteRow({ code, name, address, parc, famille });
        } else if (target === "intervenants") {
          const name = getCell(row, INTERVENANT_IMPORT_ALIASES);
          if (!name) {
            throw new Error(
              "Colonne requise: nom (alias acceptés: intervenant, intervenants, société, prestataire, entreprise)."
            );
          }
          await handlers.onImportIntervenantRow(name);
        } else if (target === "types") {
          const label = getCell(row, ["label", "libelle", "type", "type anomalie"]);
          if (!label) {
            throw new Error("Colonne requise: libelle.");
          }
          await handlers.onImportTypeRow(label);
        } else {
          throw new Error("Import non disponible pour ce sous-onglet.");
        }
        success += 1;
      } catch (error) {
        failed += 1;
        errorEntries.push({
          rowIndex: index + 1,
          message: humanizeImportError(error),
          row
        });
      }
    }

    await handlers.onLogImportSummary({
      target: target as "sites" | "intervenants" | "types",
      fileName: file.name,
      total: rows.length,
      success,
      failed,
      errorEntries
    });
    return { ok: true, fileName: file.name, success, failed, total: rows.length };
  } catch (error) {
    return {
      ok: false,
      fileName: file.name,
      message: humanizeImportError(error)
    };
  }
};

/**
 * Traite une sélection multi-fichiers (séquentiel) puis rafraîchit le référentiel.
 *
 * @param files - Fichiers choisis
 * @param target - Onglet actif
 * @param options - Handlers d’écriture, toasts et indicateurs de progression
 */
export async function handleDataExcelImportSelection(files: FileList | null, target: DataTab, options: DataExcelImportSelectionOptions): Promise<void> {
  const { handlers } = options;
  if (!files?.length) {
    return;
  }
  const list = Array.from(files);
  options.setIsImporting(true);
  let successRows = 0;
  let failedRows = 0;
  let filesFailed = 0;
  try {
    for (let i = 0; i < list.length; i += 1) {
      options.setImportBatchProgress({ current: i + 1, total: list.length });
      const result = await runSingleFileImport(list[i], target, handlers);
      if (result.ok) {
        successRows += result.success;
        failedRows += result.failed;
      } else {
        filesFailed += 1;
      }
    }
    await options.onRefreshImportedData(target);
    const errorCount = failedRows + filesFailed;
    const filePart = list.length > 1 ? ` (${list.length} fichiers)` : "";
    const summary = `Import terminé${filePart} — ${successRows} succès, ${errorCount} erreur${errorCount > 1 ? "s" : ""}.`;
    const variant = errorCount === 0 ? "success" : successRows > 0 ? "warning" : "error";
    options.onNotify(summary, variant);
  } finally {
    options.setIsImporting(false);
    options.setImportBatchProgress(null);
  }
};

