/**
 * Gestion des sessions applicatives côté processus principal Electron.
 *
 * Jetons opaques en mémoire (`Map`), une session active par utilisateur sur le poste.
 * TTL 13 h (aligné sur les vacations de 12 h).
 *
 * En développement non packagé : persistance chiffrée optionnelle (`safeStorage` / DPAPI)
 * dans `userData/gts-sessions.enc`. En production : mémoire uniquement.
 *
 * Consommé par `electron/main.js` (auth IPC, contexte requête, badge utilisateurs connectés).
 *
 * @module electron/store/core/session
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { readEncryptedString, writeEncryptedString } = require("./safeStorageFile");

/** Durée de vie d'une session : 13 h (cohérent avec les vacations de 12 h). */
const SESSION_TTL_MS = 13 * 60 * 60 * 1000;

/** Jetons de session → `{ username, createdAt }`. */
const sessions = new Map();

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Chemin du fichier sessions chiffré, uniquement en dev non packagé.
 *
 * @returns {string|null}
 */
function getDevPersistPath() {
  try {
    const { app } = require("electron");
    if (app.isPackaged || typeof app.getPath !== "function") return null;
    return path.join(app.getPath("userData"), "gts-sessions.enc");
  } catch {
    return null;
  }
}

/**
 * Invalide les autres sessions du même utilisateur (une session active par login).
 *
 * @param {string} username - Identifiant de connexion (casse ignorée).
 * @returns {void}
 */
function revokeSessionsForUser(username) {
  const targetUsername = normalizeUsername(username);
  let changed = false;
  for (const [token, rec] of sessions) {
    if (normalizeUsername(rec.username) !== targetUsername) continue;
    sessions.delete(token);
    changed = true;
  }
  if (changed) persistToDisk();
}

/**
 * En dev uniquement : chiffre et persiste les sessions. En production : no-op.
 *
 * @returns {void}
 */
function persistToDisk() {
  const filePath = getDevPersistPath();
  if (!filePath) return;
  try {
    const entries = {};
    for (const [token, rec] of sessions) {
      entries[token] = { username: rec.username, createdAt: rec.createdAt };
    }
    writeEncryptedString(filePath, JSON.stringify({ version: 3, entries }));
  } catch (err) {
    console.error("[session] Échec persistance chiffrée:", err?.message || err);
  }
}

/**
 * En dev uniquement : recharge les sessions depuis le disque (ignore les jetons expirés
 * et les anciens scopes hors PostgreSQL).
 *
 * @returns {void}
 */
function loadPersistedSessions() {
  const filePath = getDevPersistPath();
  if (!filePath || !fs.existsSync(filePath)) return;
  const plain = readEncryptedString(filePath);
  if (!plain) return;
  try {
    const raw = JSON.parse(plain);
    const entries = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
    const now = Date.now();
    for (const [token, rec] of Object.entries(entries)) {
      if (!token || !rec?.username) continue;
      const legacyScope = String(rec.scope || "postgres").trim().toLowerCase();
      if (legacyScope !== "postgres") continue;
      const createdAt = Number(rec.createdAt) || now;
      if (now - createdAt >= SESSION_TTL_MS) continue;
      const username = normalizeUsername(rec.username);
      const existing = [...sessions.entries()].find(
        ([, value]) => normalizeUsername(value.username) === username
      );
      if (!existing) {
        sessions.set(token, { username, createdAt });
        continue;
      }
      const [existingToken, existingRec] = existing;
      if (createdAt > Number(existingRec.createdAt || 0)) {
        sessions.delete(existingToken);
        sessions.set(token, { username, createdAt });
      }
    }
  } catch (err) {
    console.error("[session] Échec chargement sessions chiffrées:", err?.message || err);
  }
}

/**
 * Ouvre une session après authentification réussie.
 *
 * @param {string} username - Login validé.
 * @returns {string} Jeton hexadécimal (64 caractères).
 */
function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  const normalizedUsername = normalizeUsername(username);
  revokeSessionsForUser(normalizedUsername);
  sessions.set(token, { username: normalizedUsername, createdAt: Date.now() });
  persistToDisk();
  return token;
}

/**
 * Supprime un jeton et persiste si la Map a changé.
 *
 * @param {string} token
 * @returns {void}
 */
function dropSession(token) {
  if (sessions.delete(token)) persistToDisk();
}

/**
 * Valide le jeton et retourne le profil utilisateur actif (cache PG / `getCachedUserRow`).
 *
 * @param {string|null|undefined} token
 * @param {import('../../userStore')} userStore
 * @returns {null|{ expired: true }|{ unavailable: true }|{ missingAccount: true }|{ username: string, fullName: string, role: string, managerProfile: string|null }}
 */
function validateSession(token, userStore) {
  if (!token || typeof token !== "string" || !userStore) return null;
  const rec = sessions.get(token);
  if (!rec) return null;
  if (Date.now() - rec.createdAt >= SESSION_TTL_MS) {
    dropSession(token);
    return { expired: true };
  }
  const cache = userStore._usersByUsernameCache;
  const cacheReady = cache instanceof Map && cache.size > 0;
  const row = typeof userStore.getCachedUserRow === "function" ? userStore.getCachedUserRow(rec.username) : null;
  if (!row) {
    // Cache pas encore chargé / vidé pendant une reconnexion PG : ne pas révoquer le jeton
    // (sinon tous les IPC parallèles tombent en SESSION_INVALID et spamment l'UI).
    if (!cacheReady) {
      return { unavailable: true };
    }
    dropSession(token);
    return { missingAccount: true };
  }
  return {
    username: row.username,
    fullName: String(row.full_name || "").trim(),
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
  if (token && typeof token === "string") dropSession(token);
}

/**
 * Vide toutes les sessions en mémoire (reset applicatif).
 *
 * @returns {void}
 */
function clearAllSessions() {
  sessions.clear();
  persistToDisk();
}

/**
 * Indique si le jeton est encore dans la mémoire du poste et dans le délai de 13 h.
 * Ne consulte pas le cache utilisateurs : un jeton vivant reste valable si PostgreSQL
 * est momentanément injoignable (quitter l'application pendant une panne).
 *
 * @param {unknown} token
 * @returns {boolean}
 */
function isLiveSessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const rec = sessions.get(token);
  if (!rec) return false;
  if (Date.now() - rec.createdAt >= SESSION_TTL_MS) {
    dropSession(token);
    return false;
  }
  return true;
}

/**
 * Logins ayant une session non expirée (badge « connecté » : `users:getActiveSessions`).
 *
 * @returns {Set<string>} Usernames normalisés en minuscules.
 */
function getActiveUsernames() {
  const now = Date.now();
  const active = new Set();
  for (const [, rec] of sessions) {
    if (now - rec.createdAt < SESSION_TTL_MS) active.add(rec.username);
  }
  return active;
}

module.exports = {
  createSession,
  validateSession,
  revokeSession,
  clearAllSessions,
  loadPersistedSessions,
  getActiveUsernames,
  isLiveSessionToken
};
