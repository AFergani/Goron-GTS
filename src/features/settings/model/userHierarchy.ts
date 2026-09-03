/**
 * Hiérarchie métier de la gestion des comptes (miroir de `authUsers.js`).
 *
 * Règle unique : on n'agit que sur un compte de rang inférieur ou égal au sien,
 * et on ne peut jamais attribuer un rang supérieur au sien. Le compte Admin (DEV)
 * n'est administrable par personne.
 */

import type { Session } from "../../../app/session/SessionProvider";
import type { ManagerProfile, Role, User } from "../../../types";

/** Rang métier : opérateur 0, superviseur 1, responsable de station 2, directeur 3, Admin 4. */
function computeHierarchyRank(role: Role, managerProfile?: ManagerProfile | null): number {
  if (role === "DEV") return 4;
  if (role === "OPERATEUR") return 0;
  if (role === "RESPONSABLE") {
    if (managerProfile === "RESPONSABLE_STATION") return 2;
    if (managerProfile === "DIRECTEUR_STATION") return 3;
    return 1;
  }
  return -1;
}

function getTargetHierarchyRank(user: User): number {
  return computeHierarchyRank(user.role, user.managerProfile);
}

/** L'Admin est hors échelle : il domine tous les profils station. */
function getSessionHierarchyRank(session: NonNullable<Session>): number {
  const { role, managerProfile } = session.user;
  return role === "DEV" ? 100 : computeHierarchyRank(role, managerProfile);
}

/**
 * Création de comptes, journal et réglage de l'accès Paramètres :
 * Admin, directeur de station et responsable de station (pas le superviseur).
 */
export function isSessionStationAdmin(session: Session | null): boolean {
  const role = session?.user.role;
  const managerProfile = session?.user.managerProfile;
  if (role === "DEV") return true;
  return role === "RESPONSABLE" && (managerProfile === "DIRECTEUR_STATION" || managerProfile === "RESPONSABLE_STATION");
}

export function canSessionAccessOperatorsTab(session: Session | null): boolean {
  return (
    isSessionStationAdmin(session) ||
    Boolean(session?.user.role === "RESPONSABLE" && session.user.managerProfile === "SUPERVISEUR")
  );
}

/**
 * Modification, réinitialisation, déverrouillage, désactivation, réactivation :
 * autorisés sur les comptes de rang inférieur ou égal, jamais sur le compte Admin.
 */
export function canSessionManageUser(session: NonNullable<Session>, target: User): boolean {
  if (target.role === "DEV") return false;
  const targetRank = getTargetHierarchyRank(target);
  return targetRank >= 0 && getSessionHierarchyRank(session) >= targetRank;
}

/** Anti-élévation de privilège : le rang attribué ne peut pas dépasser le sien. */
export function canSessionAssignRank(
  session: NonNullable<Session>,
  role: Role,
  managerProfile: ManagerProfile | null
): boolean {
  const nextRank = computeHierarchyRank(role, managerProfile);
  return nextRank >= 0 && nextRank <= getSessionHierarchyRank(session);
}
