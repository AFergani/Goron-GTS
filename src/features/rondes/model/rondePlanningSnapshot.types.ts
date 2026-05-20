/**
 * Snapshot sérialisable de la saisie « demande » (rondes exceptionnelles) pour rejouer
 * « Demande liée » après clôture (même grilles/lignes/validité qu’à la création).
 */
export type RondePlanningReplayOriginV1 =
  | "CONTRAT"
  | "APPEL_CLIENT"
  | "SUITE_INTERVENTION"
  | "AUTRE";

export type RondePlanningSnapshotLineV1 = {
  roundKind: "OPENING" | "CLOSING" | "ACCOMPAGNEMENT" | "RANDOM";
  requestedTime: string;
  randomWindowStart: string;
  randomWindowEnd: string;
  randomRoundsCount: string;
  intervalHours: string;
  intervalEndTime: string;
  weekdaysMask: number;
  includeHolidays: boolean;
  includeHolidayEves: boolean;
};

export type RondePlanningSnapshotV1 = {
  version: 1;
  /** Date « demande » affichée en en-tête (référence métier conservée au moment du lot). */
  requestDate: string;
  /** Heure locale d’émission (HH:mm), ancrage des intervalles si validité Du = date de demande. Absent sur anciens snapshots. */
  requestTime?: string;
  validFrom: string;
  /** Heure de début de validité (HH:mm). Vide = 00:00. */
  validFromTime?: string;
  validTo: string;
  /** Heure de fin de validité (HH:mm). Vide = 23:59. */
  validToTime?: string;
  /** Force la validité sur une seule journée (date Du). */
  isSingleDay?: boolean;
  origin: RondePlanningReplayOriginV1;
  motifTypeId: string;
  consigne: string;
  siteId: string | null;
  intervenantId: string;
  createRoundsEnabled: boolean;
  lines: RondePlanningSnapshotLineV1[];
  originInterventionId?: string | null;
};
