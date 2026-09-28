/**
 * Modèle du centre d’aide : identifiants de rubriques, navigation filtrée par droits.
 *
 * `buildHelpNavigation` construit la sidebar ; `resolveHelpTopicId` redirige les anciens
 * identifiants Paramètres (données, variables) vers les rubriques regroupées.
 */

/** Identifiants des rubriques du centre d'aide (navigation hiérarchique). */
export type HelpTopicId =
  | "welcome"
  | "interventions"
  | "rondes"
  | "gardiennage"
  | "main-courante"
  | "fransor"
  | "video-remarks"
  | "settings-operators"
  | "settings-data"
  | "settings-templates"
  | "settings-variables"
  | "settings-database"
  | "settings-connection"
  | "settings-audit";

export type HelpPageAccess = {
  intervention: boolean;
  rondes: boolean;
  gardiennage: boolean;
  mainCourante: boolean;
  fransor: boolean;
  videoRemarks: boolean;
  settings: boolean;
};

export type HelpAccessContext = {
  pageAccess: HelpPageAccess;
  canManageUsers: boolean;
  /** Superviseur : onglet Gestion opérateur, avec une portée bornée par la hiérarchie. */
  canAccessOperatorsTab?: boolean;
  /** Session connectée : onglets données / modèles et variables / base */
  canManageData: boolean;
  /**
   * Hors session (base injoignable) : la sidebar affiche toutes les rubriques,
   * mais seule « Connexion PostgreSQL » reste sélectionnable.
   */
  connectionOnly?: boolean;
};

export type HelpNavItem = {
  id: HelpTopicId;
  label: string;
  emoji: string;
};

/** Catalogue complet des rubriques (ordre de la sidebar du centre d'aide). */
export const HELP_NAV_CATALOG: HelpNavItem[] = [
  { id: "settings-connection", label: "Connexion PostgreSQL", emoji: "🔌" },
  { id: "welcome", label: "Navigation", emoji: "🧭" },
  { id: "interventions", label: "Interventions", emoji: "📋" },
  { id: "rondes", label: "Rondes", emoji: "🔄" },
  { id: "gardiennage", label: "Gardiennage", emoji: "🛡️" },
  { id: "main-courante", label: "Main courante", emoji: "📒" },
  { id: "fransor", label: "Fransor", emoji: "📅" },
  { id: "video-remarks", label: "Remarques vidéo", emoji: "🎬" },
  { id: "settings-operators", label: "Gestion opérateur", emoji: "👤" },
  { id: "settings-data", label: "Gestion des données", emoji: "🗂️" },
  { id: "settings-templates", label: "Modèles et variables", emoji: "📄" },
  { id: "settings-database", label: "Gestion base de données", emoji: "💾" },
  { id: "settings-audit", label: "Journal des actions", emoji: "📜" }
];

/** Rubrique unique consultable lorsque PostgreSQL est injoignable. */
export const OFFLINE_CONNECTION_HELP_TOPIC_ID: HelpTopicId = "settings-connection";

/** Anciennes rubriques données fusionnées dans settings-data (liens profonds éventuels). */
const LEGACY_SETTINGS_DATA_TOPIC_IDS = new Set<string>([
  "settings-data-sites",
  "settings-data-intervenants",
  "settings-data-anomaly-types",
  "settings-data-holidays",
  "settings-data-ronde-motifs",
  "settings-data-fransor",
  "settings-data-pending-sites",
  "settings-data-pending-intervenants",
  "settings-overview"
]);

/** Réoriente une rubrique obsolète vers la page regroupée Gestion des données. */
export function resolveHelpTopicId(requested: HelpTopicId | string | null | undefined): HelpTopicId | null {
  if (!requested) return null;
  if (LEGACY_SETTINGS_DATA_TOPIC_IDS.has(requested)) return "settings-data";
  if (requested === "settings-variables") return "settings-templates";
  return requested as HelpTopicId;
}

/**
 * Construit la sidebar du centre d'aide selon les droits, ou le catalogue complet
 * (rubriques métier grisées) lorsque `connectionOnly` est actif.
 *
 * @param ctx - Droits du profil, éventuellement hors session.
 * @returns Rubriques à afficher dans la navigation.
 */
export function buildHelpNavigation(ctx: HelpAccessContext): HelpNavItem[] {
  if (ctx.connectionOnly) {
    return HELP_NAV_CATALOG;
  }
  return HELP_NAV_CATALOG.filter((item) => isHelpNavItemVisible(item.id, ctx));
}

/**
 * Visibilité d'une rubrique dans la sidebar (hors mode connexion seule).
 *
 * @param id - Identifiant de rubrique.
 * @param ctx - Droits du profil.
 * @returns Vrai si la rubrique doit apparaître.
 */
function isHelpNavItemVisible(id: HelpTopicId, ctx: HelpAccessContext): boolean {
  switch (id) {
    case "settings-connection":
      return Boolean(ctx.pageAccess.settings && ctx.canManageUsers);
    case "welcome":
      return true;
    case "interventions":
      return Boolean(ctx.pageAccess.intervention);
    case "rondes":
      return Boolean(ctx.pageAccess.rondes);
    case "gardiennage":
      return Boolean(ctx.pageAccess.gardiennage);
    case "main-courante":
      return Boolean(ctx.pageAccess.mainCourante);
    case "fransor":
      return Boolean(ctx.pageAccess.fransor);
    case "video-remarks":
      return Boolean(ctx.pageAccess.videoRemarks);
    case "settings-operators":
      return Boolean(ctx.pageAccess.settings && (ctx.canManageUsers || ctx.canAccessOperatorsTab));
    case "settings-data":
    case "settings-templates":
      return Boolean(ctx.pageAccess.settings && ctx.canManageData);
    case "settings-database":
    case "settings-audit":
      return Boolean(ctx.pageAccess.settings && ctx.canManageUsers);
    default:
      return false;
  }
}
