/**
 * Libellés FR des dumps PostgreSQL (tableau, filtres, logs techniques).
 * Aligné sur les jetons de fichier `journaliere` / `mensuelle` / `manuelle`.
 */

import { formatDateTimeFr } from "../../common/utils/formatDateShortFr";

/**
 * Libellé affiché pour un type de dump.
 *
 * @param kind - Type interne (`daily`, `monthly`, `manual`, autre = personnalisé).
 */
export function backupKindLabel(kind: string): string {
  if (kind === "daily") return "Journalière";
  if (kind === "monthly") return "Mensuelle";
  if (kind === "manual") return "Manuelle";
  return "Manuelle (personnalisé)";
}

/** Options du filtre Type (liste des sauvegardes). */
export const BACKUP_KIND_FILTERS = [
  { value: "", label: "Tous" },
  { value: "daily", label: backupKindLabel("daily") },
  { value: "monthly", label: backupKindLabel("monthly") },
  { value: "manual", label: backupKindLabel("manual") },
  { value: "custom", label: backupKindLabel("custom") }
] as const;

/**
 * Date/heure d'un dump pour le tableau (JJ/MM/AAAA à HH h mm).
 *
 * @param iso - Horodatage ISO, ou null.
 */
export function formatBackupWhen(iso: string | null): string {
  const formatted = formatDateTimeFr(iso);
  if (!formatted) return iso || "jamais";
  const withTime = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})$/.exec(formatted);
  if (!withTime) return formatted;
  return `${withTime[1]} à ${withTime[2]} h ${withTime[3]}`;
}
