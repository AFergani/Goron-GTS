/**
 * Types métier rondes : fiches passage, sources (planifiée / urgence / liée intervention).
 *
 * Snapshot de demande exceptionnelle (`RondePlanningSnapshotV1`), champs clôture personnalisés,
 * corrélation profils planifiés (`plannedProfileId`, `plannedSlotKey`). Pas d’affichage brut de
 * `requestPlanningSnapshotJson` en UI utilisateur.
 */

import type { RondePlanningSnapshotV1 } from "./rondePlanningSnapshot.types";

export type RondeMotifTypeRef = {
  id: string;
  label: string;
  requiresFreeText: boolean;
  colorHex: string;
  sortOrder: number;
  createdAt: string;
  /** Motif injecté en base, non modifiable ni supprimable. */
  isSystem?: boolean;
};

export type RondeOriginKind = "TELESURVEILLANCE" | "CLIENT" | "AUTRE";
export type RondeSource = "URGENCE" | "LIEE_INTERVENTION" | "PLANIFIE";
export type RondeStatus = "EN_COURS" | "CLOTURE" | "ANNULE";

export type RondeEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: RondeSource;
  originInterventionId: string | null;
  siteId: string | null;
  siteDisplay: string;
  requestDate: string;
  motifTypeId: string | null;
  motifTypeLabel: string;
  motifRequiresFreeText: boolean;
  motifDetail: string;
  horairesDemandeObs: string;
  originKind: RondeOriginKind;
  originDetail: string;
  intervenantId: string | null;
  intervenantName: string;
  arrivalTime: string;
  departureTime: string;
  durationMinutes: number | null;
  workOrderNumber: string;
  report: string;
  status: RondeStatus;
  cancellationReason: string;
  closedAt: string | null;
  /** Renseigné pour les rondes créées depuis l’onglet planifié (usage interne / corrélation). */
  plannedProfileId: string | null;
  plannedRoundKind: string | null;
  /** Corrélation créneau planifié (ligne + index), ex. `{uuid}:{n}`. */
  plannedSlotKey: string | null;
  closureCustomValues: Record<string, string>;
  /** Instantané de la modale de demande (rondes exceptionnelles créées après cette évolution). */
  requestPlanningSnapshot: RondePlanningSnapshotV1 | null;
  /** Regroupe les fiches créées par une même demande exceptionnelle (lot). */
  requestBatchId: string | null;
  /** Pour regroupement uniquement ; ne pas afficher tel quel dans l’UI utilisateur. */
  requestPlanningSnapshotJson: string | null;
};

export type RondeSavePayload = {
  siteId: string | null;
  siteDisplay: string;
  requestDate: string;
  motifTypeId: string;
  motifDetail: string;
  horairesDemandeObs: string;
  originKind: RondeOriginKind;
  originDetail: string;
  intervenantId: string | null;
  intervenantName: string;
  arrivalTime: string;
  departureTime: string;
  workOrderNumber: string;
  report: string;
  closureCustomValues?: Record<string, string>;
};

/** Libellé posé par la clôture automatique des rondes exceptionnelles échues (J+5). */
export const RONDE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";

export function isRondeAutoClosureReport(report: string): boolean {
  return String(report || "").trim() === RONDE_AUTO_CLOSURE_REPORT;
}
