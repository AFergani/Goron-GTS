/**
 * Origine UI de la demande de ronde ↔ origine API stockée.
 */

import type { RondeOriginKind } from "./ronde.types";

export type RequestOrigin = "CONTRAT" | "APPEL_CLIENT" | "SUITE_INTERVENTION" | "AUTRE";

/** Mappe l’origine stockée d’une fiche vers l’origine UI de la modale demande. */
export function requestOriginFromStoredEntry(row: {
  originInterventionId?: string | null;
  originKind?: RondeOriginKind;
}): RequestOrigin {
  if (row.originInterventionId) return "SUITE_INTERVENTION";
  if (row.originKind === "CLIENT") return "APPEL_CLIENT";
  if (row.originKind === "TELESURVEILLANCE") return "CONTRAT";
  return "AUTRE";
}

/** Mappe l’origine UI vers le kind API (`originKind`). */
export function mapRequestOriginToApiKind(origin: RequestOrigin): RondeOriginKind {
  if (origin === "APPEL_CLIENT") return "CLIENT";
  if (origin === "CONTRAT") return "TELESURVEILLANCE";
  return "AUTRE";
}
