const crypto = require("crypto");

/** Paramètres scrypt (alignés OWASP recommandations desktop). */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PREFIX_SCRYPT = "scrypt1";

function hashPasswordLegacySha256(rawPassword) {
  return crypto.createHash("sha256").update(String(rawPassword || ""), "utf8").digest("hex");
}

/**
 * Nouveau mot de passe : scrypt + sel aléatoire (format stocké versionné).
 */
function hashPassword(rawPassword) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(rawPassword || ""), salt, 64, SCRYPT_PARAMS);
  return `${PREFIX_SCRYPT}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

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
 * Vérifie un mot de passe contre l'enregistrement (scrypt ou legacy SHA-256 hex).
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

/** True si le hash est l'ancien format SHA-256 hex (migration au prochain login réussi). */
function needsPasswordMigration(stored) {
  return Boolean(stored && typeof stored === "string" && /^[a-f0-9]{64}$/i.test(stored));
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashPasswordLegacySha256,
  needsPasswordMigration
};
