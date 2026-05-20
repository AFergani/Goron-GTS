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
  /** Horodatage de la prise en compte (validation responsable) */
  priseEnCompteAt?: string;
  closedAt?: string;
  archivedAt?: string;
  syncState?: "PENDING_QUEUE";
};

export type MainCouranteSavePayload = {
  siteId: string | null;
  siteDisplay: string;
  anomalyTypeId: string;
  anomalyTypeLabel: string;
  information: string;
};

export type MainCouranteCreatePayload = MainCouranteSavePayload;
