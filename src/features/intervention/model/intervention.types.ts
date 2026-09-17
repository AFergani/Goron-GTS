/**
 * Types métier interventions : fiche unique, statuts, référentiels en attente.
 *
 * Cycle EN_COURS → CLOTURE / ANNULE. Champs passage (arrivée/départ) avec dates civiles.
 * `exportExtraValues` : variables Word configurées.
 */

/** Libellé lorsque aucun bon d'intervention n'est saisi (aligné backend). */
export const INTERVENTION_NO_WORK_ORDER_LABEL = "Pas de bon";

export type InterventionStatus = "EN_COURS" | "CLOTURE" | "ANNULE";

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
  cancellationReason: string;
  closedAt: string | null;
  archivedAt: string | null;
  /** Numéro métier `JJMMAAAA-XX` (recherche / titre) ; l’UUID `id` reste interne. */
  dailyCode: string;
  /** Valeurs des champs complémentaires configurés pour l'export Word (clé → texte). */
  exportExtraValues: Record<string, string>;
  /** ID de la ronde liée (lookup inversé depuis `ronde_entries.origin_intervention_id`). */
  linkedRondeId: string | null;
  /** ID du gardiennage lié (lookup inversé depuis `gardiennage_entries.intervention_id`). */
  linkedGardiennageId: string | null;
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
