/**
 * Identifiant d'acteur pour l'audit, et nom affiché pour l'interface.
 *
 * `actorName` reste le login technique (stockage audit).
 * `presentActorLabels` remplace ce login par `full_name` sur les champs
 * montrés à l'utilisateur, y compris les lignes déjà enregistrées.
 *
 * @module electron/store/core/actorName
 */

const { KIND_LABELS } = require("./activityJournal");

/** Clés dont la valeur est un login à montrer comme nom affiché. */
const DISPLAY_NAME_KEYS = new Set([
  "actor",
  "changedBy",
  "requestedBy",
  "requestedByDisplay",
  "reviewedBy",
  "reviewedByDisplay",
  "updatedBy",
  "createdBy",
  "cancellationRequestedBy",
  "batchDeleteRequestedBy",
  "batchSuppressedBy"
]);

/** Textes de journal déjà rendus (`notes`, consigne). */
const JOURNAL_TEXT_KEYS = new Set(["notes", "consigne"]);

const JOURNAL_KIND_PATTERN = Object.values(KIND_LABELS)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const JOURNAL_ACTOR_LINE = new RegExp(
  `^(\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2} : )(.+?)( (?:${JOURNAL_KIND_PATTERN}) : )`
);

/**
 * @param {unknown} username
 * @returns {string}
 */
function actorName(username) {
  return String(username || "unknown");
}

/**
 * Nom affiché d'un login, via le cache comptes (actifs et inactifs).
 * Une valeur qui n'est pas un login connu est renvoyée telle quelle.
 *
 * @param {import('../../userStore')|null|undefined} store
 * @param {unknown} raw
 * @returns {string}
 */
function lookupDisplayName(store, raw) {
  const value = String(raw ?? "").trim();
  if (!value) return value;
  const cache = store && store._usersByUsernameCache;
  if (!(cache instanceof Map)) return value;
  const row = cache.get(value.toLowerCase());
  const fullName = String(row?.full_name || "").trim();
  return fullName || value;
}

/**
 * Remplace le login dans une ligne de journal déjà rendue.
 *
 * @param {import('../../userStore')|null|undefined} store
 * @param {string} text
 * @returns {string}
 */
function relabelJournalActorsInText(store, text) {
  const source = String(text || "");
  if (!source.includes(" : ")) return source;
  return source
    .split("\n")
    .map((line) => {
      const match = line.match(JOURNAL_ACTOR_LINE);
      if (!match) return line;
      const actor = lookupDisplayName(store, match[2]);
      if (actor === match[2]) return line;
      return `${match[1]}${actor}${match[3]}${line.slice(match[0].length)}`;
    })
    .join("\n");
}

/**
 * Parcourt un objet renvoyé à l'interface et affiche les noms, pas les logins.
 *
 * @param {import('../../userStore')|null|undefined} store
 * @param {unknown} value
 * @returns {unknown}
 */
function presentActorLabels(store, value) {
  if (Array.isArray(value)) return value.map((item) => presentActorLabels(store, item));
  if (!value || typeof value !== "object") return value;
  const out = { ...value };
  for (const key of Object.keys(out)) {
    const nested = out[key];
    if (typeof nested === "string" && DISPLAY_NAME_KEYS.has(key)) {
      out[key] = lookupDisplayName(store, nested);
    } else if (typeof nested === "string" && JOURNAL_TEXT_KEYS.has(key)) {
      out[key] = relabelJournalActorsInText(store, nested);
    } else if (nested && typeof nested === "object") {
      out[key] = presentActorLabels(store, nested);
    }
  }
  return out;
}

module.exports = { actorName, lookupDisplayName, presentActorLabels };
