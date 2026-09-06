/**
 * Construit le payload `exportExtraValues` (trim + clés date logique).
 */

export function buildInterventionExportExtraPayload(params: {
  exportExtraValues: Record<string, string>;
  effectiveLogicalDate: string;
  logicalDateTransitionLabel: string;
}): Record<string, string> {
  const extraPayload = Object.fromEntries(
    Object.entries(params.exportExtraValues || {}).map(([k, v]) => [k, String(v ?? "").trim()])
  );
  if (params.effectiveLogicalDate) {
    extraPayload.date_logique_passage = params.effectiveLogicalDate;
    extraPayload.date_logique = params.effectiveLogicalDate;
    if (params.logicalDateTransitionLabel) {
      extraPayload.transition_date = params.logicalDateTransitionLabel;
    } else {
      delete extraPayload.transition_date;
    }
  }
  return extraPayload;
}
