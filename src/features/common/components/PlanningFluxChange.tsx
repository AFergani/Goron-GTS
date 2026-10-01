/**
 * Phrase du changement de programmation, affichée dans l'historique de la demande
 * puis enregistrée telle quelle : « Ancien flux : … => Nouveau flux : … ».
 */

export function formatPlanningFluxChangeText(previousFlux: string, nextFlux: string): string {
  const previous = String(previousFlux || "").trim();
  const next = String(nextFlux || "").trim();
  if (!previous || !next || previous === next) return "";
  return `Ancien flux : ${previous} => Nouveau flux : ${next}`;
}
