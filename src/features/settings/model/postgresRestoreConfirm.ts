/**
 * Confirmation destructive d’une restauration PostgreSQL (mot de passe + mot à saisir).
 *
 * Doit rester aligné avec `RESTORE_CONFIRM_PHRASE` dans `electron/main/postgresBackupService.js`.
 */

/** Mot que l’opérateur doit retaper pour confirmer la restauration. */
export const RESTORE_CONFIRM_PHRASE = "RESTAURER";

/**
 * @param value - Saisie utilisateur
 * @returns `true` si la saisie correspond au mot attendu
 */
export function isRestoreConfirmPhraseValid(value: string): boolean {
  return String(value || "").trim().toLocaleUpperCase("fr-FR") === RESTORE_CONFIRM_PHRASE;
}
