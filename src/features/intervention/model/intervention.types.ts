/**
 * Types métier interventions : fiche unique, statuts, facturation, référentiels en attente.
 *
 * Cycle EN_COURS → CLOTURE / ANNULE. Champs passage (arrivée/départ) avec dates civiles.
 * `exportExtraValues` : variables Word configurées. Types pending partagés avec Paramètres.
 */

export type InterventionStatus = "EN_COURS" | "CLOTURE" | "ANNULE";
export type InterventionBillingStatus = "FACTURABLE" | "NON_FACTURABLE";

export type InterventionEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  siteId: string | null;
  siteDisplay: string;
  requestReason: string;
  requestDate: string;
  requestTime: string;
  /** Date civile d'arrivée (AAAA-MM-JJ), distincte de la date de demande si saisie tardivement. */
  arrivalDate: string | null;
  arrivalTime: string;
  departureTime: string;
  departureDate: string | null;
  delayMinutes: number | null;
  workOrderNumber: string;
  report: string;
  intervenantId: string | null;
  intervenantName: string;
  status: InterventionStatus;
  billingStatus: InterventionBillingStatus;
  billingReason: string;
  cancellationReason: string;
  closedAt: string | null;
  archivedAt: string | null;
  /** Valeurs des champs complémentaires configurés pour l'export Word (clé → texte). */
  exportExtraValues: Record<string, string>;
  syncState?: "PENDING_QUEUE";
};

export type InterventionSavePayload = {
  siteId: string | null;
  siteDisplay: string;
  requestReason: string;
  requestDate: string;
  requestTime: string;
  arrivalDate?: string | null;
  arrivalTime: string;
  departureDate?: string | null;
  departureTime: string;
  workOrderNumber: string;
  report: string;
  intervenantId: string | null;
  intervenantName: string;
  exportExtraValues?: Record<string, string>;
};

/** Site proposé hors référentiel (validation Paramètres). */
export type PendingInterventionSite = {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  createdAt: string;
};

/** Prestataire proposé hors référentiel (validation Paramètres). */
export type PendingInterventionIntervenant = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
};
