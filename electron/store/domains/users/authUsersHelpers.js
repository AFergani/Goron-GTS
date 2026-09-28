/**
 * Helpers comptes utilisateurs : cache, mot de passe, hiérarchie, unicité.
 *
 * Utilisés par `authUsers.js` (login / CRUD). Ne pas appeler depuis l'UI.
 *
 * @module electron/store/domains/users/authUsersHelpers
 */

const crypto = require("crypto");
const { hashPassword, verifyPassword } = require("../../core/password");
const { USERS_SELECT } = require("./userMapping");

const MANAGER_PROFILES = ["SUPERVISEUR", "RESPONSABLE_STATION", "DIRECTEUR_STATION"];
/** Opérateur avec la page Remarques vidéo. Même rang hiérarchique qu'un opérateur. */
const OPERATOR_PLUS_PROFILE = "OPERATEUR_PLUS";
const MAX_FAILED_ATTEMPTS = 5;
/**
 * Le verrouillage après échecs de connexion est temporaire : il protège du bruteforce
 * sans immobiliser un agent qui a simplement mal saisi son code un dimanche.
 * Un mot de passe réellement oublié reste hors de portée de ce délai.
 */
const AUTO_UNLOCK_DELAY_MS = 15 * 60 * 1000;
/** Longueur minimale d'un motif d'audit, pour éviter les justifications vides du type « ok ». */
const MIN_AUDIT_REASON_LENGTH = 5;
const PASSWORD_BLACKLIST = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "0000", "0000000", "00000000",
  "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
  "000000", "1111", "1234", "12345", "123123", "654321", "987654321", "password", "motdepasse",
  "azerty", "qwerty", "azertyuiop", "qwertyuiop", "abcdef", "abc123", "iloveyou", "letmein",
  "welcome", "admin", "pass", "test", "soleil", "bonjour", "bienvenue", "football", "dragon",
  "master", "superman", "monkey", "shadow", "michael", "jessica", "password1", "password123"
]);

/**
 * Exige la persistance PostgreSQL des utilisateurs.
 *
 * @param {import('../../../userStore')} store
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requirePersistence(store) {
  if (typeof store.assertPostgresAvailableForUsers === "function") {
    store.assertPostgresAvailableForUsers();
  }
  const db = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  if (!db) {
    store.fail(
      "users",
      "Base PostgreSQL inaccessible. La gestion des comptes et la connexion sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return db;
}

/**
 * Recharge le cache des comptes depuis PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<Map<string, object>>}
 */
async function refreshUsersCache(store) {
  const db = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  if (!db || !db.isOpen()) {
    return store._usersByUsernameCache instanceof Map ? store._usersByUsernameCache : new Map();
  }
  const rows = await db.all(`SELECT ${USERS_SELECT} FROM users`, []);
  const map = new Map();
  for (const row of rows) {
    const key = String(row.username || "").trim().toLowerCase();
    if (key) map.set(key, row);
  }
  store._usersByUsernameCache = map;
  return map;
}

/**
 * Recherche synchrone d'un compte actif pour les sessions et le RBAC.
 *
 * @param {import('../../../userStore')} store
 * @param {string} username
 * @returns {object|null}
 */
function getCachedUserRow(store, username) {
  const key = String(username || "").trim().toLowerCase();
  if (!key) return null;
  if (store._usersByUsernameCache instanceof Map) {
    const row = store._usersByUsernameCache.get(key);
    if (row && Number(row.is_active) === 1) return row;
    if (row && row.is_active === true) return row;
  }
  return null;
}

/** @param {unknown} value @returns {string} */
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

/** @param {unknown} value @returns {string} */
function normalizeDisplayName(value) {
  return String(value || "").trim().toLowerCase();
}

/** @param {unknown} value @returns {boolean} */
function isDatabaseBooleanTrue(value) {
  return Boolean(Number(value));
}

/** @returns {string} */
function generateLoginIdentifier() {
  return `usr-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Refuse les mots de passe présents dans la liste noire.
 *
 * @param {string} password
 * @returns {void}
 */
function assertPasswordNotBlacklisted(password) {
  if (PASSWORD_BLACKLIST.has(String(password || "").toLowerCase())) {
    throw new Error("[AUTH_PASSWORD_BLACKLISTED] Ce mot de passe est trop simple. Choisissez un mot de passe plus original.");
  }
}

/**
 * Vérifie les liens PostgreSQL d'un compte avant suppression (audit, users, domaines métier).
 *
 * @param {import('../../../userStore')} store
 * @param {string} username
 * @returns {Promise<{hasRelated: boolean, related: Record<string, boolean>}>}
 */
async function hasRelatedDataForUserDeletion(store, username) {
  const db = requirePersistence(store);
  const u = normalizeUsername(username);
  const auditDb = typeof store.getAuditPersistence === "function" ? store.getAuditPersistence() : null;
  const hasAudit = Boolean(
    auditDb && auditDb.isOpen()
      ? await auditDb.get(
          "SELECT 1 FROM audit_logs WHERE actor_username = ? OR target_username = ? LIMIT 1",
          [u, u]
        )
      : null
  );
  const hasCreatedOrUpdatedUsers = Boolean(
    await db.get(
      "SELECT 1 FROM users WHERE (created_by = ? OR updated_by = ?) AND username <> ? LIMIT 1",
      [u, u, u]
    )
  );
  const pgHas = async (sql, params) => Boolean(await db.get(sql, params));
  const related = {
    audit: hasAudit,
    users: hasCreatedOrUpdatedUsers,
    fransorClosures: await pgHas(
      "SELECT 1 FROM fransor_closures WHERE created_by = ? OR updated_by = ? LIMIT 1",
      [u, u]
    ),
    fransorAccompagnements: await pgHas(
      "SELECT 1 FROM fransor_accompagnements WHERE created_by = ? OR updated_by = ? LIMIT 1",
      [u, u]
    ),
    pendingSites: await pgHas(
      "SELECT 1 FROM data_site_pending WHERE created_by = ? LIMIT 1",
      [u]
    ),
    pendingIntervenants: await pgHas(
      "SELECT 1 FROM data_intervenant_pending WHERE created_by = ? LIMIT 1",
      [u]
    )
  };
  return { hasRelated: Object.values(related).some(Boolean), related };
}

/**
 * Exige un compte administrateur station actif depuis le cache PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {string} requesterUsername
 * @param {object} roles
 * @param {string} source
 * @returns {void}
 */
function ensureStationAdminAccess(store, requesterUsername, roles, source) {
  if (!(store._usersByUsernameCache instanceof Map) || store._usersByUsernameCache.size === 0) {
    store.fail(source, "Base PostgreSQL inaccessible. Les droits utilisateur ne peuvent pas être vérifiés.", "PG_UNAVAILABLE");
  }
  const requester = getCachedUserRow(store, requesterUsername);
  if (!requester) {
    store.fail(source, "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }
  if (requester.role === roles.DEV) return;
  if (
    requester.role !== roles.RESPONSABLE ||
    !["DIRECTEUR_STATION", "RESPONSABLE_STATION"].includes(requester.manager_profile)
  ) {
    store.fail(
      source,
      "Acces refuse: action reservee au directeur de station, responsable de station ou au dev.",
      "AUTH_FORBIDDEN",
      { requesterUsername }
    );
  }
}

/**
 * Indique si le compte a le profil station admin (DEV, directeur ou responsable de station).
 *
 * @param {object|null} requester - Ligne utilisateur du cache.
 * @param {{ DEV: string, RESPONSABLE: string }} roles
 * @returns {boolean}
 */
function isStationAdminRequester(requester, roles) {
  if (!requester) return false;
  if (requester.role === roles.DEV) return true;
  return requester.role === roles.RESPONSABLE &&
    ["DIRECTEUR_STATION", "RESPONSABLE_STATION"].includes(requester.manager_profile);
}

/** @returns {boolean} */
function isSuperviseurRequester(requester, roles) {
  return Boolean(requester && requester.role === roles.RESPONSABLE && requester.manager_profile === "SUPERVISEUR");
}

/**
 * Rang hiérarchique d'un compte : opérateur 0, superviseur 1,
 * responsable de station 2, directeur de station 3, Admin 4.
 *
 * @returns {number}
 */
function getUserHierarchyRank(userRow, roles) {
  if (!userRow) return -1;
  if (userRow.role === roles.DEV) return 4;
  if (userRow.role === roles.OPERATEUR) return 0;
  if (userRow.role !== roles.RESPONSABLE) return -1;
  if (userRow.manager_profile === "DIRECTEUR_STATION") return 3;
  if (userRow.manager_profile === "RESPONSABLE_STATION") return 2;
  return 1;
}

/** @returns {number} */
function getRequesterHierarchyRank(requesterRow, roles) {
  return requesterRow?.role === roles.DEV ? 100 : getUserHierarchyRank(requesterRow, roles);
}

/**
 * Règle de hiérarchie unique pour toute action de gestion (modification,
 * réinitialisation, déverrouillage, désactivation, réactivation) : on n'agit que
 * sur un compte de rang inférieur ou égal au sien. Le compte Admin reste intouchable.
 *
 * @returns {void}
 */
function assertCanActOnUser(store, requesterRow, targetRow, roles, source) {
  if (targetRow?.role === roles.DEV) {
    store.fail(source, "Le compte Admin ne peut pas être modifié.", "USER_PROTECTED");
  }
  const requesterRank = getRequesterHierarchyRank(requesterRow, roles);
  const targetRank = getUserHierarchyRank(targetRow, roles);
  if (requesterRank < 0 || targetRank < 0 || requesterRank < targetRank) {
    store.fail(source, "Action refusée : hiérarchie insuffisante pour ce compte.", "AUTH_FORBIDDEN");
  }
}

/**
 * Normalise le profil métier stocké dans `manager_profile`.
 * Responsable : un des trois profils station. Opérateur : null ou Opérateur +.
 * L'Opérateur + ne change pas le rang (toujours 0).
 *
 * @param {object} store
 * @param {string} role
 * @param {string|null|undefined} managerProfile
 * @param {object} roles
 * @param {string} source
 * @returns {string|null}
 */
function normalizeBusinessProfile(store, role, managerProfile, roles, source) {
  if (role === roles.RESPONSABLE) {
    if (!MANAGER_PROFILES.includes(managerProfile || "")) {
      store.fail(source, "Profil responsable invalide.", "USER_BAD_MANAGER_PROFILE", { managerProfile });
    }
    return managerProfile;
  }
  if (role === roles.OPERATEUR) {
    if (!managerProfile) return null;
    if (managerProfile === OPERATOR_PLUS_PROFILE) return OPERATOR_PLUS_PROFILE;
    store.fail(source, "Profil opérateur invalide.", "USER_BAD_MANAGER_PROFILE", { managerProfile });
  }
  return null;
}

/**
 * Empêche l'élévation de privilège : un compte ne peut jamais attribuer
 * (création ou modification, y compris sur lui-même) un rang supérieur au sien.
 *
 * @returns {void}
 */
function assertCanAssignRank(store, requesterRow, nextRole, nextManagerProfile, roles, source) {
  const nextRank = getUserHierarchyRank({ role: nextRole, manager_profile: nextManagerProfile }, roles);
  if (nextRank < 0 || nextRank > getRequesterHierarchyRank(requesterRow, roles)) {
    store.fail(
      source,
      "Action refusée : vous ne pouvez pas attribuer un niveau hiérarchique supérieur au vôtre.",
      "AUTH_FORBIDDEN"
    );
  }
}

/** Interdit les actions destructrices sur son propre compte (risque d'auto-verrouillage). @returns {void} */
function assertNotSelfTarget(store, requesterUsername, targetUsername, source, message) {
  if (normalizeUsername(requesterUsername) === normalizeUsername(targetUsername)) {
    store.fail(source, message, "AUTH_SELF_ACTION_FORBIDDEN");
  }
}

/** Motif d'audit obligatoire pour toute action de gestion de compte. @returns {string} */
function requireAuditReason(store, reason, source, label) {
  const normalized = String(reason || "").trim();
  if (normalized.length < MIN_AUDIT_REASON_LENGTH) {
    store.fail(
      source,
      `Le motif ${label} est obligatoire (${MIN_AUDIT_REASON_LENGTH} caractères minimum).`,
      "USER_REASON_REQUIRED"
    );
  }
  return normalized;
}

/**
 * Accès à la gestion des comptes : administrateurs station et superviseurs.
 * La portée réelle est ensuite bornée par `assertCanActOnUser`.
 *
 * @returns {object} Ligne utilisateur du demandeur.
 */
function ensureUserManagementAccess(store, requesterUsername, roles, source) {
  if (!(store._usersByUsernameCache instanceof Map) || store._usersByUsernameCache.size === 0) {
    store.fail(source, "Base PostgreSQL inaccessible. Les droits utilisateur ne peuvent pas être vérifiés.", "PG_UNAVAILABLE");
  }
  const requester = getCachedUserRow(store, requesterUsername);
  if (!isStationAdminRequester(requester, roles) && !isSuperviseurRequester(requester, roles)) {
    store.fail(source, "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }
  return requester;
}

/**
 * Indique si un autre compte actif porte déjà le même nom affiché (insensible à la casse).
 * Les comptes désactivés sont ignorés (historique autorisé).
 *
 * @param {import('../../../userStore')} store
 * @param {string} fullName
 * @param {string|null} [excludedUserId] - Identifiant à exclure (soi-même en modification / réactivation)
 * @returns {Promise<boolean>}
 */
async function isActiveFullNameUsedByAnotherUser(store, fullName, excludedUserId = null) {
  const db = requirePersistence(store);
  const normalized = normalizeDisplayName(fullName);
  if (!normalized) return false;
  const rows = await db.all(
    excludedUserId
      ? "SELECT id, is_active FROM users WHERE lower(full_name) = ? AND id <> ?"
      : "SELECT id, is_active FROM users WHERE lower(full_name) = ?",
    excludedUserId ? [normalized, excludedUserId] : [normalized]
  );
  return rows.some((row) => isDatabaseBooleanTrue(row.is_active));
}

/**
 * Refuse un nom affiché déjà porté par un autre utilisateur actif.
 *
 * @param {import('../../../userStore')} store
 * @param {string} fullName
 * @param {string} source
 * @param {string|null} [excludedUserId]
 * @returns {Promise<void>}
 */
async function assertActiveFullNameUnique(store, fullName, source, excludedUserId = null) {
  if (await isActiveFullNameUsedByAnotherUser(store, fullName, excludedUserId)) {
    store.fail(
      source,
      "Un utilisateur actif porte déjà ce nom affiché.",
      "USER_ACTIVE_DISPLAY_NAME_TAKEN",
      { fullName: String(fullName || "").trim() }
    );
  }
}

/**
 * Vérifie l'unicité du couple nom affiché et mot de passe.
 *
 * @param {import('../../../userStore')} store
 * @param {string} fullName
 * @param {string} rawPassword
 * @param {string|null} [excludedUserId]
 * @returns {Promise<boolean>}
 */
async function isFullNamePasswordPairUsedByAnotherUser(store, fullName, rawPassword, excludedUserId = null) {
  const db = requirePersistence(store);
  const rows = await db.all(
    excludedUserId
      ? "SELECT id, password_hash, is_active FROM users WHERE lower(full_name) = ? AND id <> ?"
      : "SELECT id, password_hash, is_active FROM users WHERE lower(full_name) = ?",
    excludedUserId ? [normalizeDisplayName(fullName), excludedUserId] : [normalizeDisplayName(fullName)]
  );
  return rows.some((row) => isDatabaseBooleanTrue(row.is_active) && verifyPassword(rawPassword, row.password_hash));
}

/**
 * Retourne le hash si le couple nom et mot de passe est unique.
 *
 * @returns {Promise<string>}
 */
async function assertFullNamePasswordPairUnique(store, fullName, rawPassword, source, excludedUserId = null) {
  if (await isFullNamePasswordPairUsedByAnotherUser(store, fullName, rawPassword, excludedUserId)) {
    store.fail(
      source,
      "Ce nom affiché et ce mot de passe sont déjà utilisés sur un autre compte actif. Choisissez un mot de passe différent.",
      "AUTH_NAME_PASSWORD_PAIR_ALREADY_USED"
    );
  }
  return hashPassword(rawPassword);
}

/**
 * Génère un mot de passe temporaire unique.
 *
 * @returns {Promise<string>}
 */
async function generateUniqueTemporaryPasswordForFullName(store, fullName, excludedUserId = null) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%!";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const random = crypto.randomBytes(8);
    let candidate = "";
    for (const byte of random) candidate += alphabet[byte % alphabet.length];
    if (!(await isFullNamePasswordPairUsedByAnotherUser(store, fullName, candidate, excludedUserId))) {
      return candidate;
    }
  }
  store.fail(
    "users:passwordGeneration",
    "Impossible de générer un mot de passe temporaire unique pour ce nom affiché. Merci de réessayer.",
    "AUTH_TEMP_PASSWORD_GENERATION_FAILED"
  );
}

/**
 * Génère un login interne unique.
 *
 * @returns {Promise<string>}
 */
async function generateUniqueUsername(store) {
  const db = requirePersistence(store);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateLoginIdentifier();
    if (!(await db.get("SELECT id FROM users WHERE username = ? LIMIT 1", [candidate]))) return candidate;
  }
  store.fail("users:create", "Impossible de générer un identifiant interne unique.", "USER_ID_GENERATION_FAILED");
}

/**
 * Récupère le compte actif portant ce nom affiché (l'unicité est garantie sur les actifs).
 *
 * @returns {Promise<object|null>}
 */
async function getActiveUserByDisplayName(db, normalizedFullName) {
  const rows = await db.all(`SELECT ${USERS_SELECT} FROM users WHERE lower(full_name) = ?`, [normalizedFullName]);
  return rows.find((row) => isDatabaseBooleanTrue(row.is_active)) || null;
}

/**
 * Incrémente le compteur d'échecs d'un compte et le verrouille au seuil atteint.
 * Partagé par la connexion et la validation par un pair : aucun écran ne doit offrir
 * un chemin de bruteforce échappant au comptage.
 *
 * Le compte Admin est exclu : son accès repose sur le code maître du poste et non sur
 * `password_hash`, le verrouiller n'apporterait rien et priverait la station de son recours.
 *
 * @returns {Promise<void>}
 */
async function registerFailedLoginAttempt(store, db, userRow, roles) {
  if (userRow.role === roles.DEV) return;
  await db.transaction(async (tx) => {
    const row = await tx.get(`SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`, [userRow.username]);
    if (!row || !isDatabaseBooleanTrue(row.is_active)) return;
    const attempts = Number(row.failed_login_attempts || 0) + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    const nowIso = new Date().toISOString();
    await tx.run(
      "UPDATE users SET failed_login_attempts = ?, is_locked = ?, locked_at = ?, updated_at = ? WHERE username = ?",
      [attempts, locked, locked ? nowIso : null, nowIso, row.username]
    );
    if (locked) {
      store.logAudit({
        actorUsername: row.username,
        action: "AUTH_ACCOUNT_LOCKED",
        targetUsername: row.username,
        details: { reason: "Trop de tentatives de connexion échouées", attempts }
      });
    }
  });
  await refreshUsersCache(store);
}

/**
 * Libère les comptes dont le verrouillage temporaire a expiré.
 * Un verrou hérité sans horodatage (antérieur à cette fonctionnalité) est considéré comme expiré.
 *
 * @param {import('../../../userStore')} store
 * @param {object} db
 * @param {object[]} lockedRows - Lignes utilisateur actuellement verrouillées.
 * @returns {Promise<boolean>} Vrai s'il reste au moins un compte verrouillé.
 */
async function releaseExpiredLocks(store, db, lockedRows) {
  const now = Date.now();
  let stillLocked = false;
  for (const row of lockedRows) {
    const lockedAt = row.locked_at ? Date.parse(row.locked_at) : 0;
    if (Number.isFinite(lockedAt) && now - lockedAt < AUTO_UNLOCK_DELAY_MS) {
      stillLocked = true;
      continue;
    }
    await db.run(
      "UPDATE users SET failed_login_attempts = 0, is_locked = ?, locked_at = NULL, updated_at = ? WHERE username = ?",
      [false, new Date().toISOString(), row.username]
    );
    store.logAudit({
      actorUsername: row.username,
      action: "AUTH_ACCOUNT_AUTO_UNLOCKED",
      targetUsername: row.username,
      details: { reason: "Verrouillage temporaire expiré", delayMinutes: AUTO_UNLOCK_DELAY_MS / 60000 }
    });
  }
  return stillLocked;
}

/**
 * Vérifie les identifiants d'un compte, quel que soit l'écran qui les demande.
 *
 * Le compte Admin (DEV) n'a pas de mot de passe exploitable dans `users.password_hash` :
 * il s'authentifie avec le code maître du poste. Tout écran qui demande un mot de passe
 * doit passer par ici, sinon l'Admin y est systématiquement refusé.
 *
 * @returns {"ok"|"invalid"|"dev-code-unavailable"}
 */
function checkAccountCredentials(store, userRow, password, roles) {
  if (userRow.role === roles.DEV) {
    if (!store.devMasterCode) return "dev-code-unavailable";
    return password === store.devMasterCode ? "ok" : "invalid";
  }
  return verifyPassword(password, userRow.password_hash) ? "ok" : "invalid";
}

module.exports = {
  AUTO_UNLOCK_DELAY_MS,
  MANAGER_PROFILES,
  OPERATOR_PLUS_PROFILE,
  normalizeBusinessProfile,
  MIN_AUDIT_REASON_LENGTH,
  requirePersistence,
  refreshUsersCache,
  getCachedUserRow,
  normalizeUsername,
  normalizeDisplayName,
  isDatabaseBooleanTrue,
  generateLoginIdentifier,
  assertPasswordNotBlacklisted,
  hasRelatedDataForUserDeletion,
  ensureStationAdminAccess,
  isStationAdminRequester,
  isSuperviseurRequester,
  getUserHierarchyRank,
  getRequesterHierarchyRank,
  assertCanActOnUser,
  assertCanAssignRank,
  assertNotSelfTarget,
  requireAuditReason,
  ensureUserManagementAccess,
  isActiveFullNameUsedByAnotherUser,
  assertActiveFullNameUnique,
  isFullNamePasswordPairUsedByAnotherUser,
  assertFullNamePasswordPairUnique,
  generateUniqueTemporaryPasswordForFullName,
  generateUniqueUsername,
  getActiveUserByDisplayName,
  registerFailedLoginAttempt,
  releaseExpiredLocks,
  checkAccountCredentials
};
