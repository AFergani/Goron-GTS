/**
 * Accès administrateur local (profil DEV) : lecture / écriture du code maître.
 *
 * Priorité : fichier chiffré `{userData}/gts-admin.enc` (DPAPI / `safeStorage`),
 * puis le fichier fourni `{userData}/data/acces_admin.env` (dev comme packagé),
 * puis repli `data/acces_admin.env` du répertoire de travail.
 *
 * Consommé par `UserStore` (`resolveAdminAccess` au constructeur) et `ipcAuthHandlers`
 * (`auth:setAdminCode` → `writeEncryptedAdminCode`).
 *
 * @module electron/store/core/adminAccess
 */

const fs = require("fs");
const path = require("path");
const { readEncryptedString, writeEncryptedString } = require("./safeStorageFile");

/** Nom du fichier `.env` legacy sous `data/`. */
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
 * Chemins candidats de `acces_admin.env`.
 * Toujours le fichier fourni dans `userData` d’abord (évite un code différent en `npm run dev`).
 *
 * @param {object} options
 * @param {boolean} [options.isPackaged=false] - Ajoute les replis voisin de l’exe si packagé.
 * @param {string} [options.userDataPath] - Dossier `userData` déjà connu.
 * @returns {string[]} Chemins absolus, sans doublon, dans l'ordre de test.
 */
function resolveAdminEnvCandidates({ isPackaged = false, userDataPath } = {}) {
  const candidates = new Set();
  const push = (value) => {
    if (value) candidates.add(path.resolve(value));
  };

  const explicitUserData = String(userDataPath || "").trim();
  if (explicitUserData) {
    push(path.join(explicitUserData, "data", ADMIN_ENV_FILE_NAME));
  } else {
    try {
      const { app } = require("electron");
      push(path.join(app.getPath("userData"), "data", ADMIN_ENV_FILE_NAME));
    } catch {
      /* tests hors Electron */
    }
  }

  push(path.join(process.cwd(), "data", ADMIN_ENV_FILE_NAME));

  if (!isPackaged) return [...candidates];

  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR || "";
  if (portableExeDir) {
    push(path.join(portableExeDir, "data", ADMIN_ENV_FILE_NAME));
  }
  try {
    const { app } = require("electron");
    push(path.join(path.dirname(app.getPath("exe")), "data", ADMIN_ENV_FILE_NAME));
  } catch {
    /* tests hors Electron */
  }
  return [...candidates];
}

/**
 * Résout le chemin du fichier chiffré `gts-admin.enc`.
 *
 * @param {string} [userDataPath] - Dossier `userData` déjà connu ; sinon `app.getPath("userData")`.
 * @returns {string|null} Chemin absolu, ou `null` hors Electron sans `userDataPath`.
 */
function resolveAdminEncFilePath(userDataPath) {
  const base = String(userDataPath || "").trim();
  if (base) return path.join(base, ADMIN_ENC_FILE_NAME);
  try {
    const { app } = require("electron");
    return path.join(app.getPath("userData"), ADMIN_ENC_FILE_NAME);
  } catch {
    return null;
  }
}

/**
 * Lit le code administrateur depuis le premier `acces_admin.env` utilisable (mode legacy).
 *
 * @param {object} [options]
 * @param {boolean} [options.isPackaged=false] - Élargit la recherche au voisin de l'exe si packagé.
 * @param {string} [options.userDataPath] - Dossier `userData` Electron déjà connu.
 * @returns {string|null} Code maître, ou `null` si aucun fichier / aucune clé reconnue.
 */
function readAdminMasterCode({ isPackaged = false, userDataPath } = {}) {
  for (const candidate of resolveAdminEnvCandidates({ isPackaged, userDataPath })) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = parseDotEnvFile(fs.readFileSync(candidate, "utf-8"));
      const code = ADMIN_MASTER_CODE_KEYS.map((key) => String(parsed[key] || "").trim()).find(Boolean);
      if (code) return code;
    } catch {
      /* fichier illisible : candidat suivant */
    }
  }
  return null;
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
 * Ordre : fichier chiffré, puis `{userData}/data/acces_admin.env`, puis `.env` du CWD.
 *
 * @param {object} [options]
 * @param {boolean} [options.isPackaged=false] - Élargit la recherche `.env` au voisin de l'exe.
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
  const code = readAdminMasterCode({
    isPackaged: Boolean(options.isPackaged),
    userDataPath: options.userDataPath
  });
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
