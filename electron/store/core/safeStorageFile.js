/**
 * Lecture / écriture de chaînes via Electron `safeStorage` (DPAPI sous Windows).
 * Format disque : UTF-8 contenant le buffer chiffré en base64.
 *
 * Partagé par le code admin (`gts-admin.enc`), la config PG (`gts-pg.enc`)
 * et les sessions dev (`gts-sessions.enc`).
 *
 * @module electron/store/core/safeStorageFile
 */

const fs = require("fs");
const path = require("path");

/**
 * @returns {import('electron').SafeStorage|null}
 */
function getSafeStorage() {
  try {
    const { safeStorage } = require("electron");
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage;
  } catch {
    return null;
  }
}

/**
 * Déchiffre un fichier `safeStorage` (base64).
 *
 * @param {string} filePath
 * @returns {string|null} Texte en clair, ou `null` si absent / illisible / chiffrement indisponible.
 */
function readEncryptedString(filePath) {
  const safeStorage = getSafeStorage();
  if (!safeStorage || !filePath || !fs.existsSync(filePath)) return null;
  try {
    const encryptedBase64 = fs.readFileSync(filePath, "utf-8").trim();
    if (!encryptedBase64) return null;
    return String(safeStorage.decryptString(Buffer.from(encryptedBase64, "base64")) || "");
  } catch {
    return null;
  }
}

/**
 * Chiffre et écrit une chaîne (crée le dossier parent si besoin).
 *
 * @param {string} filePath
 * @param {string} plain
 * @returns {void}
 * @throws {Error} Si `safeStorage` n'est pas disponible.
 */
function writeEncryptedString(filePath, plain) {
  const safeStorage = getSafeStorage();
  if (!safeStorage) {
    throw new Error("Le chiffrement système (safeStorage) n'est pas disponible sur ce poste.");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const encryptedBuffer = safeStorage.encryptString(String(plain));
  fs.writeFileSync(filePath, encryptedBuffer.toString("base64"), "utf-8");
}

/**
 * Indique si `safeStorage` est utilisable sur ce poste.
 *
 * @returns {boolean}
 */
function isEncryptionAvailable() {
  return Boolean(getSafeStorage());
}

module.exports = {
  isEncryptionAvailable,
  readEncryptedString,
  writeEncryptedString
};
