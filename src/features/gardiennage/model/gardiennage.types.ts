/**
 * Types métier gardiennage (planification, entrées, payloads API).
 *
 * Snapshot de planification versionné (`GardiennagePlanningSnapshotV1`) : lignes horaires,
 * récurrence, mode continu H24. Statuts PLANIFIE → ACTIF → CLOTURE / ANNULE.
 * `syncState: PENDING_QUEUE` si écriture différée (writer indisponible).
 */

export type GardiennageStatus = "PLANIFIE" | "ACTIF" | "CLOTURE" | "ANNULE";

/** Compte rendu posé par la clôture automatique (horaire de fin dépassé). */
export const GARDIENNAGE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";

export function isGardiennageAutoClosureReport(report: string): boolean {
  return String(report || "").trim() === GARDIENNAGE_AUTO_CLOSURE_REPORT;
}

/** Ligne de planning (créneau, masque semaine, fériés / veilles). */
export type GardiennagePlanningLineV1 = {
  id: string;
  label: string;
  anchorDate?: string;
  startTime: string;
  endTime: string;
  weekdaysMask: number;
  includeHolidays: boolean;
  includeHolidayEves: boolean;
};

/** Planification envoyée au moteur de génération et au backend. */
export type GardiennagePlanningSnapshotV1 = {
  version: 1;
  validFromDate: string;
  validFromTime: string;
  validToDate: string;
  validToTime: string;
  isContinuous: boolean;
  lines: GardiennagePlanningLineV1[];
};

/** Entrée liste / modale (libellés site et prestataire, pas d’UUID en UI export utilisateur). */
export type GardiennageEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  siteId: string | null;
  siteDisplay: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  recurrenceStartDate: string;
  /** Vide = jusqu'à nouvel ordre */
  recurrenceEndDate: string;
  isPonctuel: boolean;
  intervenantId: string | null;
  intervenantName: string;
  notes: string;
  status: GardiennageStatus;
  linkedInterventionId: string | null;
  /** Ronde liée à ce gardiennage (optionnel) */
  linkedRondeId: string | null;
  /** Compte rendu de clôture */
  closureReport: string;
  actualStartTime: string;
  actualEndTime: string;
  /** Numéro de bon de travail (saisi à la clôture) */
  workOrderNumber: string;
  /** Motif d'annulation (obligatoire si ANNULE) */
  cancellationReason: string;
  planningBatchId?: string | null;
  planningSnapshot?: GardiennagePlanningSnapshotV1 | null;
  planningSlotStart?: string;
  planningSlotEnd?: string;
  syncState?: "PENDING_QUEUE";
};

/** Création / mise à jour (planification optionnelle pour lots générés). */
export type GardiennageSavePayload = {
  siteId: string | null;
  siteDisplay: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  isPonctuel: boolean;
  intervenantId: string | null;
  intervenantName: string;
  notes: string;
  linkedInterventionId: string | null;
  linkedRondeId: string | null;
  planningSnapshot?: GardiennagePlanningSnapshotV1 | null;
};

/** Clôture manuelle (horaires effectifs, bon, CR ; `closeDate` pour une occurrence de série). */
export type GardiennageClosePayload = {
  closureReport: string;
  actualStartTime: string;
  actualEndTime: string;
  /** Numéro de bon (optionnel) */
  workOrderNumber: string;
  /** Date du jour clôturé (AAAA-MM-JJ) pour les séries planifiées. */
  closeDate?: string;
};
