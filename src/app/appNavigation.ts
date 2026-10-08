/**
 * Navigation principale de la coque : pages sidebar, titres et droits par défaut.
 *
 * Utilisé par `AppShell` (page active, titre topbar) et `AppSidebar` (ordre des boutons).
 */

import type { BusinessProfile, PageAccess, Role } from "../types";

/** Identifiant d'écran aligné sur `PageAccess`. */
export type AppPage = keyof PageAccess;

/** Ordre d'affichage des pages dans la sidebar (Paramètres est en pied de barre). */
export const SIDEBAR_PAGE_ORDER: AppPage[] = [
  "intervention",
  "rondes",
  "gardiennage",
  "mainCourante",
  "fransor",
  "videoRemarks",
  "pvVideo",
  "settings"
];

/** Titres de l'en-tête de contenu (hors sidebar). */
export const APP_PAGE_TITLES: Record<AppPage, string> = {
  intervention: "Interventions",
  rondes: "Rondes",
  gardiennage: "Gardiennage",
  mainCourante: "Main courante",
  fransor: "Accompagnement Fransor",
  videoRemarks: "Remarques vidéo",
  pvVideo: "PV Vidéo",
  settings: "Paramètres"
};

/** Toutes les pages ouvertes (compte DEV). */
export const DEV_FULL_PAGE_ACCESS: PageAccess = {
  mainCourante: true,
  fransor: true,
  intervention: true,
  rondes: true,
  settings: true,
  gardiennage: true,
  videoRemarks: true,
  pvVideo: true
};

/**
 * Première page autorisée dans l'ordre sidebar (intervention → … → paramètres).
 *
 * @param pageAccess - Droits du compte connecté.
 * @returns Page à afficher ; repli main courante si aucun droit (cas anormal).
 */
export function getFirstSidebarPageAccess(pageAccess: PageAccess): AppPage {
  for (const page of SIDEBAR_PAGE_ORDER) {
    if (pageAccess[page]) return page;
  }
  return "mainCourante";
}

/**
 * Page Remarques vidéo et page PV Vidéo : Admin, les trois profils responsable, ou Opérateur +.
 *
 * @param role - Rôle du compte.
 * @param managerProfile - Profil métier (`OPERATEUR_PLUS` pour un opérateur étendu).
 */
export function canAccessVideoRemarks(
  role: Role | undefined,
  managerProfile: BusinessProfile | null | undefined
): boolean {
  if (role === "DEV" || role === "RESPONSABLE") return true;
  return role === "OPERATEUR" && managerProfile === "OPERATEUR_PLUS";
}

/**
 * Droits de navigation effectifs : vues métier toujours ouvertes ;
 * Paramètres pour tout compte non-opérateur (responsables). DEV = tout.
 * Remarques vidéo et PV Vidéo selon le rôle et le profil (pas une case d'accès page).
 *
 * @param role - Rôle du compte, ou absent hors session.
 * @param pageAccess - Conservé pour signature ; les droits sont dérivés du rôle et du profil.
 * @param managerProfile - Profil métier du compte.
 */
export function resolveUserPageAccess(
  role: Role | undefined,
  pageAccess: PageAccess | undefined,
  managerProfile?: BusinessProfile | null
): PageAccess {
  if (role === "DEV") return DEV_FULL_PAGE_ACCESS;
  void pageAccess;
  return {
    mainCourante: true,
    fransor: true,
    intervention: true,
    rondes: true,
    gardiennage: true,
    settings: role !== "OPERATEUR" && Boolean(role),
    videoRemarks: canAccessVideoRemarks(role, managerProfile),
    pvVideo: canAccessVideoRemarks(role, managerProfile)
  };
}
