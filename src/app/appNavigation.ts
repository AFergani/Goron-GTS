/**
 * Navigation principale de la coque : pages sidebar, titres et droits par défaut.
 *
 * Utilisé par `AppShell` (page active, titre topbar) et `AppSidebar` (ordre des boutons).
 */

import type { PageAccess, Role } from "../types";

/** Identifiant d'écran aligné sur `PageAccess`. */
export type AppPage = keyof PageAccess;

/** Ordre d'affichage des pages dans la sidebar (Paramètres est en pied de barre). */
export const SIDEBAR_PAGE_ORDER: AppPage[] = [
  "intervention",
  "rondes",
  "gardiennage",
  "mainCourante",
  "fransor",
  "settings"
];

/** Titres de l'en-tête de contenu (hors sidebar). */
export const APP_PAGE_TITLES: Record<AppPage, string> = {
  intervention: "Interventions",
  rondes: "Rondes",
  gardiennage: "Gardiennage",
  mainCourante: "Main courante",
  fransor: "Accompagnement Fransor",
  settings: "Paramètres"
};

/** Toutes les pages ouvertes (compte DEV). */
export const DEV_FULL_PAGE_ACCESS: PageAccess = {
  mainCourante: true,
  fransor: true,
  intervention: true,
  rondes: true,
  settings: true,
  gardiennage: true
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
 * Droits de navigation effectifs : vues métier toujours ouvertes ; seul Paramètres
 * dépend de `pageAccess` (repli sur le défaut du rôle si absent). DEV = tout.
 *
 * @param role - Rôle du compte, ou absent hors session.
 * @param pageAccess - Droits persistés, ou absents (repli sur le défaut du rôle).
 */
export function resolveUserPageAccess(role: Role | undefined, pageAccess: PageAccess | undefined): PageAccess {
  if (role === "DEV") return DEV_FULL_PAGE_ACCESS;
  return {
    mainCourante: true,
    fransor: true,
    intervention: true,
    rondes: true,
    gardiennage: true,
    settings: pageAccess?.settings ?? role !== "OPERATEUR"
  };
}
