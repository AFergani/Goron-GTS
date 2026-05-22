/**
 * Recherche et libellé site pour la main courante (et modules qui réutilisent le composant).
 *
 * Format catalogue : « Nom (CODE) ». Filtre autocomplete dès 3 caractères (code ou nom).
 */

import type { SiteRef } from "../../../types";

/** Libellé après choix dans le formulaire et dans le journal : « Nom du site (Code) » */
export function formatSiteSelectedLabel(site: SiteRef) {
  const name = String(site.name || "").trim();
  const code = String(site.code || "").trim();
  const label = name || code;
  return `${label} (${code})`;
}

export function filterSitesByCodeOrName(sites: SiteRef[], query: string, limit = 50): SiteRef[] {
  const t = query.trim().toLowerCase();
  if (t.length < 3) return [];
  return sites
    .filter((s) => {
      const code = s.code.toLowerCase();
      const name = s.name.toLowerCase();
      return code.includes(t) || name.includes(t);
    })
    .slice(0, limit);
}
