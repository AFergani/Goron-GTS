/**
 * Filtre + tri partagés des listes rondes (exceptionnelle / contractuelle).
 */

import type { SiteRef } from "../../../types";
import type { RondeEntry } from "../model/ronde.types";

export type RondeListFilterOpts = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  intervenantId?: string;
  family?: string;
  search?: string;
  sites: SiteRef[];
};

export function filterAndSortRondeListEntries(
  entries: RondeEntry[],
  opts: RondeListFilterOpts
): RondeEntry[] {
  const query = String(opts.search ?? "").trim().toLowerCase();
  const effectiveDateTo = opts.dateTo || opts.dateFrom;
  const siteById = new Map(opts.sites.map((s) => [s.id, s]));
  return entries
    .filter((entry) => {
      if (opts.dateFrom && entry.requestDate < opts.dateFrom) return false;
      if (effectiveDateTo && entry.requestDate > effectiveDateTo) return false;
      if (opts.status && entry.status !== opts.status) return false;
      if (opts.intervenantId && entry.intervenantId !== opts.intervenantId) return false;
      if (opts.family) {
        const site = entry.siteId ? siteById.get(entry.siteId) : null;
        if (!site || (site.famille || "") !== opts.family) return false;
      }
      if (!query) return true;
      return (
        entry.siteDisplay.toLowerCase().includes(query) ||
        entry.intervenantName.toLowerCase().includes(query) ||
        entry.horairesDemandeObs.toLowerCase().includes(query) ||
        entry.report.toLowerCase().includes(query) ||
        entry.workOrderNumber.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const left = Date.parse(`${a.requestDate}T12:00:00`);
      const right = Date.parse(`${b.requestDate}T12:00:00`);
      return right - left;
    });
}
