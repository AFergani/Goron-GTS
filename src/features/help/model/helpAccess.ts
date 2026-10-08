/**
 * Contrôle d’accès aux rubriques du centre d’aide selon le profil connecté.
 *
 * Aligné sur les permissions pages (`pageAccess`) et les droits Paramètres
 * (opérateurs, données, audit). Utilisé par `HelpCenterModal` et `renderHelpTopicBody`.
 */

import {
  OFFLINE_CONNECTION_HELP_TOPIC_ID,
  type HelpAccessContext,
  type HelpPageAccess,
  type HelpTopicId
} from "./helpTopics";

/** Contexte d'aide hors session : seule la rubrique connexion PostgreSQL est consultable. */
export const OFFLINE_CONNECTION_HELP_ACCESS: HelpAccessContext = {
  pageAccess: {
    intervention: false,
    rondes: false,
    gardiennage: false,
    mainCourante: false,
    fransor: false,
    videoRemarks: false,
    pvVideo: false,
    settings: false
  },
  canManageUsers: false,
  canManageData: false,
  connectionOnly: true
};

/** Accès aux onglets Gestion des données / modèles et variables. */
export function canAccessSettingsDataHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.pageAccess.settings && access?.canManageData);
}

export function canAccessOperatorsHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.canManageUsers || access?.canAccessOperatorsTab);
}

export function canAccessAuditHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.canManageUsers);
}

/** Accès aide Base de données : directeur / responsable de station / Admin. */
export function canAccessDatabaseHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.pageAccess.settings && access?.canManageUsers);
}

function canAccessPageHelp(access: HelpAccessContext | undefined, page: keyof HelpPageAccess): boolean {
  return Boolean(access?.pageAccess[page]);
}

/** Vérifie si la rubrique d'aide est autorisée pour le profil connecté. */
export function isHelpTopicAllowed(topicId: HelpTopicId, access?: HelpAccessContext): boolean {
  if (access?.connectionOnly) {
    return topicId === OFFLINE_CONNECTION_HELP_TOPIC_ID || topicId === "about";
  }
  if (!access) return topicId === "welcome" || topicId === "about";
  switch (topicId) {
    case "about":
    case "welcome":
      return true;
    case "interventions":
      return canAccessPageHelp(access, "intervention");
    case "rondes":
      return canAccessPageHelp(access, "rondes");
    case "gardiennage":
      return canAccessPageHelp(access, "gardiennage");
    case "main-courante":
      return canAccessPageHelp(access, "mainCourante");
    case "fransor":
      return canAccessPageHelp(access, "fransor");
    case "video-remarks":
      return canAccessPageHelp(access, "videoRemarks");
    case "pv-video":
      return canAccessPageHelp(access, "pvVideo");
    case "settings-operators":
      return canAccessOperatorsHelp(access);
    case "settings-data":
    case "settings-templates":
    case "settings-variables":
      return canAccessSettingsDataHelp(access);
    case "settings-database":
    case "settings-connection":
      return canAccessDatabaseHelp(access);
    case "settings-audit":
      return canAccessAuditHelp(access);
    default:
      return false;
  }
}
