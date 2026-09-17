/**
 * Types métier main courante : journal d’exploitation, statuts, payloads API.
 *
 * Flux : EN_ATTENTE (signalement) → EN_COURS (à suivre) → CLOTURE. Site facultatif.
 * Actions responsable : observation, prise en compte, clôture, réouverture.
 */

export type MainCouranteStatus = "EN_ATTENTE" | "EN_COURS" | "CLOTURE";

export type MainCouranteEntry = {
  id: string;
  createdAt: string;
  /** Version ligne (optimistic locking côté base) */
  updatedAt: string;
  operatorName: string;
  /** Optionnel : peut concerner plusieurs sites ou aucun site précis */
  siteId: string | null;
  siteDisplay: string;
  anomalyTypeId: string;
  anomalyTypeLabel: string;
  /** Saisie opérateur (obligatoire à la création / édition) */
  information: string;
  status: MainCouranteStatus;
  /** Après intervention responsable */
  managerObservation?: string;
  managerName?: string;
  consultedByManagerAt?: string;
  consultedByManagerName?: string;
  /** Consultation opérateur créateur après réponse encadrement (badge sidebar) */
  consultedByOperatorAt?: string;
  /** Horodatage de la prise en compte (validation responsable) */
  priseEnCompteAt?: string;
  closedAt?: string;
  /** Numéro métier `JJMMAAAA-XX` (recherche / titre). */
  dailyCode: string;
};

export type MainCouranteSavePayload = {
  siteId: string | null;
  siteDisplay: string;
  anomalyTypeId: string;
  anomalyTypeLabel: string;
  information: string;
};

export type MainCouranteCreatePayload = MainCouranteSavePayload;
