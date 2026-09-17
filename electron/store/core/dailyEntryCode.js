/**
 * Numéros métier journaliers `JJMMAAAA-XX` (indépendants de l'UUID interne).
 *
 * Séquence par domaine et par jour calendaire, allouée en transaction PostgreSQL
 * via `daily_entry_counters`. Consommé par Intervention, Ronde, Gardiennage, Main courante.
 *
 * @module electron/store/core/dailyEntryCode
 */

const { normalizeDateIso } = require("./isoDate");

/**
 * Formate un numéro de fiche `JJMMAAAA-XX` (XX au moins 2 chiffres).
 *
 * @param {string} dayIso - Jour `AAAA-MM-JJ`.
 * @param {number} seq - Rang du jour (>= 1).
 * @returns {string}
 */
function formatDailyEntryCode(dayIso, seq) {
  const day = normalizeDateIso(dayIso);
  const n = Math.max(1, Number(seq) || 1);
  const dd = day.slice(8, 10);
  const mm = day.slice(5, 7);
  const yyyy = day.slice(0, 4);
  return `${dd}${mm}${yyyy}-${String(n).padStart(2, "0")}`;
}

/**
 * Jour civil local (poste) à partir d'un horodatage ISO.
 *
 * @param {unknown} iso
 * @returns {string} `AAAA-MM-JJ` ou chaîne vide.
 */
function localDayIsoFromTimestamp(iso) {
  const parsed = new Date(String(iso || "").trim());
  if (Number.isNaN(parsed.getTime())) return "";
  const pad2 = (value) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

/**
 * Alloue le prochain numéro du domaine pour le jour donné (même connexion / transaction).
 *
 * @param {{ get: Function }} db - Adaptateur ou handle de transaction.
 * @param {string} domain - `intervention` | `ronde` | `gardiennage` | `main_courante`.
 * @param {unknown} dayIso - Jour métier `AAAA-MM-JJ`.
 * @returns {Promise<string>}
 */
async function allocateNextDailyCode(db, domain, dayIso) {
  const day = normalizeDateIso(dayIso);
  if (!day) {
    throw new Error("Date invalide pour l'attribution du numéro de fiche.");
  }
  const kind = String(domain || "").trim();
  if (!kind) {
    throw new Error("Domaine invalide pour l'attribution du numéro de fiche.");
  }
  const row = await db.get(
    `INSERT INTO daily_entry_counters (domain, day_iso, last_seq)
     VALUES (?, ?, 1)
     ON CONFLICT (domain, day_iso)
     DO UPDATE SET last_seq = daily_entry_counters.last_seq + 1
     RETURNING last_seq`,
    [kind, day]
  );
  return formatDailyEntryCode(day, Number(row?.last_seq || 1));
}

module.exports = {
  allocateNextDailyCode,
  formatDailyEntryCode,
  localDayIsoFromTimestamp
};
