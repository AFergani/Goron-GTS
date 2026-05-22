/**
 * Profils de ronde planifiée (contractuel) : lignes, récurrences, champs de clôture, payloads API.
 */

/** Ligne de profil : aléatoire unique avec période jour/nuit (masque). Les créneaux émis restent RANDOM_DAY / RANDOM_NIGHT. */
export type RondePlannedProfileStoredRoundKind = "OPENING" | "CLOSING" | "ACCOMPAGNEMENT" | "RANDOM";

export type RondePlannedRoundKind =
  | RondePlannedProfileStoredRoundKind
  | "RANDOM_DAY"
  | "RANDOM_NIGHT";

export type RondePlannedRecurrenceKind = "WEEKLY" | "DAILY" | "MONTHLY" | "DATE_RANGE";

/** Bit 1 = passages jour, bit 2 = passages nuit (ligne `RANDOM` uniquement). */
export const RANDOM_PERIOD_DAY = 1;
export const RANDOM_PERIOD_NIGHT = 2;
export type RondeClosureFieldType = "text" | "textarea" | "number" | "time" | "select" | "toggle";

export type RondeClosureFieldRef = {
  id: string;
  key: string;
  labelTemplate: string;
  type: RondeClosureFieldType;
  required: boolean;
  placeholder: string;
  options: string[];
};

/** Une ligne de planification dans un profil (plusieurs lignes par site / client). */
export type RondePlannedProfileLineRef = {
  id: string;
  profileId: string;
  sortOrder: number;
  roundKind: RondePlannedRoundKind;
  recurrenceKind: RondePlannedRecurrenceKind;
  weekdaysMask: number;
  monthDay: number | null;
  /** Obligatoire si ouverture / fermeture ; sinon vide côté payload */
  requestedTime: string | null;
  /** Intervalle entre occurrences (minutes), ex. 180 pour « toutes les 3 h » — aléatoire dans la fenêtre horaire */
  intervalMinutes: number | null;
  /** Masque jour/nuit pour `roundKind === "RANDOM"` (1, 2 ou 3). */
  randomPeriodMask: number;
  /** Fenêtre aléatoire début (HH:MM) ; avec `randomWindowEnd` et fin ≤ début ⇒ fenêtre jusqu’au lendemain. */
  randomWindowStart: string | null;
  randomWindowEnd: string | null;
  /** Nombre de rondes aléatoires dans la fenêtre (si pas d’intervalle suffisant). */
  randomRoundsCount: number | null;
  includeHolidays: boolean;
  includeHolidayEves: boolean;
  /** Inclus début (AAAA-MM-JJ) si `recurrenceKind === "DATE_RANGE"`. */
  rangeStartDate: string | null;
  /** Inclus fin si plage de dates. */
  rangeEndDate: string | null;
  motifTypeId: string | null;
  motifTypeLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Profil de planification : regroupe plusieurs types de récurrence pour un même site. */
export type RondePlannedProfileRef = {
  id: string;
  label: string;
  siteId: string | null;
  siteDisplay: string | null;
  /** Prestataire par défaut pour les passages générés à partir de ce profil */
  intervenantId: string | null;
  intervenantDisplay: string | null;
  notes: string;
  /** Plage globale Du (AAAA-MM-JJ), obligatoire à l’enregistrement côté UI. */
  planningValidFrom: string | null;
  /** Plage globale Au ; vide ou null = jusqu’à nouvel ordre. */
  planningValidTo: string | null;
  /** Flux couvrant la date du jour (plage globale Du / Au). */
  isActive: boolean;
  /** Horodatage ISO de validation par un responsable ; null si non validé. */
  validatedAt: string | null;
  /** Compte ayant validé (affichage métier). */
  validatedByUsername: string | null;
  /** Si false: profil conservé pour traçabilité/statistiques, sans génération de rondes planifiées. */
  createRoundsEnabled: boolean;
  closureFormEnabled: boolean;
  closureFields: RondeClosureFieldRef[];
  lines: RondePlannedProfileLineRef[];
  createdAt: string;
  updatedAt: string;
};

export type RondePlannedProfileLinePayload = {
  /** Conservé entre enregistrements pour ne pas désynchroniser les fiches planifiées */
  id?: string;
  roundKind: RondePlannedRoundKind;
  recurrenceKind: RondePlannedRecurrenceKind;
  weekdaysMask: number;
  monthDay: number | null;
  /** HH:MM pour OPENING / CLOSING ; chaîne vide sinon */
  requestedTime: string;
  intervalMinutes: number | null;
  randomPeriodMask: number;
  randomWindowStart: string;
  randomWindowEnd: string;
  randomRoundsCount: number | null;
  includeHolidays?: boolean;
  includeHolidayEves?: boolean;
  rangeStartDate: string | null;
  rangeEndDate: string | null;
  motifTypeId: string | null;
};

export type RondePlannedProfilePayload = {
  /** Absent en création ; obligatoire en édition */
  id?: string;
  label: string;
  siteId: string | null;
  /** Prestataire associé au profil (obligatoire à l'enregistrement) */
  intervenantId: string;
  notes: string;
  /** Date de début de validité du profil (AAAA-MM-JJ). */
  planningValidFrom: string;
  /** Date de fin incluse ; chaîne vide = sans fin. */
  planningValidTo: string;
  createRoundsEnabled?: boolean;
  closureFormEnabled: boolean;
  closureFields: Array<{
    id?: string;
    key: string;
    labelTemplate: string;
    type: RondeClosureFieldType;
    required: boolean;
    placeholder: string;
    options: string[];
  }>;
  lines: RondePlannedProfileLinePayload[];
};

/** Mise à jour partielle des champs Word / clôture (sans toucher aux lignes de planification). */
