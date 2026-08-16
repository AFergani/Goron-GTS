/**
 * Borne de mois `AAAA-MM` → `[from, to)` pour requêtes Fransor.
 *
 * @module electron/store/domains/fransor/monthRange
 */

/**
 * Convertit un mois `AAAA-MM` en borne `[from, to)` (`date >= from AND date < to`).
 *
 * @param {string} month
 * @returns {{ from: string, to: string }|null}
 */
function parseMonthRange(month) {
  const clean = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(clean)) return null;
  const from = `${clean}-01`;
  const [year, monthPart] = clean.split("-").map((v) => Number(v));
  const nextMonthDate = new Date(Date.UTC(year, monthPart, 1));
  const to = nextMonthDate.toISOString().slice(0, 10);
  return { from, to };
}

module.exports = {
  parseMonthRange
};
