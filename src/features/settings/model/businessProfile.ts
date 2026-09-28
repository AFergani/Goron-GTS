/**
 * Libellés et valeur enregistrée du profil métier (responsable ou Opérateur +).
 *
 * Utilisé par la modale utilisateur, la liste des comptes et le journal d'audit.
 */

import type { BusinessProfile, ManagerProfile, Role } from "../../../types";

const MANAGER_PROFILE_LABELS: Record<ManagerProfile, string> = {
  SUPERVISEUR: "Superviseur",
  RESPONSABLE_STATION: "Responsable de station",
  DIRECTEUR_STATION: "Directeur de station"
};

/**
 * Libellé français d'un code de profil, quel que soit le rôle.
 *
 * @param profile - Code stocké, ou vide.
 * @returns Libellé, ou « - » si aucun profil.
 */
export function formatBusinessProfileCode(profile: string | null | undefined): string {
  if (profile === "OPERATEUR_PLUS") return "Opérateur +";
  if (profile === "SUPERVISEUR" || profile === "RESPONSABLE_STATION" || profile === "DIRECTEUR_STATION") {
    return MANAGER_PROFILE_LABELS[profile];
  }
  return "-";
}

/**
 * Profil affiché entre parenthèses à côté du rôle. Vide pour un opérateur standard.
 *
 * @param role - Rôle technique.
 * @param profile - Profil métier du compte.
 */
export function formatRoleProfileLabel(role: Role, profile: BusinessProfile | null | undefined): string | null {
  if (role === "OPERATEUR") return profile === "OPERATEUR_PLUS" ? "Opérateur +" : null;
  if (role !== "RESPONSABLE" || !profile || profile === "OPERATEUR_PLUS") return null;
  return MANAGER_PROFILE_LABELS[profile];
}

/**
 * Valeur envoyée à l'API : profil station, Opérateur +, ou null pour un opérateur standard.
 *
 * @param role - Rôle choisi dans le formulaire.
 * @param profile - Valeur du sélecteur (vide = opérateur standard).
 */
export function businessProfileForSave(
  role: Exclude<Role, "DEV">,
  profile: BusinessProfile | ""
): BusinessProfile | null {
  if (role === "RESPONSABLE") {
    return profile === "OPERATEUR_PLUS" || profile === "" ? "SUPERVISEUR" : profile;
  }
  return profile === "OPERATEUR_PLUS" ? "OPERATEUR_PLUS" : null;
}
