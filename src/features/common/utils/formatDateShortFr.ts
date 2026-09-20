/**
 * Format date français pour l’affichage et les rapports (JJ/MM/AAAA).
 *
 * Les champs `<input type="date">` restent en ISO AAAA-MM-JJ en valeur interne.
 * Les exports Word / Excel convertissent toujours vers le format français.
 */

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_IN_TEXT_RE =
  /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isPlausibleIsoDate(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Date calendaire ISO (AAAA-MM-JJ) → JJ/MM/AAAA ; chaîne vide si invalide. */
export function formatDateShortFr(dateIso: string): string {
  if (!dateIso) return "";
  const trimmed = String(dateIso).trim();
  const dayOnly = ISO_DAY_RE.exec(trimmed);
  if (dayOnly && isPlausibleIsoDate(dayOnly[1], dayOnly[2], dayOnly[3])) {
    return `${dayOnly[3]}/${dayOnly[2]}/${dayOnly[1]}`;
  }
  const asDateTime = formatDateTimeFr(trimmed);
  if (asDateTime) return asDateTime.slice(0, 10);
  return "";
}

/** Horodatage ISO → JJ/MM/AAAA HH:mm (heure locale) ; date seule → JJ/MM/AAAA. */
export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const trimmed = String(iso).trim();
  const dayOnly = ISO_DAY_RE.exec(trimmed);
  if (dayOnly && isPlausibleIsoDate(dayOnly[1], dayOnly[2], dayOnly[3])) {
    return `${dayOnly[3]}/${dayOnly[2]}/${dayOnly[1]}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

/**
 * Remplace les dates ISO (AAAA-MM-JJ, avec heure éventuelle) par le format français
 * JJ/MM/AAAA ou JJ/MM/AAAA HH:mm. Laisse le reste du texte inchangé.
 */
export function formatIsoDatesInTextToFrench(text: string): string {
  if (!text) return text;
  return text.replace(ISO_DATE_IN_TEXT_RE, (full, year: string, month: string, day: string) => {
    if (!isPlausibleIsoDate(year, month, day)) return full;
    if (full.length > 10) {
      return formatDateTimeFr(full) || `${day}/${month}/${year}`;
    }
    return `${day}/${month}/${year}`;
  });
}
