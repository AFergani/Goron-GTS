/**
 * Dates calendaires `AAAA-MM-JJ`, heures `HH:mm` et bornes de mois `AAAA-MM`.
 *
 * Refuse les jours impossibles (`2024-02-31`) et les heures hors 00:00–23:59.
 * Consommé par les fériés, Fransor, Gardiennage, Intervention.
 *
 * @module electron/store/core/isoDate
 */

/**
 * Normalise une date `AAAA-MM-JJ` (jour calendaire réel, UTC).
 *
 * @param {unknown} value
 * @returns {string} Chaîne vide si invalide.
 */
function normalizeDateIso(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }
  return raw;
}

/**
 * Convertit un mois `AAAA-MM` en borne `[from, to)` (`date >= from AND date < to`).
 *
 * @param {unknown} month
 * @returns {{ from: string, to: string }|null}
 */
function parseMonthRange(month) {
  const clean = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(clean)) return null;
  const year = Number(clean.slice(0, 4));
  const monthPart = Number(clean.slice(5, 7));
  if (monthPart < 1 || monthPart > 12) return null;
  const from = normalizeDateIso(`${clean}-01`);
  if (!from) return null;
  const nextMonth = monthPart === 12 ? 1 : monthPart + 1;
  const nextYear = monthPart === 12 ? year + 1 : year;
  const to = normalizeDateIso(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
  if (!to) return null;
  return { from, to };
}

/**
 * Ajoute des jours à une date calendaire réelle (midi local, évite le décalage UTC).
 *
 * @param {unknown} isoDate
 * @param {number} amount
 * @returns {string} Chaîne vide si la date de départ est invalide.
 */
function addDaysIso(isoDate, amount) {
  const start = normalizeDateIso(isoDate);
  if (!start) return "";
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + Number(amount || 0));
  const pad2 = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Heure `HH:mm` (00:00–23:59) ou chaîne vide.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeTimeHm(value) {
  const raw = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : "";
}

module.exports = {
  addDaysIso,
  normalizeDateIso,
  normalizeTimeHm,
  parseMonthRange
};
