/**
 * Modèle du centre d’aide : identifiants de rubriques, navigation filtrée par droits.
 *
 * `buildHelpNavigation` construit la sidebar ; `resolveHelpTopicId` redirige les anciens
 * identifiants Paramètres vers `settings-data`.
 */

/** Identifiants des rubriques du centre d'aide (navigation hiérarchique). */
export type HelpTopicId =
  | "welcome"
  | "interventions"
  | "rondes"
  | "gardiennage"
  | "main-courante"
  | "fransor"
  | "settings-operators"
  | "settings-data"
  | "settings-templates"
  | "settings-variables"
  | "settings-database"
  | "settings-audit";

export type HelpPageAccess = {
  intervention: boolean;
  rondes: boolean;
  gardiennage: boolean;
  mainCourante: boolean;
  fransor: boolean;
  settings: boolean;
};

export type HelpAccessContext = {
  pageAccess: HelpPageAccess;
  canManageUsers: boolean;
  /** Superviseur : onglet Gestion opérateur (réinit. MDP) sans droits complets. */
  canAccessOperatorsTab?: boolean;
  /** Session connectée : onglets données / modèles / variables / base */
  canManageData: boolean;
};

export type HelpNavItem = {
  id: HelpTopicId;
  label: string;
  emoji: string;
};

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
  return requested as HelpTopicId;
}

export function buildHelpNavigation(ctx: HelpAccessContext): HelpNavItem[] {
  const items: HelpNavItem[] = [{ id: "welcome", label: "Sidebar et accessibilité", emoji: "🧭" }];

  if (ctx.pageAccess.intervention) {
    items.push({ id: "interventions", label: "Interventions", emoji: "📋" });
  }
  if (ctx.pageAccess.rondes) {
    items.push({ id: "rondes", label: "Rondes", emoji: "🔄" });
  }
  if (ctx.pageAccess.gardiennage) {
    items.push({ id: "gardiennage", label: "Gardiennage", emoji: "🛡️" });
  }
  if (ctx.pageAccess.mainCourante) {
    items.push({ id: "main-courante", label: "Main courante", emoji: "📒" });
  }
  if (ctx.pageAccess.fransor) {
    items.push({ id: "fransor", label: "Fransor", emoji: "📅" });
  }

  if (ctx.pageAccess.settings) {
    if (ctx.canManageUsers || ctx.canAccessOperatorsTab) {
      items.push({ id: "settings-operators", label: "Gestion opérateur", emoji: "👤" });
    }

    if (ctx.canManageData) {
      items.push({ id: "settings-data", label: "Gestion des données", emoji: "🗂️" });
      items.push({ id: "settings-templates", label: "Gestion modèles", emoji: "📄" });
      items.push({ id: "settings-variables", label: "Gestion variables", emoji: "🔧" });
      items.push({ id: "settings-database", label: "Gestion base de données", emoji: "💾" });
    }

    if (ctx.canManageUsers) {
      items.push({ id: "settings-audit", label: "Journal des actions", emoji: "📜" });
    }
  }

  return items;
}
