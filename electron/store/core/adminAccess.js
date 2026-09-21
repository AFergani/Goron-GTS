/**
 * Accès administrateur local (profil DEV) : lecture / écriture du code maître.
 *
 * Priorité : fichier chiffré `{userData}/gts-admin.enc` (DPAPI / `safeStorage`),
 * puis `{userData}/data/acces_admin.env` (même dossier AppData, fourni hors appli).
 * Pas de repli vers le répertoire de travail ni le voisin de l'exécutable.
 *
 * Consommé par `UserStore` (`resolveAdminAccess` au constructeur) et `ipcAuthHandlers`
 * (`auth:setAdminCode` → `writeEncryptedAdminCode`).
 *
 * @module electron/store/core/adminAccess
 */

const fs = require("fs");
const path = require("path");
const { readEncryptedString, writeEncryptedString } = require("./safeStorageFile");

/** Nom du fichier `.env` fourni sous `{userData}/data/`. */
const ADMIN_ENV_FILE_NAME = "acces_admin.env";
/** Clés acceptées dans le `.env` (première valeur non vide). */
const ADMIN_MASTER_CODE_KEYS = ["GTS_ADMIN_MASTER_CODE", "ADMIN_MASTER_CODE"];
/** Nom du fichier chiffré via `safeStorage` (DPAPI sous Windows), dans `userData`. */
const ADMIN_ENC_FILE_NAME = "gts-admin.enc";

/**
 * Parse un contenu type fichier `.env` (lignes `CLE=valeur`, commentaires `#`).
 *
 * @param {string} content - Contenu brut du fichier.
 * @returns {Record<string, string>} Paires clé/valeur ; BOM UTF-8 toléré.
 */
function parseDotEnvFile(content) {
  const entries = {};
  const lines = String(content || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key) continue;
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

/**
 * Résout le dossier AppData Electron (`userData`).
 *
 * @param {string} [userDataPath] - Dossier déjà connu (tests / `UserStore`).
 * @returns {string} Chemin absolu, ou chaîne vide hors Electron sans `userDataPath`.
 */
function resolveUserDataPath(userDataPath) {
  const explicit = String(userDataPath || "").trim();
  if (explicit) return explicit;
  try {
    const { app } = require("electron");
    return app.getPath("userData");
  } catch {
    return "";
  }
}

/**
 * Résout le chemin du fichier chiffré `gts-admin.enc`.
 *
 * @param {string} [userDataPath] - Dossier `userData` déjà connu ; sinon `app.getPath("userData")`.
 * @returns {string|null} Chemin absolu, ou `null` si le dossier AppData est inconnu.
 */
function resolveAdminEncFilePath(userDataPath) {
  const base = resolveUserDataPath(userDataPath);
  return base ? path.join(base, ADMIN_ENC_FILE_NAME) : null;
}

/**
 * Lit le code administrateur depuis `{userData}/data/acces_admin.env`.
 *
 * @param {string} [userDataPath] - Dossier `userData` Electron déjà connu.
 * @returns {string|null} Code maître, ou `null` si fichier / clé absents.
 */
function readAdminMasterCode(userDataPath) {
  const base = resolveUserDataPath(userDataPath);
  if (!base) return null;
  const envPath = path.join(base, "data", ADMIN_ENV_FILE_NAME);
  try {
    if (!fs.existsSync(envPath)) return null;
    const parsed = parseDotEnvFile(fs.readFileSync(envPath, "utf-8"));
    const code = ADMIN_MASTER_CODE_KEYS.map((key) => String(parsed[key] || "").trim()).find(Boolean);
    return code || null;
  } catch {
    return null;
  }
}

/**
 * Lit le code admin depuis le fichier chiffré (DPAPI / `safeStorage` Electron).
 *
 * @param {string} encFilePath - Chemin absolu, typiquement `{userData}/gts-admin.enc`.
 * @returns {string|null} Code en clair, ou `null` si absent, illisible ou chiffrement indisponible.
 */
function readEncryptedAdminCode(encFilePath) {
  const code = readEncryptedString(encFilePath);
  return code ? String(code).trim() || null : null;
}

/**
 * Chiffre et enregistre le code admin (base64 sur disque, déchiffrable uniquement sur le poste).
 *
 * @param {string} encFilePath - Fichier cible (`gts-admin.enc`).
 * @param {string} code - Nouveau code maître (validation longueur côté IPC).
 * @returns {void}
 * @throws {Error} Si `safeStorage` n'est pas disponible sur le poste.
 */
function writeEncryptedAdminCode(encFilePath, code) {
  writeEncryptedString(encFilePath, String(code));
}

/**
 * Détermine si l'accès administrateur local est actif et fournit le code maître.
 *
 * Ordre : `{userData}/gts-admin.enc`, puis `{userData}/data/acces_admin.env`.
 *
 * @param {object} [options]
 * @param {string} [options.userDataPath] - Dossier `userData` Electron déjà connu.
 * @returns {{
 *   devMasterCode: string|null,
 *   adminAccessEnabled: boolean
 * }}
 */
function resolveAdminAccess(options = {}) {
  const encFilePath = resolveAdminEncFilePath(options.userDataPath);
  const encryptedCode = encFilePath ? readEncryptedAdminCode(encFilePath) : null;
  if (encryptedCode) {
    return {
      devMasterCode: encryptedCode,
      adminAccessEnabled: true
    };
  }
  const code = readAdminMasterCode(options.userDataPath);
  return {
    devMasterCode: code,
    adminAccessEnabled: Boolean(code)
  };
}

module.exports = {
  resolveAdminAccess,
  resolveAdminEncFilePath,
  writeEncryptedAdminCode
};
