const fs = require("fs");
const path = require("path");

const ADMIN_ENV_FILE_NAME = "acces_admin.env";
const ADMIN_MASTER_CODE_KEY = "GTS_ADMIN_MASTER_CODE";
const ADMIN_MASTER_CODE_KEYS = [
  "GTS_ADMIN_MASTER_CODE",
  "ADMIN_MASTER_CODE",
  "GTS_ADMIN_CODE",
  "GORON_GTS_ADMIN_MASTER_CODE"
];
/** Nom du fichier chiffré via safeStorage (DPAPI sous Windows). */
const ADMIN_ENC_FILE_NAME = "gts-admin.enc";

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

function readAdminMasterCode({ isPackaged = false } = {}) {
  const candidates = resolveAdminEnvCandidates({ isPackaged });
  for (const candidate of candidates) {
    try {
      const resolvedPath = path.resolve(candidate);
      if (!fs.existsSync(resolvedPath)) continue;
      const rawContent = fs.readFileSync(resolvedPath, "utf-8");
      const parsed = parseDotEnvFile(rawContent);
      const code = ADMIN_MASTER_CODE_KEYS
        .map((key) => String(parsed[key] || "").trim())
        .find((value) => Boolean(value));
      if (!code) {
        return { code: null, sourcePath: resolvedPath, exists: true };
      }
      return { code, sourcePath: resolvedPath, exists: true };
    } catch {
      // Ignore invalid/unreadable files and continue with next candidate.
    }
  }
  return { code: null, sourcePath: null, exists: false };
}

/**
 * Lit le code admin depuis le fichier chiffré (DPAPI/safeStorage).
 * Retourne null si le fichier est absent, invalide ou si safeStorage n'est pas disponible.
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
 * Chiffre et enregistre le code admin dans le fichier DPAPI.
 * Lève une erreur si safeStorage n'est pas disponible.
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
  ADMIN_ENV_FILE_NAME,
  ADMIN_MASTER_CODE_KEY,
  ADMIN_ENC_FILE_NAME,
  readAdminMasterCode,
  readEncryptedAdminCode,
  writeEncryptedAdminCode
};
