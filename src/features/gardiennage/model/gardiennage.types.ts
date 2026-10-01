/**
 * Types métier gardiennage (planification, entrées, payloads API).
 *
 * Snapshot de planification versionné (`GardiennagePlanningSnapshotV1`) : lignes horaires,
 * récurrence, mode continu H24. Statuts PLANIFIE → ACTIF → CLOTURE / ANNULE.
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
  /** Date de fin saisie par l'utilisateur, avant extension pour créneaux nocturnes. */
  userValidToDate?: string;
  isContinuous: boolean;
  /** H24 sans date de fin : prestation jusqu'à nouvel ordre (horizon glissant prolongé par le backend). */
  isOpenEnded?: boolean;
  /** Date/heure d'émission de la demande (hors moteur de créneaux). */
  requestDate?: string;
  requestTime?: string;
  /** Nom du client demandeur. Vide = demande télésurveillance. */
  clientName?: string;
  /** Journal horodaté (consigne, client, planification, annulation). */
  activityJournal?: Array<{ at: string; actor: string; kind: string; text: string }>;
  /** Demande d'annulation en attente de validation. */
  cancellationRequest?: {
    reason: string;
    requestedAt: string;
    requestedBy: string;
    requestedByDisplay: string;
  } | null;
  lines: GardiennagePlanningLineV1[];
};

/**
 * Libellé de la demande : le client s'il est renseigné, sinon la télésurveillance.
 */
export function gardiennageDemandLabel(clientName: string | null | undefined): string {
  const name = String(clientName || "").trim();
  return name ? `Demande de ${name}` : "Demande Télésurveillance";
}

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
  /** Numéro métier `JJMMAAAA-XX` (recherche / titre). */
  dailyCode: string;
  exportExtraValues?: Record<string, string>;
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
  /** Texte saisi dans le champ consigne : initiale, modification, ou motif de planification. */
  consigneAddition?: string;
  /** Comparaison « Ancien flux => Nouveau flux » lorsque la planification change. */
  planningFluxChange?: string;
  requesterDisplayName?: string;
  linkedInterventionId: string | null;
  linkedRondeId: string | null;
  planningSnapshot?: GardiennagePlanningSnapshotV1 | null;
  exportExtraValues?: Record<string, string>;
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
  exportExtraValues?: Record<string, string>;
};
