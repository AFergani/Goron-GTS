/**
 * Libellés d’affichage des logs techniques (tableau Paramètres + export Excel).
 * Aucun code technique (`PG_LAB_*`, `DATA_SITE_EXISTS`, etc.) n’est exposé à l’utilisateur.
 */

import { backupKindLabel } from "./postgresBackupDisplay";
import type { TechErrorLog } from "../../../infrastructure/api/gtsApiClient";

/**
 * Famille affichée en badge (colonne alignée sur « Famille » du journal métier).
 *
 * @param code - Code technique (`PG_LAB_*`, etc.).
 * @param source - Canal / source (`system:postgresLab`, …).
 * @returns Libellé métier (PostgreSQL, Auth, Données, Système).
 */
export function resolveTechFamily(code: string, source: string): string {
  const c = String(code || "").toUpperCase();
  const s = String(source || "").toLowerCase();
  if (
    c.startsWith("PG_LAB_") ||
    c.startsWith("PG_BACKUP_") ||
    c.startsWith("AUDIT_PG_") ||
    c.startsWith("REF_PG_") ||
    s.includes("postgres") ||
    s.includes("pg-backup")
  )
    return "PostgreSQL";
  if (s.startsWith("auth:") || c.startsWith("AUTH_")) return "Auth";
  if (s.startsWith("data:") || c.startsWith("DATA_")) return "Données";
  return "Système";
}

/**
 * Ton visuel du badge famille.
 *
 * @param family - Libellé renvoyé par `resolveTechFamily`.
 */
export function techFamilyBadgeTone(family: string): string {
  const normalized = family.trim().toLowerCase();
  if (normalized === "postgresql") return "postgres";
  if (normalized === "auth") return "users";
  if (normalized === "données" || normalized === "donnees") return "data";
  return "system";
}

/**
 * Ton du statut : reconnexion = ok, perte / sync KO = erreur, reste = info.
 * Les codes `*_FALLBACK` / `*_CATCHUP_OK` ne sont plus émis (historique dual-write).
 *
 * @param code - Code technique de la ligne.
 */
export function getTechStatusTone(code: string): "ok" | "error" | "warn" {
  const c = String(code || "").toUpperCase();
  if (
    c === "PG_LAB_CONNECTION_RESTORED" ||
    c === "AUDIT_PG_CATCHUP_OK" ||
    c === "REF_PG_CATCHUP_OK" ||
    c === "PG_BACKUP_AUTO_OK" ||
    c === "PG_BACKUP_MANUAL_OK" ||
    c === "PG_BACKUP_RESTORE_OK" ||
    c === "PG_BACKUP_COMPARE_OK"
  )
    return "ok";
  if (
    c === "PG_LAB_CONNECTION_LOST" ||
    c === "PG_LAB_UNREACHABLE" ||
    c === "AUDIT_PG_COPY_FAILED" ||
    c === "REF_PG_COPY_FAILED" ||
    c === "PG_UNAVAILABLE" ||
    c === "PG_BACKUP_FAILED" ||
    c === "PG_BACKUP_RESTORE_FAILED" ||
    c === "PG_BACKUP_COMPARE_FAILED"
  )
    return "error";
  if (c === "AUDIT_PG_WRITE_FALLBACK" || c === "REF_PG_WRITE_FALLBACK") return "warn";
  return "warn";
}

/**
 * Libellé français du statut technique.
 *
 * @param tone - Ton calculé par `getTechStatusTone`.
 */
export function formatTechStatusLabel(tone: "ok" | "error" | "warn"): string {
  if (tone === "ok") return "Succès";
  if (tone === "error") return "Incident";
  return "Info";
}

/**
 * Détails utiles (hôte, base, erreur) pour infobulle et export, sans identifiants internes.
 *
 * @param details - Objet `details` de la ligne, ou `null`.
 * @returns Texte multi-lignes, ou `undefined` si rien à afficher.
 */
export function formatTechDetailsText(details: Record<string, unknown> | null): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const host = details.host != null ? String(details.host) : "";
  const port = details.port != null ? String(details.port) : "";
  const database = details.database != null ? String(details.database) : "";
  const err = details.error != null ? String(details.error) : "";
  const reason = details.reason != null ? String(details.reason) : "";
  const copied = details.copied != null ? String(details.copied) : "";
  const originLabel = details.originLabel != null ? String(details.originLabel) : "";
  const destinationLabel = details.destinationLabel != null ? String(details.destinationLabel) : "";
  const kindRaw = details.kind != null ? String(details.kind) : "";
  const kindLabel = kindRaw ? backupKindLabel(kindRaw) : "";
  const fileName = details.fileName != null ? String(details.fileName) : "";
  const monthlyFileName = details.monthlyFileName != null ? String(details.monthlyFileName) : "";
  const actorLabel = details.actorLabel != null ? String(details.actorLabel) : "";
  const lost = details.lost != null ? String(details.lost) : "";
  const recovered = details.recovered != null ? String(details.recovered) : "";
  const changed = details.changed != null ? String(details.changed) : "";
  const lines = [
    host || port ? `Hôte: ${host}${port ? `:${port}` : ""}` : "",
    database ? `Base: ${database}` : "",
    kindLabel ? `Type: ${kindLabel}` : "",
    fileName ? `Fichier: ${fileName}` : "",
    monthlyFileName ? `Copie mensuelle: ${monthlyFileName}` : "",
    actorLabel ? `Acteur: ${actorLabel}` : "",
    err ? `Erreur: ${err}` : "",
    reason ? `Erreur: ${reason}` : "",
    copied ? `Lignes rattrapées: ${copied}` : "",
    originLabel ? `Origine: ${originLabel}` : "",
    destinationLabel ? `Destination: ${destinationLabel}` : "",
    lost ? `Fiches qui disparaîtraient: ${lost}` : "",
    recovered ? `Fiches qui reviendraient: ${recovered}` : "",
    changed ? `Fiches écrasées: ${changed}` : ""
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : undefined;
}

/**
 * Texte événement sans code technique (ex. `DATA_SITE_EXISTS`).
 * Affiche le message métier français ; le libellé court sert seulement de repli.
 *
 * @param log - Ligne log technique.
 */
export function formatTechEventText(log: Pick<TechErrorLog, "messageFr" | "codeLabel">): string {
  const message = String(log.messageFr || "").trim();
  if (message) return message;
  const label = String(log.codeLabel || "").trim();
  return label || "Événement technique";
}
