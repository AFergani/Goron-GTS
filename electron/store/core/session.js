/**
 * Gestion des sessions applicatives côté processus principal Electron.
 *
 * Jetons opaques en mémoire (`Map`), liés à une base SQLite active et un utilisateur.
 * Une seule session active par couple (base, utilisateur) ; invalidation si la base change.
 * TTL 13 h (aligné sur les vacations de 12 h).
 *
 * En développement non packagé : persistance chiffrée optionnelle (`safeStorage` / DPAPI)
 * dans `userData/gts-sessions.enc`. En production : mémoire uniquement, reconnexion à chaque lancement.
 *
 * Consommé par `electron/main.js` (auth IPC, contexte requête, badge utilisateurs connectés).
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** Durée de vie d'une session : 13 h (cohérent avec les vacations de 12 h). */
const SESSION_TTL_MS = 13 * 60 * 60 * 1000;

/** Jetons de session → contexte minimal (invalidés si la base active change). */
const sessions = new Map();

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeDbPath(value) {
  return path.normalize(String(value || ""));
}

/**
 * Invalide les autres sessions d'un même utilisateur sur la même base.
 * Permet d'imposer « une seule session active par utilisateur ».
 *
 * @param {string} dbPath - Chemin normalisé de la base active.
 * @param {string} username - Identifiant de connexion (casse ignorée).
 * @param {string|null} [exceptToken=null] - Jeton à conserver (session en cours de création).
 * @returns {void}
 */
function revokeSessionsForUser(dbPath, username, exceptToken = null) {
  const targetDbPath = normalizeDbPath(dbPath);
  const targetUsername = normalizeUsername(username);
  let changed = false;
  for (const [token, rec] of sessions) {
    if (exceptToken && token === exceptToken) continue;
    if (normalizeDbPath(rec.dbPath) !== targetDbPath) continue;
    if (normalizeUsername(rec.username) !== targetUsername) continue;
    sessions.delete(token);
    changed = true;
  }
  if (changed) {
    persistToDisk();
  }
}

/**
 * Indique si l'application tourne en mode développement (non packagée).
 *
 * @returns {boolean}
 */
function isDevMode() {
  try {
    const { app } = require("electron");
    return !app.isPackaged;
  } catch {
    return false;
  }
}

/**
 * Chemin du fichier de persistance des sessions (dev uniquement).
 *
 * @returns {string|null}
 */
function getPersistPath() {
  try {
    const { app } = require("electron");
    if (!app?.getPath) return null;
    return path.join(app.getPath("userData"), "gts-sessions.enc");
  } catch {
    return null;
  }
}

/**
 * En dev uniquement : chiffre et persiste les sessions sur disque via `safeStorage` (DPAPI).
 * En production : aucune écriture — les sessions vivent uniquement en mémoire.
 *
 * @returns {void}
 */
function persistToDisk() {
  if (!isDevMode()) return;
  const p = getPersistPath();
  if (!p) return;
  try {
    const { safeStorage } = require("electron");
    if (!safeStorage.isEncryptionAvailable()) return;
    const entries = {};
    for (const [token, rec] of sessions) {
      entries[token] = { dbPath: rec.dbPath, username: rec.username, createdAt: rec.createdAt };
    }
    const plain = JSON.stringify({ version: 2, entries });
    const encrypted = safeStorage.encryptString(plain);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, encrypted.toString("base64"), "utf-8");
  } catch (err) {
    console.error("[session] Échec persistance chiffrée:", err?.message || err);
  }
}

/**
 * En dev uniquement : charge et déchiffre les sessions depuis le disque.
 * En production : ne fait rien — reconnexion obligatoire à chaque lancement.
 *
 * @returns {void}
 */
function loadPersistedSessions() {
  if (!isDevMode()) return;
  const p = getPersistPath();
  if (!p || !fs.existsSync(p)) return;
  try {
    const { safeStorage } = require("electron");
    if (!safeStorage.isEncryptionAvailable()) return;
    const encryptedBase64 = fs.readFileSync(p, "utf-8").trim();
    if (!encryptedBase64) return;
    const encryptedBuffer = Buffer.from(encryptedBase64, "base64");
    const plain = safeStorage.decryptString(encryptedBuffer);
    const raw = JSON.parse(plain);
    const entries = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
    const now = Date.now();
    for (const [token, rec] of Object.entries(entries)) {
      if (!token || !rec?.dbPath || !rec?.username) continue;
      const createdAt = Number(rec.createdAt) || now;
      if (now - createdAt >= SESSION_TTL_MS) continue;
      const dbPath = normalizeDbPath(rec.dbPath);
      const username = normalizeUsername(rec.username);
      const existing = [...sessions.entries()].find(
        ([, value]) => normalizeDbPath(value.dbPath) === dbPath && normalizeUsername(value.username) === username
      );
      if (!existing) {
        sessions.set(token, { dbPath, username, createdAt });
        continue;
      }
      const [existingToken, existingRec] = existing;
      if (createdAt > Number(existingRec.createdAt || 0)) {
        sessions.delete(existingToken);
        sessions.set(token, { dbPath, username, createdAt });
      }
    }
  } catch (err) {
    // Fichier corrompu ou ancienne version non chiffrée → on ignore silencieusement.
    console.error("[session] Échec chargement sessions chiffrées:", err?.message || err);
  }
}

/**
 * Ouvre une session après authentification réussie.
 *
 * Révoque d'abord les autres jetons du même utilisateur sur la même base, puis émet un nouveau token.
 *
 * @param {string} dbPath - Chemin de la base SQLite courante.
 * @param {string} username - Login validé.
 * @returns {string} Jeton hexadécimal (64 caractères).
 */
function createSession(dbPath, username) {
  const token = crypto.randomBytes(32).toString("hex");
  const normalizedDbPath = normalizeDbPath(dbPath);
  const normalizedUsername = normalizeUsername(username);
  revokeSessionsForUser(normalizedDbPath, normalizedUsername);
  sessions.set(token, {
    dbPath: normalizedDbPath,
    username: normalizedUsername,
    createdAt: Date.now()
  });
  persistToDisk();
  return token;
}

/**
 * Valide le jeton contre la base courante et retourne le profil utilisateur actif.
 *
 * @param {string|null|undefined} token - Jeton transmis par le renderer.
 * @param {import('../userStore')} userStore - Store lié à la base active (`dbPath`, `db`).
 * @returns {null|{ expired: true }|{ username: string, role: string, managerProfile: string|null }}
 *   `null` si jeton absent, inconnu, base différente ou compte inactif ;
 *   `{ expired: true }` si le TTL de 13 h est dépassé.
 */
function validateSession(token, userStore) {
  if (!token || typeof token !== "string") return null;
  const rec = sessions.get(token);
  if (!rec || !userStore?.dbPath) return null;
  if (Date.now() - rec.createdAt >= SESSION_TTL_MS) {
    sessions.delete(token);
    persistToDisk();
    return { expired: true };
  }
  if (path.normalize(rec.dbPath) !== path.normalize(userStore.dbPath)) {
    sessions.delete(token);
    persistToDisk();
    return null;
  }
  const row = userStore.db
    .prepare(
      `SELECT username, role, manager_profile
       FROM users
       WHERE lower(username) = ? AND is_active = 1
       LIMIT 1`
    )
    .get(rec.username);
  if (!row) {
    sessions.delete(token);
    persistToDisk();
    return null;
  }
  return {
    username: row.username,
    role: row.role,
    managerProfile: row.manager_profile || null
  };
}

/**
 * Révoque un jeton (déconnexion explicite).
 *
 * @param {string|null|undefined} token
 * @returns {void}
 */
function revokeSession(token) {
  if (token && typeof token === "string" && sessions.delete(token)) {
    persistToDisk();
  }
}

/**
 * Vide toutes les sessions en mémoire (changement de base, reset applicatif).
 *
 * @returns {void}
 */
function clearAllSessions() {
  sessions.clear();
  persistToDisk();
}

/**
 * Retourne l'ensemble des logins ayant une session active (non expirée).
 * Utilisé pour le badge « connecté » dans la liste des utilisateurs (`users:getActiveSessions`).
 *
 * @returns {Set<string>} Usernames normalisés en minuscules.
 */
function getActiveUsernames() {
  const now = Date.now();
  const active = new Set();
  for (const [, rec] of sessions) {
    if (now - rec.createdAt < SESSION_TTL_MS) {
      active.add(rec.username);
    }
  }
  return active;
}

module.exports = {
  createSession,
  validateSession,
  revokeSession,
  clearAllSessions,
  loadPersistedSessions,
  getActiveUsernames
};
