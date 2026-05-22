import type { HelpAccessContext, HelpPageAccess, HelpTopicId } from "./helpTopics";

/** Accès aux onglets Gestion des données, modèles, variables, base (aligné sur l'UI Paramètres). */
export function canAccessSettingsDataHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.pageAccess.settings && access?.canManageData);
}

export function canAccessOperatorsHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.canManageUsers || access?.canAccessOperatorsTab);
}

export function canAccessAuditHelp(access?: HelpAccessContext): boolean {
  return Boolean(access?.canManageUsers);
}

function canAccessPageHelp(access: HelpAccessContext | undefined, page: keyof HelpPageAccess): boolean {
  return Boolean(access?.pageAccess[page]);
}

/** Vérifie si la rubrique d'aide est autorisée pour le profil connecté. */
export function isHelpTopicAllowed(topicId: HelpTopicId, access?: HelpAccessContext): boolean {
  if (!access) return topicId === "welcome";
  switch (topicId) {
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
    case "settings-operators":
      return canAccessOperatorsHelp(access);
    case "settings-data":
    case "settings-templates":
    case "settings-variables":
    case "settings-database":
      return canAccessSettingsDataHelp(access);
    case "settings-audit":
      return canAccessAuditHelp(access);
    default:
      return false;
  }
}
