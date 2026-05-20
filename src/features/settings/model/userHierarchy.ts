import type { Session } from "../../../app/session/SessionProvider";
import type { User } from "../../../types";

/** Rang métier pour réinitialisation MDP / déverrouillage (aligné sur authUsers.js). */
export function getTargetPasswordHierarchyRank(user: User): number {
  if (user.role === "DEV") return 4;
  if (user.role === "OPERATEUR") return 0;
  if (user.role === "RESPONSABLE") {
    const p = user.managerProfile;
    if (p === "SUPERVISEUR") return 1;
    if (p === "RESPONSABLE_STATION") return 2;
    if (p === "DIRECTEUR_STATION") return 3;
    return 1;
  }
  return -1;
}

export function getSessionPasswordRank(session: NonNullable<Session>): number {
  const u = session.user;
  if (u.role === "DEV") return 100;
  if (u.role === "OPERATEUR") return 0;
  if (u.role === "RESPONSABLE") {
    const p = u.managerProfile;
    if (p === "SUPERVISEUR") return 1;
    if (p === "RESPONSABLE_STATION") return 2;
    if (p === "DIRECTEUR_STATION") return 3;
    return 1;
  }
  return -1;
}

/** Réinitialisation MDP ou déverrouillage : strictement les comptes de rang inférieur ; jamais le compte DEV cible. */
export function canSessionResetPasswordOrUnlockForUser(session: NonNullable<Session>, target: User): boolean {
  if (target.role === "DEV") return false;
  return getSessionPasswordRank(session) > getTargetPasswordHierarchyRank(target);
}
