/**
 * Sites et prestataires proposés hors référentiel (file d'attente Paramètres).
 *
 * Utilisé par tous les formulaires de création et par Gestion des données.
 */

/** Site proposé hors catalogue, en attente de validation. */
export type PendingSite = {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  createdAt: string;
};

/** Prestataire proposé hors catalogue, en attente de validation. */
export type PendingIntervenant = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
};
