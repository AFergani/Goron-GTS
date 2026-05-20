import type { RondeEntry } from "../model/ronde.types";

function isExceptional(e: RondeEntry): boolean {
  return e.source === "URGENCE" || e.source === "LIEE_INTERVENTION";
}

/**
 * Retourne les rondes exceptionnelles rattachées à la même « demande » qu’une fiche donnée :
 * soit par `requestBatchId`, soit (héritage) par même instantané JSON + même site.
 */
export function getExceptionalDemandGroup(entry: RondeEntry, all: RondeEntry[]): RondeEntry[] {
  if (!isExceptional(entry)) {
    return [entry];
  }
  const exceptional = all.filter(isExceptional);

  if (entry.requestBatchId) {
    const group = exceptional.filter((e) => e.requestBatchId === entry.requestBatchId);
    return group.length ? group : [entry];
  }

  const raw = entry.requestPlanningSnapshotJson;
  if (raw && entry.siteId) {
    const group = exceptional.filter(
      (e) => e.siteId === entry.siteId && e.requestPlanningSnapshotJson && e.requestPlanningSnapshotJson === raw
    );
    if (group.length > 1) return group.sort((a, b) => a.requestDate.localeCompare(b.requestDate));
  }

  return [entry];
}
