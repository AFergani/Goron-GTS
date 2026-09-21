/**
 * Calendrier Fransor : jours du mois, week-end, libellés FR, clés d’année.
 *
 * Utilisé par `FransorPage` et `FransorClosureExceptionsModal`.
 */

export type FransorDisplayedDay = {
  date: string;
  missingOpening: boolean;
  missingClosing: boolean;
  openingResponsableId?: string;
  closingResponsableId?: string;
};

/**
 * Liste des jours ISO (`YYYY-MM-DD`) d’un mois `YYYY-MM`.
 *
 * @param month - Mois calendaire
 * @returns Jours du mois, ou tableau vide si le format est invalide
 */
export function getDaysInMonth(month: string): string[] {
  const [year, monthPart] = month.split("-").map((value) => Number(value));
  if (!year || !monthPart) return [];
  const total = new Date(year, monthPart, 0).getDate();
  const days: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    const iso = `${year}-${String(monthPart).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push(iso);
  }
  return days;
}

/**
 * @param isoDate - Date `YYYY-MM-DD`
 * @returns `true` si samedi ou dimanche
 */
export function isWeekend(isoDate: string): boolean {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * @param isoDate - Date `YYYY-MM-DD`
 * @returns Libellé week-end, ou `null`
 */
export function getWeekendDayLabel(isoDate: string): "samedi" | "dimanche" | null {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.getDay();
  if (day === 6) return "samedi";
  if (day === 0) return "dimanche";
  return null;
}

/**
 * Décalage lundi=0 … dimanche=6 pour aligner la grille calendrier.
 *
 * @param isoDate - Date `YYYY-MM-DD`
 */
export function getWeekdayOffsetFromMonday(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00`);
  return (date.getDay() + 6) % 7;
}

/**
 * Date courte FR (`lun. 21/09/2026`).
 *
 * @param isoDate - Date `YYYY-MM-DD`
 */
export function formatDateFr(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Libellé carte calendrier (mois déjà indiqué dans le sélecteur).
 *
 * @param isoDate - Date `YYYY-MM-DD`
 * @param compact - Abréviation du jour de semaine
 * @returns Ex. « Lundi 04 » ou « Mer 04 »
 */
export function formatDayCardLabel(isoDate: string, compact = false): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const weekdayRaw = date
    .toLocaleDateString("fr-FR", { weekday: compact ? "short" : "long" })
    .replace(/\.$/, "");
  const weekday = `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}`;
  const dayNum = date.toLocaleDateString("fr-FR", { day: "2-digit" });
  return `${weekday} ${dayNum}`;
}

/**
 * Libellé accessible complet d’une carte jour.
 *
 * @param isoDate - Date `YYYY-MM-DD`
 */
export function formatDayCardAriaLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/**
 * Libellé long du mois (`Septembre 2026`).
 *
 * @param month - Clé `YYYY-MM`
 */
export function formatMonthFr(month: string): string {
  const [year, monthPart] = month.split("-").map((value) => Number(value));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1, 1);
  const text = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Libellé court du mois (ex. « Mai »).
 *
 * @param month - Clé `YYYY-MM`
 */
export function formatMonthShortFr(month: string): string {
  const [year, monthPart] = month.split("-").map((value) => Number(value));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1, 1);
  const text = date.toLocaleDateString("fr-FR", { month: "short" }).replace(/\.$/, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Décale un mois `YYYY-MM` de `delta` mois (calendrier local).
 *
 * @param month - Mois de départ
 * @param delta - Mois à ajouter (négatif pour reculer)
 */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthPart] = month.split("-").map((value) => Number(value));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Les 12 clés `YYYY-MM` d’une année civile.
 *
 * @param year - Année
 */
export function getYearMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const monthPart = String(index + 1).padStart(2, "0");
    return `${year}-${monthPart}`;
  });
}

/**
 * Libellé du type d’exception calendrier.
 *
 * @param mode - Fermeture forcée ou ouverture forcée
 */
export function formatClosureModeLabel(mode: "CLOSED" | "OPEN"): string {
  return mode === "OPEN" ? "Ouvert" : "Fermer";
}
