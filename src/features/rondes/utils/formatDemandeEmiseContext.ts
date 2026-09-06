/**
 * Libellé « Demande émise le … » pour observations / traces.
 */

export function formatDemandeEmiseContext(dateIso: string, timeHm: string): string {
  const trimmed = String(dateIso || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
    : new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const dateFr = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const t = String(timeHm || "").trim();
  return t ? `Demande émise le ${dateFr} à ${t}` : `Demande émise le ${dateFr}`;
}
