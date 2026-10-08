/**
 * Chiffrement réversible AES-256-GCM pour des champs métier à réafficher.
 *
 * Un hachage ne permet pas de relire le secret à l'écran ni dans un export.
 * La clé est dérivée du mot de passe technique PostgreSQL (déjà partagé par
 * tous les postes, absent du dump). Un dump seul ne contient donc pas le clair.
 *
 * @module electron/store/core/fieldCipher
 */

const crypto = require("crypto");
const { getPostgresConnectionConfig } = require("../persistence/postgresConnectionConfig");

const SALT = "goron-gts-pv-video-v1";
const PREFIX = "v1:";

/** @type {{ password: string, key: Buffer|null }} */
let cached = { password: "", key: null };

/**
 * Dérive et mémorise la clé tant que le mot de passe technique ne change pas.
 *
 * @returns {Buffer}
 */
function encryptionKey() {
  const password = String(getPostgresConnectionConfig().password || "");
  if (!password) {
    throw new Error("Mot de passe technique PostgreSQL absent : chiffrement impossible.");
  }
  if (cached.key && cached.password === password) return cached.key;
  const key = crypto.scryptSync(password, SALT, 32);
  cached = { password, key };
  return key;
}

/**
 * Chiffre un texte. Chaîne vide reste vide (rien à protéger).
 *
 * @param {unknown} plain
 * @returns {string} Préfixe `v1:` + base64(iv, tag, ciphertext), ou `""`.
 */
function encryptField(plain) {
  const text = plain == null ? "" : String(plain);
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Déchiffre une valeur produite par `encryptField`.
 *
 * @param {unknown} stored
 * @returns {string}
 * @throws {Error} Si le format ou la clé ne permet pas de relire le champ.
 */
function decryptField(stored) {
  const raw = stored == null ? "" : String(stored);
  if (!raw) return "";
  if (!raw.startsWith(PREFIX)) {
    throw new Error("Champ chiffré illisible.");
  }
  const buf = Buffer.from(raw.slice(PREFIX.length), "base64");
  if (buf.length < 29) {
    throw new Error("Champ chiffré illisible.");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

module.exports = { encryptField, decryptField };
