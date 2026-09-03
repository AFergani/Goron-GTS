/**
 * Motif d'audit : toute action sensible sur un compte doit être justifiée.
 * Miroir de `MIN_AUDIT_REASON_LENGTH` dans `electron/store/domains/users/authUsers.js`.
 */

export const MIN_AUDIT_REASON_LENGTH = 5;

/** Indique si un motif saisi satisfait la longueur minimale exigée côté serveur. */
export function isAuditReasonValid(reason: string): boolean {
  return reason.trim().length >= MIN_AUDIT_REASON_LENGTH;
}
