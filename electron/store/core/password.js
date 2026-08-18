/**
 * Hachage et vérification des mots de passe utilisateurs (scrypt + migration depuis SHA-256 legacy).
 * Utilisé par `authUsers.js` (login, création compte, première connexion, unicité nom affiché + mot de passe).
 *
 * Format stocké courant : `scrypt1$<sel base64>$<hash base64>` ; ancien format : 64 caractères hex SHA-256.
 * Historique : jusqu'à 3 hash précédents (`users.password_history_json`) — refus de réutilisation.
 */

const crypto = require("crypto");

/** Paramètres scrypt (alignés OWASP recommandations desktop). */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PREFIX_SCRYPT = "scrypt1";

/** Nombre max de hash précédents conservés pour refus de réutilisation. */
const PASSWORD_HISTORY_MAX = 3;

/**
 * Ancien algorithme SHA-256 hex — conservé pour vérification et détection de migration uniquement.
 *
 * @param {string} rawPassword
 * @returns {string} Empreinte hex 64 caractères.
 */
function hashPasswordLegacySha256(rawPassword) {
  return crypto.createHash("sha256").update(String(rawPassword || ""), "utf8").digest("hex");
}

/**
 * Produit un hash scrypt pour enregistrement en base (`users.password_hash`).
 *
 * @param {string} rawPassword - Mot de passe en clair (validation métier en amont).
 * @returns {string} Chaîne versionnée `scrypt1$...`.
 */
function hashPassword(rawPassword) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(rawPassword || ""), salt, 64, SCRYPT_PARAMS);
  return `${PREFIX_SCRYPT}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Comparaison constante de deux chaînes hex (legacy SHA-256).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a).toLowerCase(), "hex");
    const bb = Buffer.from(String(b).toLowerCase(), "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Vérifie un mot de passe contre l'enregistrement stocké (scrypt ou legacy SHA-256 hex).
 *
 * @param {string} rawPassword
 * @param {string|null|undefined} stored - Valeur `users.password_hash`.
 * @returns {boolean}
 */
function verifyPassword(rawPassword, stored) {
  if (!stored || typeof stored !== "string") return false;
  if (stored.startsWith(`${PREFIX_SCRYPT}$`)) {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== PREFIX_SCRYPT) return false;
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    let hash;
    try {
      hash = crypto.scryptSync(String(rawPassword || ""), salt, expected.length, SCRYPT_PARAMS);
    } catch {
      return false;
    }
    if (hash.length !== expected.length) return false;
    return crypto.timingSafeEqual(hash, expected);
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    return timingSafeEqualHex(stored, hashPasswordLegacySha256(rawPassword));
  }
  return false;
}

/**
 * Indique si le hash en base doit être migré vers scrypt au prochain login réussi.
 *
 * @param {string|null|undefined} stored
 * @returns {boolean} `true` pour un hash SHA-256 hex legacy.
 */
function needsPasswordMigration(stored) {
  return Boolean(stored && typeof stored === "string" && /^[a-f0-9]{64}$/i.test(stored));
}

/**
 * Parse la colonne `password_history_json` (tableau de hash, max 3).
 *
 * @param {string|null|undefined} historyJson
 * @returns {string[]}
 */
function parsePasswordHistory(historyJson) {
  if (!historyJson || typeof historyJson !== "string") return [];
  try {
    const parsed = JSON.parse(historyJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, PASSWORD_HISTORY_MAX);
  } catch {
    return [];
  }
}

/**
 * Indique si le mot de passe en clair correspond au hash courant ou à l'historique récent.
 *
 * @param {string} rawPassword
 * @param {string|null|undefined} currentHash
 * @param {string|null|undefined} historyJson
 * @returns {boolean}
 */
function isPasswordRecentlyUsed(rawPassword, currentHash, historyJson) {
  if (currentHash && verifyPassword(rawPassword, currentHash)) return true;
  return parsePasswordHistory(historyJson).some((hash) => verifyPassword(rawPassword, hash));
}

/**
 * Empile le hash courant en tête de l'historique (max {@link PASSWORD_HISTORY_MAX}).
 *
 * @param {string|null|undefined} previousHash - Hash remplacé (exclu s'il est vide).
 * @param {string|null|undefined} historyJson - Historique actuel.
 * @returns {string} JSON à stocker dans `password_history_json`.
 */
function pushPasswordHistory(previousHash, historyJson) {
  const previous = String(previousHash || "").trim();
  const next = parsePasswordHistory(historyJson).filter((hash) => hash !== previous);
  if (previous) next.unshift(previous);
  return JSON.stringify(next.slice(0, PASSWORD_HISTORY_MAX));
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsPasswordMigration,
  parsePasswordHistory,
  isPasswordRecentlyUsed,
  pushPasswordHistory,
  PASSWORD_HISTORY_MAX
};
