/**
 * Origine UI de la demande de ronde ↔ origine API stockée.
 */

import type { RondeOriginKind } from "./ronde.types";

export type RequestOrigin = "CONTRAT" | "APPEL_CLIENT" | "SUITE_INTERVENTION" | "AUTRE";

const SUITE_INTERVENTION_DETAIL_PREFIX = /^Suite intervention\.\s*/i;

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

/** Libellé court FR pour l’origine UI. */
export function requestOriginLabelFr(origin: RequestOrigin): string {
  if (origin === "APPEL_CLIENT") return "Client";
  if (origin === "CONTRAT") return "Contrat";
  if (origin === "SUITE_INTERVENTION") return "Suite intervention";
  return "Autre";
}

/** Texte `originDetail` persisté (client / suite intervention / consigne). */
export function formatRequestOriginDetail(
  origin: RequestOrigin,
  opts: { consigne?: string; clientName?: string } = {}
): string {
  const consigne = String(opts.consigne ?? "").trim();
  const clientName = String(opts.clientName ?? "").trim();
  if (origin === "SUITE_INTERVENTION") {
    return consigne ? `Suite intervention. ${consigne}` : "Suite intervention.";
  }
  if (origin === "APPEL_CLIENT") {
    return clientName;
  }
  return consigne;
}

/** Retire le préfixe « Suite intervention. » d’un détail stocké. */
export function stripSuiteInterventionPrefix(detail: string): string {
  return String(detail ?? "").replace(SUITE_INTERVENTION_DETAIL_PREFIX, "").trim();
}
