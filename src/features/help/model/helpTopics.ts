/** Identifiants des rubriques du centre d'aide (navigation hiérarchique). */
export type HelpTopicId =
  | "welcome"
  | "interventions"
  | "rondes"
  | "gardiennage"
  | "main-courante"
  | "fransor"
  | "settings-overview"
  | "settings-operators"
  | "settings-data"
  | "settings-data-sites"
  | "settings-data-intervenants"
  | "settings-data-anomaly-types"
  | "settings-data-holidays"
  | "settings-data-ronde-motifs"
  | "settings-data-fransor"
  | "settings-data-pending-sites"
  | "settings-data-pending-intervenants"
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
  /** 0 = page principale, 1 = sous-page Paramètres, 2 = sous-onglet (ex. Gestion des données) */
  depth: 0 | 1 | 2;
  emoji: string;
};

/** Sous-rubriques affichées sous « Gestion des données » (niveau 3 dans l’aide). */
export const SETTINGS_DATA_SECTION_CHILD_IDS: HelpTopicId[] = [
  "settings-data-sites",
  "settings-data-intervenants",
  "settings-data-anomaly-types",
  "settings-data-holidays",
  "settings-data-ronde-motifs",
  "settings-data-fransor",
  "settings-data-pending-sites",
  "settings-data-pending-intervenants"
];

function findDepth1ParentAbove(items: HelpNavItem[], index: number): HelpTopicId | null {
  for (let i = index - 1; i >= 0; i--) {
    if (items[i].depth === 1) return items[i].id;
    if (items[i].depth === 0) return null;
  }
  return null;
}

/** Filtre les entrées de profondeur 2 masquées lorsque le parent replié est « settings-data ». */
export function filterNavItemsForCollapsedParents(
  items: HelpNavItem[],
  expandedParents: Partial<Record<HelpTopicId, boolean>>
): HelpNavItem[] {
  return items.filter((item, index) => {
    if (item.depth !== 2) return true;
    const parent = findDepth1ParentAbove(items, index);
    if (parent !== "settings-data") return true;
    return expandedParents["settings-data"] === true;
  });
}

export function buildHelpNavigation(ctx: HelpAccessContext): HelpNavItem[] {
  const items: HelpNavItem[] = [
    { id: "welcome", label: "Accueil", depth: 0, emoji: "🏠" }
  ];

  if (ctx.pageAccess.intervention) {
    items.push({ id: "interventions", label: "Interventions", depth: 0, emoji: "📋" });
  }
  if (ctx.pageAccess.rondes) {
    items.push({ id: "rondes", label: "Rondes", depth: 0, emoji: "🔄" });
  }
  if (ctx.pageAccess.gardiennage) {
    items.push({ id: "gardiennage", label: "Gardiennage", depth: 0, emoji: "🛡️" });
  }
  if (ctx.pageAccess.mainCourante) {
    items.push({ id: "main-courante", label: "Main courante", depth: 0, emoji: "📒" });
  }
  if (ctx.pageAccess.fransor) {
    items.push({ id: "fransor", label: "Fransor", depth: 0, emoji: "📅" });
  }

  if (ctx.pageAccess.settings) {
    items.push({ id: "settings-overview", label: "Paramètres (vue d'ensemble)", depth: 0, emoji: "⚙️" });

    if (ctx.canManageUsers || ctx.canAccessOperatorsTab) {
      items.push({ id: "settings-operators", label: "Gestion opérateur", depth: 1, emoji: "👤" });
    }

    if (ctx.canManageData) {
      items.push({ id: "settings-data", label: "Gestion des données", depth: 1, emoji: "🗂️" });
      items.push({ id: "settings-data-sites", label: "Sites", depth: 2, emoji: "📍" });
      items.push({ id: "settings-data-intervenants", label: "Intervenants", depth: 2, emoji: "🏢" });
      items.push({ id: "settings-data-anomaly-types", label: "Types d'anomalie", depth: 2, emoji: "🏷️" });
      items.push({ id: "settings-data-holidays", label: "Jours fériés", depth: 2, emoji: "🎗️" });
      items.push({ id: "settings-data-ronde-motifs", label: "Motifs ronde", depth: 2, emoji: "🔖" });
      items.push({ id: "settings-data-fransor", label: "Fransor (référentiel)", depth: 2, emoji: "📌" });
      items.push({ id: "settings-data-pending-sites", label: "Sites soumis", depth: 2, emoji: "⏳" });
      items.push({ id: "settings-data-pending-intervenants", label: "Intervenants soumis", depth: 2, emoji: "⏳" });
      items.push({ id: "settings-templates", label: "Gestion modèles", depth: 1, emoji: "📄" });
      items.push({ id: "settings-variables", label: "Gestion variables", depth: 1, emoji: "🔧" });
      items.push({ id: "settings-database", label: "Gestion base de données", depth: 1, emoji: "💾" });
    }

    if (ctx.canManageUsers) {
      items.push({ id: "settings-audit", label: "Journal des actions", depth: 1, emoji: "📜" });
    }
  }

  return items;
}
