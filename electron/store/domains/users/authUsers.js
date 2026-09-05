/**
 * Authentification et gestion PostgreSQL des comptes utilisateurs (`users`).
 *
 * La connexion, les mutations et les préférences utilisent l'adaptateur PostgreSQL dédié.
 * Les contrôles RBAC appelés par des domaines synchrones lisent un cache PostgreSQL.
 * Aucune compatibilité historique ou ancien chemin de migration n'est conservé ici.
 *
 * @module electron/store/domains/users/authUsers
 */

const crypto = require("crypto");
const { hashPassword, verifyPassword, needsPasswordMigration, isPasswordRecentlyUsed, pushPasswordHistory } = require("../../core/password");
const { generateEntityId } = require("../../core/ids");
const { normalizePageAccess, sanitizeUser, toUserAuditSnapshot, USERS_SELECT } = require("./userMapping");
const { assertOptimisticLock } = require("../data/optimisticLock");

const MANAGER_PROFILES = ["SUPERVISEUR", "RESPONSABLE_STATION", "DIRECTEUR_STATION"];
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

/**
 * Authentifie un utilisateur et maintient les compteurs de verrouillage.
 *
 * @returns {Promise<{user: object}>}
 */
async function login(store, { username, password, role }) {
  const db = requirePersistence(store);
  const normalizedFullName = normalizeDisplayName(username);
  if (!normalizedFullName) {
    store.fail("auth:login", "Veuillez saisir un nom affiché.", "AUTH_DISPLAY_NAME_REQUIRED");
  }
  const rows = await db.all(`SELECT ${USERS_SELECT} FROM users WHERE lower(full_name) = ?`, [normalizedFullName]);
  const users = rows.filter((row) => isDatabaseBooleanTrue(row.is_active));
  if (!users.length) {
    store.fail("auth:login", "Nom affiché inconnu.", "AUTH_USER_NOT_FOUND", { fullName: normalizedFullName });
  }
  const devUser = users.find((user) => user.role === role.DEV) || null;
  const standardUsers = users.filter((user) => user.role !== role.DEV);
  const lockedRows = standardUsers.filter((user) => isDatabaseBooleanTrue(user.is_locked));
  if (lockedRows.length) {
    // Les lignes en mémoire ne servent ensuite qu'à vérifier le mot de passe ; les branches
    // succès et échec relisent la ligne en base, la libération n'a donc pas à être reportée ici.
    if (await releaseExpiredLocks(store, db, lockedRows)) {
      store.fail(
        "auth:login",
        `[AUTH_ACCOUNT_LOCKED] Compte bloqué après trop de tentatives échouées. Réessayez dans ${AUTO_UNLOCK_DELAY_MS / 60000} minutes, ou faites réinitialiser votre accès.`,
        "AUTH_ACCOUNT_LOCKED",
        { fullName: normalizedFullName }
      );
    }
    await refreshUsersCache(store);
  }

  let user = standardUsers.find((entry) => checkAccountCredentials(store, entry, password, role) === "ok") || null;
  let authenticatedWithPassword = Boolean(user);
  if (!user && devUser) {
    const devCheck = checkAccountCredentials(store, devUser, password, role);
    if (devCheck === "dev-code-unavailable") {
      store.fail(
        "auth:login",
        "Accès admin désactivé: code admin introuvable/invalide (fichier gts-admin.enc ou data/acces_admin.env).",
        "AUTH_ADMIN_ACCESS_FILE_REQUIRED"
      );
    }
    if (devCheck === "ok") {
      user = { ...devUser, must_change_password: false };
      // Invariant : le compte Admin ne se verrouille pas. On efface tout compteur résiduel
      // pour qu'aucun écran (validation par un pair, tableau des comptes) ne le croie bloqué.
      if (isDatabaseBooleanTrue(devUser.is_locked) || Number(devUser.failed_login_attempts || 0) > 0) {
        await db.run(
          "UPDATE users SET failed_login_attempts = 0, is_locked = ?, locked_at = NULL, updated_at = ? WHERE username = ?",
          [false, new Date().toISOString(), devUser.username]
        );
      }
    }
  }
  if (!user) {
    for (const entry of standardUsers) {
      await registerFailedLoginAttempt(store, db, entry, role);
    }
    store.fail("auth:login", "Mot de passe invalide.", "AUTH_BAD_PASSWORD", { fullName: normalizedFullName });
  }

  if (authenticatedWithPassword) {
    user = await db.transaction(async (tx) => {
      const row = await tx.get(
        `SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`,
        [user.username]
      );
      if (!row) {
        store.fail("auth:login", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND");
      }
      await tx.run(
        "UPDATE users SET failed_login_attempts = 0, is_locked = ?, locked_at = NULL, updated_at = ? WHERE username = ?",
        [false, new Date().toISOString(), row.username]
      );
      if (needsPasswordMigration(row.password_hash)) {
        await tx.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?", [
          hashPassword(password),
          new Date().toISOString(),
          row.username
        ]);
      }
      return tx.get(`SELECT ${USERS_SELECT} FROM users WHERE username = ?`, [row.username]);
    });
  }
  await refreshUsersCache(store);
  store.logAudit({ actorUsername: user.username, action: "AUTH_LOGIN", targetUsername: user.username });
  return { user: sanitizeUser(user) };
}

/**
 * Déverrouille un compte selon la hiérarchie métier.
 *
 * @returns {Promise<{success: true}>}
 */
async function unlockUser(store, { requesterRole, requesterUsername, username, role, reason }) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const requester = ensureUserManagementAccess(store, requesterUsername, role, "users:unlock");
  const normalizedReason = requireAuditReason(store, reason, "users:unlock", "de déverrouillage");
  const normalizedUsername = normalizeUsername(username);
  await db.transaction(async (tx) => {
    const user = await tx.get(
      `SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`,
      [normalizedUsername]
    );
    if (!user || !isDatabaseBooleanTrue(user.is_active)) {
      store.fail("users:unlock", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
    }
    assertCanActOnUser(store, requester, user, role, "users:unlock");
    await tx.run(
      "UPDATE users SET failed_login_attempts = 0, is_locked = ?, locked_at = NULL, updated_at = ? WHERE username = ?",
      [false, new Date().toISOString(), normalizedUsername]
    );
  });
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_UNLOCK",
    targetUsername: normalizedUsername,
    details: { reason: normalizedReason, unlockedBy: requesterUsername }
  });
  return { success: true };
}

/**
 * Finalise la première connexion.
 *
 * @returns {Promise<{success: true}>}
 */
async function completeFirstLogin(store, { username, temporaryPassword, newPassword }) {
  const db = requirePersistence(store);
  const normalizedFullName = normalizeDisplayName(username);
  const rows = await db.all(`SELECT ${USERS_SELECT} FROM users WHERE lower(full_name) = ?`, [normalizedFullName]);
  const candidate = rows.find(
    (entry) =>
      isDatabaseBooleanTrue(entry.is_active) &&
      isDatabaseBooleanTrue(entry.must_change_password) &&
      verifyPassword(temporaryPassword, entry.password_hash)
  );
  if (!candidate) {
    store.fail("auth:firstLogin", "Nom affiché ou mot de passe temporaire invalide.", "AUTH_TEMP_PASSWORD_INVALID", {
      fullName: normalizedFullName
    });
  }
  if (!newPassword || newPassword.length < 6) {
    store.fail("auth:firstLogin", "Le mot de passe doit contenir au moins 6 caractères.", "AUTH_PASSWORD_TOO_SHORT");
  }
  assertPasswordNotBlacklisted(newPassword);
  if (isPasswordRecentlyUsed(newPassword, candidate.password_hash, candidate.password_history_json)) {
    store.fail(
      "auth:firstLogin",
      "Mot de passe déjà utilisé récemment.",
      "AUTH_PASSWORD_RECENTLY_USED"
    );
  }
  const passwordHash = await assertFullNamePasswordPairUnique(
    store,
    candidate.full_name,
    newPassword,
    "auth:firstLogin",
    candidate.id
  );
  await db.transaction(async (tx) => {
    const user = await tx.get(
      `SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`,
      [candidate.username]
    );
    if (!user || !isDatabaseBooleanTrue(user.is_active) || !isDatabaseBooleanTrue(user.must_change_password)) {
      store.fail("auth:firstLogin", "Nom affiché ou mot de passe temporaire invalide.", "AUTH_TEMP_PASSWORD_INVALID");
    }
    if (!verifyPassword(temporaryPassword, user.password_hash)) {
      store.fail("auth:firstLogin", "Nom affiché ou mot de passe temporaire invalide.", "AUTH_TEMP_PASSWORD_INVALID");
    }
    const nextHistoryJson = pushPasswordHistory(user.password_hash, user.password_history_json);
    await tx.run(
      "UPDATE users SET password_hash = ?, password_history_json = ?, must_change_password = ?, updated_at = ? WHERE username = ?",
      [passwordHash, nextHistoryJson, false, new Date().toISOString(), user.username]
    );
  });
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: candidate.username,
    action: "AUTH_FIRST_LOGIN_COMPLETED",
    targetUsername: candidate.username
  });
  return { success: true };
}

/**
 * Réinitialise un mot de passe oublié en l'absence d'administrateur, sous la validation
 * d'un collègue physiquement présent (principe des quatre yeux).
 *
 * Le nom affiché servant d'identifiant est public : la légitimité de la demande ne peut
 * donc reposer que sur un tiers. Le validateur s'authentifie avec ses propres identifiants,
 * ne couvre qu'un compte de rang inférieur ou égal au sien, et son identité est inscrite
 * dans le journal à côté de celle du bénéficiaire.
 *
 * @returns {Promise<{success: true, fullName: string, temporaryPassword: string}>}
 */
async function resetPasswordWithPeerValidation(
  store,
  { fullName, validatorFullName, validatorPassword, reason, role }
) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const targetName = normalizeDisplayName(fullName);
  const validatorName = normalizeDisplayName(validatorFullName);
  if (!targetName || !validatorName) {
    store.fail("auth:peerReset", "Les deux noms affichés sont obligatoires.", "AUTH_DISPLAY_NAME_REQUIRED");
  }
  if (targetName === validatorName) {
    store.fail(
      "auth:peerReset",
      "La validation doit être faite par un collègue, pas par le titulaire du compte.",
      "AUTH_SELF_ACTION_FORBIDDEN"
    );
  }
  const normalizedReason = requireAuditReason(store, reason, "auth:peerReset", "de la demande");

  const validator = await getActiveUserByDisplayName(db, validatorName);
  if (!validator) {
    store.fail("auth:peerReset", "Nom affiché du collègue validateur inconnu.", "AUTH_USER_NOT_FOUND");
  }
  if (isDatabaseBooleanTrue(validator.is_locked) && (await releaseExpiredLocks(store, db, [validator]))) {
    store.fail("auth:peerReset", "Le compte du collègue validateur est bloqué.", "AUTH_ACCOUNT_LOCKED");
  }
  const validatorCheck = checkAccountCredentials(store, validator, validatorPassword, role);
  if (validatorCheck === "dev-code-unavailable") {
    store.fail(
      "auth:peerReset",
      "Accès admin désactivé: code admin introuvable/invalide (fichier gts-admin.enc ou data/acces_admin.env).",
      "AUTH_ADMIN_ACCESS_FILE_REQUIRED"
    );
  }
  if (validatorCheck !== "ok") {
    await registerFailedLoginAttempt(store, db, validator, role);
    store.fail("auth:peerReset", "Mot de passe du collègue validateur invalide.", "AUTH_BAD_PASSWORD");
  }

  const target = await getActiveUserByDisplayName(db, targetName);
  if (!target) {
    store.fail("auth:peerReset", "Nom affiché inconnu.", "AUTH_USER_NOT_FOUND");
  }
  assertCanActOnUser(store, validator, target, role, "auth:peerReset");

  const temporaryPassword = await generateUniqueTemporaryPasswordForFullName(store, target.full_name, target.id);
  const passwordHash = hashPassword(temporaryPassword);
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const row = await tx.get(`SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`, [target.username]);
    if (!row || !isDatabaseBooleanTrue(row.is_active)) {
      store.fail("auth:peerReset", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND");
    }
    const nextHistoryJson = pushPasswordHistory(row.password_hash, row.password_history_json);
    await tx.run(
      `UPDATE users
       SET password_hash = ?, password_history_json = ?, must_change_password = ?,
           failed_login_attempts = 0, is_locked = ?, locked_at = NULL, updated_by = ?, updated_at = ?
       WHERE username = ?`,
      [passwordHash, nextHistoryJson, true, false, validator.username, now, row.username]
    );
  });
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: validator.username,
    action: "USER_RESET_PASSWORD_PEER",
    targetUsername: target.username,
    details: {
      reason: normalizedReason,
      targetFullName: target.full_name,
      validatedBy: validator.username,
      validatedByFullName: validator.full_name
    }
  });
  return { success: true, fullName: target.full_name, temporaryPassword };
}

/**
 * Liste tous les comptes pour l'écran Paramètres.
 *
 * @returns {Promise<object[]>}
 */
async function listUsers(store, { requesterUsername, role }) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  ensureUserManagementAccess(store, requesterUsername, role, "users:list");
  return (await db.all(`SELECT ${USERS_SELECT} FROM users ORDER BY created_at DESC`, [])).map(sanitizeUser);
}

/**
 * Crée un compte et son mot de passe temporaire.
 *
 * @returns {Promise<{user: object, temporaryPassword: string}>}
 */
async function createUser(
  store,
  { requesterUsername, username, fullName, role, managerProfile, roles }
) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  ensureStationAdminAccess(store, requesterUsername, roles, "users:create");
  if (![roles.OPERATEUR, roles.RESPONSABLE].includes(role)) {
    store.fail("users:create", "Role invalide.", "USER_BAD_ROLE", { role });
  }
  if (role === roles.RESPONSABLE && !MANAGER_PROFILES.includes(managerProfile || "")) {
    store.fail("users:create", "Profil responsable invalide.", "USER_BAD_MANAGER_PROFILE", { managerProfile });
  }
  const normalizedFullName = String(fullName || username || "").trim();
  if (!normalizedFullName) {
    store.fail("users:create", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  await assertActiveFullNameUnique(store, normalizedFullName, "users:create");
  const normalizedPageAccess = normalizePageAccess(null, role);
  const normalizedManagerProfile = role === roles.RESPONSABLE ? managerProfile : null;
  assertCanAssignRank(
    store,
    getCachedUserRow(store, requesterUsername),
    role,
    normalizedManagerProfile,
    roles,
    "users:create"
  );
  const temporaryPassword = await generateUniqueTemporaryPasswordForFullName(store, normalizedFullName);
  const id = generateEntityId();
  const loginIdentifier = await generateUniqueUsername(store);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO users (
      id, username, full_name, role, password_hash, must_change_password,
      is_active, created_by, created_at, manager_profile, page_access_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, loginIdentifier, normalizedFullName, role, hashPassword(temporaryPassword), 1, 1,
      requesterUsername, now, normalizedManagerProfile, JSON.stringify(normalizedPageAccess)
    ]
  );
  const user = await db.get(`SELECT ${USERS_SELECT} FROM users WHERE id = ?`, [id]);
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_CREATE",
    targetUsername: loginIdentifier,
    details: {
      created: {
        fullName: normalizedFullName,
        role,
        managerProfile: normalizedManagerProfile,
        pageAccess: normalizedPageAccess,
        isActive: true,
        mustChangePassword: true
      }
    }
  });
  return { user: sanitizeUser(user), temporaryPassword };
}

/**
 * Supprime ou désactive un compte selon ses données liées.
 *
 * @returns {Promise<{success: true, mode: string}>}
 */
async function deactivateUser(store, { requesterRole, requesterUsername, username, role, reason }) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const requester = ensureUserManagementAccess(store, requesterUsername, role, "users:deactivate");
  const normalizedReason = requireAuditReason(store, reason, "users:deactivate", "de désactivation");
  const normalizedUsername = normalizeUsername(username);
  assertNotSelfTarget(
    store,
    requesterUsername,
    normalizedUsername,
    "users:deactivate",
    "Vous ne pouvez pas désactiver votre propre compte."
  );
  const usage = await hasRelatedDataForUserDeletion(store, normalizedUsername);
  // Un compte sans données liées est purgé physiquement, mais seul un administrateur station
  // a la visibilité pour l'assumer (un compte vierge peut avoir été créé avant une arrivée).
  // Le superviseur se limite donc toujours à une désactivation réversible.
  const canHardDelete = !usage.hasRelated && isStationAdminRequester(requester, role);
  const outcome = await db.transaction(async (tx) => {
    const user = await tx.get(
      `SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`,
      [normalizedUsername]
    );
    if (!user || !isDatabaseBooleanTrue(user.is_active)) {
      store.fail("users:deactivate", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
    }
    assertCanActOnUser(store, requester, user, role, "users:deactivate");
    const beforeAudit = toUserAuditSnapshot(user);
    if (canHardDelete) {
      await tx.run("DELETE FROM users WHERE username = ?", [normalizedUsername]);
      return { mode: "hard_delete", beforeAudit };
    }
    await tx.run(
      "UPDATE users SET is_active = ?, updated_by = ?, updated_at = ? WHERE username = ?",
      [false, requesterUsername, new Date().toISOString(), normalizedUsername]
    );
    return { mode: "deactivated", beforeAudit };
  });
  await refreshUsersCache(store);
  if (outcome.mode === "hard_delete") {
    store.logAudit({
      actorUsername: requesterUsername,
      action: "USER_DELETE_HARD",
      targetUsername: normalizedUsername,
      details: { reason: normalizedReason, relatedUsage: usage.related, deleted: outcome.beforeAudit }
    });
    return { success: true, mode: "hard_delete" };
  }
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_DEACTIVATE",
    targetUsername: normalizedUsername,
    details: {
      reason: normalizedReason,
      relatedUsage: usage.related,
      before: outcome.beforeAudit,
      after: { ...outcome.beforeAudit, isActive: false }
    }
  });
  return { success: true, mode: "deactivated" };
}

/**
 * Réactive un compte désactivé avec un motif.
 * Génère toujours un mot de passe temporaire (comme création / réinitialisation)
 * et impose le changement à la prochaine connexion.
 * Si un autre actif porte déjà le nom affiché, exige un nouveau `fullName` distinct.
 *
 * @returns {Promise<{success: true, temporaryPassword: string, fullName: string}>}
 */
async function reactivateUser(store, { requesterRole, requesterUsername, username, role, reason, fullName }) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const requester = ensureUserManagementAccess(store, requesterUsername, role, "users:reactivate");
  const normalizedUsername = normalizeUsername(username);
  const normalizedReason = requireAuditReason(store, reason, "users:reactivate", "de réactivation");
  const preview = await db.get(`SELECT ${USERS_SELECT} FROM users WHERE username = ?`, [normalizedUsername]);
  if (!preview || isDatabaseBooleanTrue(preview.is_active)) {
    store.fail("users:reactivate", "Utilisateur introuvable ou déjà actif.", "AUTH_USER_NOT_FOUND");
  }
  assertCanActOnUser(store, requester, preview, role, "users:reactivate");
  const cleanFullName = String(fullName != null ? fullName : preview.full_name || "").trim();
  if (!cleanFullName) {
    store.fail("users:reactivate", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  await assertActiveFullNameUnique(store, cleanFullName, "users:reactivate", preview.id);
  const temporaryPassword = await generateUniqueTemporaryPasswordForFullName(store, cleanFullName, preview.id);
  const passwordHash = hashPassword(temporaryPassword);
  const now = new Date().toISOString();
  const before = await db.transaction(async (tx) => {
    const user = await tx.get(
      `SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`,
      [normalizedUsername]
    );
    if (!user || isDatabaseBooleanTrue(user.is_active)) {
      store.fail("users:reactivate", "Utilisateur introuvable ou déjà actif.", "AUTH_USER_NOT_FOUND");
    }
    assertCanActOnUser(store, requester, user, role, "users:reactivate");
    const snapshot = toUserAuditSnapshot(user);
    const nextHistoryJson = pushPasswordHistory(user.password_hash, user.password_history_json);
    await tx.run(
      `UPDATE users
       SET is_active = ?, full_name = ?, password_hash = ?, password_history_json = ?, must_change_password = ?,
           failed_login_attempts = 0, is_locked = ?, locked_at = NULL, updated_by = ?, updated_at = ?
       WHERE username = ?`,
      [true, cleanFullName, passwordHash, nextHistoryJson, true, false, requesterUsername, now, normalizedUsername]
    );
    return snapshot;
  });
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_REACTIVATE",
    targetUsername: normalizedUsername,
    details: {
      reason: normalizedReason,
      passwordResetForced: true,
      before,
      after: { ...before, fullName: cleanFullName, isActive: true, mustChangePassword: true }
    }
  });
  return { success: true, temporaryPassword, fullName: cleanFullName };
}

/**
 * Met à jour un profil et peut réinitialiser son mot de passe.
 *
 * @returns {Promise<{success: true, temporaryPassword: string|null}>}
 */
async function updateUserProfile(
  store,
  {
    requesterRole,
    requesterUsername,
    username,
    fullName,
    newRole,
    role,
    managerProfile,
    mustResetPassword,
    reason,
    expectedUpdatedAt
  }
) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const normalizedUsername = normalizeUsername(username);
  const requester = ensureUserManagementAccess(store, requesterUsername, role, "users:updateProfile");
  const preview = await db.get(`SELECT ${USERS_SELECT} FROM users WHERE username = ?`, [normalizedUsername]);
  if (!preview || !isDatabaseBooleanTrue(preview.is_active)) {
    store.fail("users:updateProfile", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND");
  }
  assertCanActOnUser(store, requester, preview, role, "users:updateProfile");
  if (mustResetPassword) {
    assertNotSelfTarget(
      store,
      requesterUsername,
      normalizedUsername,
      "users:updateProfile",
      "Vous ne pouvez pas réinitialiser votre propre mot de passe depuis la gestion des comptes."
    );
  }
  const before = sanitizeUser(preview);
  const cleanFullName = String(fullName || "").trim();
  if (!cleanFullName) {
    store.fail("users:updateProfile", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  await assertActiveFullNameUnique(store, cleanFullName, "users:updateProfile", preview.id);
  if (![role.OPERATEUR, role.RESPONSABLE].includes(newRole)) {
    store.fail("users:updateProfile", "Rôle invalide.", "USER_BAD_ROLE", { newRole });
  }
  if (newRole === role.RESPONSABLE && !MANAGER_PROFILES.includes(managerProfile || "")) {
    store.fail("users:updateProfile", "Profil responsable invalide.", "USER_BAD_MANAGER_PROFILE");
  }
  const nextManagerProfile = newRole === role.RESPONSABLE ? managerProfile : null;
  assertCanAssignRank(store, requester, newRole, nextManagerProfile, role, "users:updateProfile");
  // Son propre niveau hiérarchique n'est jamais modifiable par soi-même : cela couvre la promotion
  // comme la rétrogradation accidentelle, qui ferait perdre l'accès à cet écran.
  if (
    normalizeUsername(requesterUsername) === normalizedUsername &&
    (newRole !== before.role || String(nextManagerProfile || "") !== String(before.managerProfile || ""))
  ) {
    store.fail(
      "users:updateProfile",
      "Vous ne pouvez pas modifier votre propre niveau hiérarchique.",
      "AUTH_SELF_ACTION_FORBIDDEN"
    );
  }
  const nextPageAccess = normalizePageAccess(null, newRole);
  // Une réinitialisation seule (aucun champ de profil modifié) est tracée sous sa propre action d'audit.
  const isPasswordResetOnly =
    Boolean(mustResetPassword) &&
    cleanFullName === before.fullName &&
    newRole === before.role &&
    String(nextManagerProfile || "") === String(before.managerProfile || "") &&
    JSON.stringify(nextPageAccess) === JSON.stringify(before.pageAccess);
  const normalizedReason = requireAuditReason(
    store,
    reason,
    "users:updateProfile",
    isPasswordResetOnly ? "de réinitialisation" : "de modification"
  );
  let temporaryPassword = null;
  let passwordHash = preview.password_hash;
  let nextMustChangePassword = isDatabaseBooleanTrue(preview.must_change_password);
  let nextHistoryJson = preview.password_history_json || null;
  if (mustResetPassword) {
    temporaryPassword = await generateUniqueTemporaryPasswordForFullName(store, cleanFullName, preview.id);
    nextHistoryJson = pushPasswordHistory(preview.password_hash, preview.password_history_json);
    passwordHash = hashPassword(temporaryPassword);
    nextMustChangePassword = true;
  }
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const user = await tx.get(
      `SELECT ${USERS_SELECT} FROM users WHERE username = ? FOR UPDATE`,
      [normalizedUsername]
    );
    if (!user || !isDatabaseBooleanTrue(user.is_active)) {
      store.fail("users:updateProfile", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND");
    }
    assertOptimisticLock(store, "users:updateProfile", user, expectedUpdatedAt, "USER_PROFILE_CONFLICT");
    const result = await tx.run(
      `UPDATE users
       SET full_name = ?, role = ?, manager_profile = ?, page_access_json = ?, password_hash = ?,
           password_history_json = ?, must_change_password = ?, failed_login_attempts = ?, is_locked = ?,
           locked_at = ?, updated_by = ?, updated_at = ?
       WHERE username = ? AND updated_at IS NOT DISTINCT FROM ?`,
      [
        cleanFullName,
        newRole,
        nextManagerProfile,
        JSON.stringify(nextPageAccess),
        passwordHash,
        nextHistoryJson,
        nextMustChangePassword,
        // Une réinitialisation lève aussi le verrouillage : sans cela le mot de passe
        // temporaire serait inutilisable sur un compte bloqué.
        mustResetPassword ? 0 : Number(user.failed_login_attempts || 0),
        mustResetPassword ? false : isDatabaseBooleanTrue(user.is_locked),
        mustResetPassword ? null : user.locked_at ?? null,
        requesterUsername,
        now,
        normalizedUsername,
        expectedUpdatedAt ?? null
      ]
    );
    if (!result.changes) {
      store.fail(
        "users:updateProfile",
        "Cette fiche a été modifiée ailleurs. Actualisez la liste puis réessayez.",
        "USER_PROFILE_CONFLICT"
      );
    }
  });
  const verify = await db.get("SELECT full_name FROM users WHERE username = ?", [normalizedUsername]);
  if (!verify || String(verify.full_name || "").trim() !== cleanFullName) {
    store.fail(
      "users:updateProfile",
      "La modification du nom affiché n'a pas pu être enregistrée en base. Réessayez.",
      "USER_UPDATE_NOT_PERSISTED"
    );
  }
  await refreshUsersCache(store);
  await store.logAudit({
    actorUsername: requesterUsername,
    action: isPasswordResetOnly ? "USER_RESET_PASSWORD" : "USER_UPDATE_PROFILE",
    targetUsername: normalizedUsername,
    details: {
      reason: normalizedReason,
      before: {
        fullName: before.fullName,
        role: before.role,
        managerProfile: before.managerProfile,
        pageAccess: before.pageAccess,
        mustChangePassword: before.mustChangePassword
      },
      after: {
        fullName: cleanFullName,
        role: newRole,
        managerProfile: nextManagerProfile,
        pageAccess: nextPageAccess,
        mustChangePassword: nextMustChangePassword
      },
      resetPasswordRequested: Boolean(mustResetPassword)
    }
  });
  return { success: true, temporaryPassword, fullName: cleanFullName };
}

/**
 * Garantit l'existence du compte DEV dans PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {{roles: object}} options
 * @returns {Promise<void>}
 */
async function ensureDevUser(store, { roles }) {
  const db = requirePersistence(store);
  const adminUser = await db.get("SELECT id FROM users WHERE username = ?", ["admin"]);
  if (adminUser) {
    await refreshUsersCache(store);
    return;
  }
  await db.run(
    `INSERT INTO users (
      id, username, full_name, role, password_hash, must_change_password,
      is_active, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateEntityId(), "admin", "Admin", roles.DEV, hashPassword(crypto.randomUUID()),
      false, true, "system", new Date().toISOString()
    ]
  );
  await refreshUsersCache(store);
}

module.exports = {
  login,
  completeFirstLogin,
  resetPasswordWithPeerValidation,
  listUsers,
  createUser,
  deactivateUser,
  updateUserProfile,
  reactivateUser,
  unlockUser,
  ensureDevUser,
  ensureStationAdminAccess,
  refreshUsersCache,
  getCachedUserRow,
  isStationAdminRequester
};
