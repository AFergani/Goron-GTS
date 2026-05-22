/**
 * Accès administrateur local (profil DEV) : lecture du code maître depuis un fichier chiffré
 * ou, en repli, depuis `data/acces_admin.env`.
 *
 * Consommé par `bootstrap.js` (`resolveAdminAccess` au démarrage du `UserStore`) et par
 * `ipcAuthHandlers` (`auth:setAdminCode` → `writeEncryptedAdminCode`).
 */

const fs = require("fs");
const path = require("path");

/** Nom du fichier .env legacy sous `data/` (déploiement non packagé ou rétrocompat). */
const ADMIN_ENV_FILE_NAME = "acces_admin.env";
/** Clés acceptées dans le fichier .env pour le code maître (première valeur non vide gagne). */
const ADMIN_MASTER_CODE_KEYS = [
  "GTS_ADMIN_MASTER_CODE",
  "ADMIN_MASTER_CODE",
  "GTS_ADMIN_CODE",
  "GORON_GTS_ADMIN_MASTER_CODE"
];
/** Nom du fichier chiffré via safeStorage (DPAPI sous Windows), stocké dans `userData`. */
const ADMIN_ENC_FILE_NAME = "gts-admin.enc";

/**
 * Parse un contenu type fichier `.env` (lignes `CLE=valeur`, commentaires `#`).
 *
 * @param {string} content - Contenu brut du fichier.
 * @returns {Record<string, string>} Paires clé/valeur ; BOM UTF-8 en tête de fichier toléré.
 */
function parseDotEnvFile(content) {
  const entries = {};
  const lines = String(content || "")
    // Tolérance fichiers .env créés avec BOM UTF-8 sous Windows.
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed
      .slice(0, equalsIndex)
      .replace(/^\uFEFF/, "")
      .trim();
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
 * Liste les chemins candidats de `acces_admin.env` selon le mode d'exécution (dev, portable, installé).
 *
 * @param {object} options
 * @param {boolean} options.isPackaged - `true` si application Electron packagée.
 * @returns {string[]} Chemins absolus à tester dans l'ordre.
 */
function resolveAdminEnvCandidates({ isPackaged }) {
  if (!isPackaged) {
    return [path.join(process.cwd(), "data", ADMIN_ENV_FILE_NAME)];
  }
  const candidates = new Set();
  const push = (value) => {
    if (!value) return;
    candidates.add(path.resolve(value));
  };

  // Compat historique: chemin relatif au CWD process.
  push(path.join("data", ADMIN_ENV_FILE_NAME));
  push(path.join(process.cwd(), "data", ADMIN_ENV_FILE_NAME));

  // Cas portable: voisin de l'exécutable / parent.
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR || null;
  if (portableExeDir) {
    push(path.join(portableExeDir, "data", ADMIN_ENV_FILE_NAME));
    push(path.join(path.dirname(portableExeDir), "data", ADMIN_ENV_FILE_NAME));
  }

  // Cas installé: autour du répertoire exécutable.
  try {
    const { app } = require("electron");
    const exeDir = path.dirname(app.getPath("exe"));
    const exeParentDir = path.dirname(exeDir);
    push(path.join(exeDir, "data", ADMIN_ENV_FILE_NAME));
    push(path.join(exeParentDir, "data", ADMIN_ENV_FILE_NAME));

    // Cas demandé: Documents\Goron GTS\Goron-GTS\data\acces_admin.env
    const documentsDir = app.getPath("documents");
    push(path.join(documentsDir, "Goron GTS", "Goron-GTS", "data", ADMIN_ENV_FILE_NAME));
  } catch {
    // Ignore si Electron n'est pas disponible (tests).
  }

  return [...candidates];
}

/**
 * Lit le code administrateur depuis le premier `acces_admin.env` trouvé (mode legacy).
 *
 * @param {object} [options]
 * @param {boolean} [options.isPackaged=false] - Élargit les chemins de recherche si packagé.
 * @returns {{ code: string|null, sourcePath: string|null, exists: boolean }}
 *   `exists: true` si un fichier a été trouvé même sans clé reconnue.
 */
function readAdminMasterCode({ isPackaged = false } = {}) {
  const candidates = resolveAdminEnvCandidates({ isPackaged });
  for (const candidate of candidates) {
    try {
      const resolvedPath = path.resolve(candidate);
      if (!fs.existsSync(resolvedPath)) continue;
      const rawContent = fs.readFileSync(resolvedPath, "utf-8");
      const parsed = parseDotEnvFile(rawContent);
      const code = ADMIN_MASTER_CODE_KEYS.map((key) => String(parsed[key] || "").trim()).find((value) =>
        Boolean(value)
      );
      if (!code) {
        return { code: null, sourcePath: resolvedPath, exists: true };
      }
      return { code, sourcePath: resolvedPath, exists: true };
    } catch {
      // Fichier invalide : essayer le candidat suivant.
    }
  }
  return { code: null, sourcePath: null, exists: false };
}

/**
 * Lit le code admin depuis le fichier chiffré (DPAPI / `safeStorage` Electron).
 *
 * @param {string} encFilePath - Chemin absolu, typiquement `{userData}/gts-admin.enc`.
 * @returns {string|null} Code en clair ou `null` si absent, illisible ou chiffrement indisponible.
 */
function readEncryptedAdminCode(encFilePath) {
  try {
    const { safeStorage } = require("electron");
    if (!safeStorage.isEncryptionAvailable()) return null;
    if (!fs.existsSync(encFilePath)) return null;
    const encryptedBase64 = fs.readFileSync(encFilePath, "utf-8").trim();
    if (!encryptedBase64) return null;
    const encryptedBuffer = Buffer.from(encryptedBase64, "base64");
    const code = safeStorage.decryptString(encryptedBuffer);
    return String(code || "").trim() || null;
  } catch {
    return null;
  }
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
  const { safeStorage } = require("electron");
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Le chiffrement système (safeStorage) n'est pas disponible sur ce poste.");
  }
  const encryptedBuffer = safeStorage.encryptString(String(code));
  fs.mkdirSync(path.dirname(encFilePath), { recursive: true });
  fs.writeFileSync(encFilePath, encryptedBuffer.toString("base64"), "utf-8");
}

module.exports = {
  ADMIN_ENC_FILE_NAME,
  readAdminMasterCode,
  readEncryptedAdminCode,
  writeEncryptedAdminCode
};
