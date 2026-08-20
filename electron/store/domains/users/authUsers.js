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
const { normalizePageAccess, sanitizeUser, toUserAuditSnapshot } = require("./userMapping");

const MANAGER_PROFILES = ["SUPERVISEUR", "RESPONSABLE_STATION", "DIRECTEUR_STATION"];
const MAX_FAILED_ATTEMPTS = 5;
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
  const rows = await db.all(`SELECT * FROM users`, []);
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

/** @returns {void} */
function ensureUserAdminPermission(store, requesterRole, requesterUsername, roles, source) {
  ensureStationAdminAccess(store, requesterUsername, roles, source);
}

/** @returns {object|null} */
function getRequesterRow(store, requesterUsername) {
  return getCachedUserRow(store, requesterUsername);
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

/** @returns {boolean} */
function canManagePageAccess(store, requesterRole, requesterUsername, roles) {
  return isStationAdminRequester(getRequesterRow(store, requesterUsername), roles);
}

/** @returns {number} */
function getPasswordHierarchyRankForTarget(userRow, roles) {
  if (!userRow) return -1;
  if (userRow.role === roles.DEV) return 4;
  if (userRow.role === roles.OPERATEUR) return 0;
  if (userRow.role !== roles.RESPONSABLE) return -1;
  if (userRow.manager_profile === "DIRECTEUR_STATION") return 3;
  if (userRow.manager_profile === "RESPONSABLE_STATION") return 2;
  return 1;
}

/** @returns {number} */
function getRequesterPasswordRank(requesterRow, roles) {
  return requesterRow?.role === roles.DEV ? 100 : getPasswordHierarchyRankForTarget(requesterRow, roles);
}

/** @returns {void} */
function assertHigherRankForPasswordOrUnlock(store, requesterRow, targetRow, roles, source) {
  if (!(getRequesterPasswordRank(requesterRow, roles) > getPasswordHierarchyRankForTarget(targetRow, roles))) {
    store.fail(source, "Action refusee : hierarchie insuffisante pour ce compte.", "AUTH_FORBIDDEN");
  }
}

/** @returns {void} */
function ensureCanListUsers(store, requesterUsername, roles, source) {
  const requester = getRequesterRow(store, requesterUsername);
  if (isStationAdminRequester(requester, roles) || isSuperviseurRequester(requester, roles)) return;
  store.fail(source, "Acces refuse: liste des utilisateurs reservee aux profils habilites.", "AUTH_FORBIDDEN", {
    requesterUsername
  });
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
  const rows = await db.all("SELECT * FROM users WHERE lower(full_name) = ?", [normalizedFullName]);
  const users = rows.filter((row) => isDatabaseBooleanTrue(row.is_active));
  if (!users.length) {
    store.fail("auth:login", "Nom affiché inconnu.", "AUTH_USER_NOT_FOUND", { fullName: normalizedFullName });
  }
  const devUser = users.find((user) => user.role === role.DEV) || null;
  const standardUsers = users.filter((user) => user.role !== role.DEV);
  if (standardUsers.some((user) => isDatabaseBooleanTrue(user.is_locked))) {
    store.fail(
      "auth:login",
      "[AUTH_ACCOUNT_LOCKED] Compte bloqué après trop de tentatives échouées. Demandez à votre responsable de réinitialiser votre accès.",
      "AUTH_ACCOUNT_LOCKED",
      { fullName: normalizedFullName }
    );
  }

  let user = standardUsers.find((entry) => verifyPassword(password, entry.password_hash)) || null;
  let authenticatedWithPassword = Boolean(user);
  if (!user && devUser) {
    if (!store.devMasterCode) {
      store.fail(
        "auth:login",
        "Accès admin désactivé: code admin introuvable/invalide (fichier gts-admin.enc ou data/acces_admin.env).",
        "AUTH_ADMIN_ACCESS_FILE_REQUIRED"
      );
    }
    if (password === store.devMasterCode) user = { ...devUser, must_change_password: false };
  }
  if (!user) {
    for (const entry of standardUsers) {
      const attempts = Number(entry.failed_login_attempts || 0) + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      await db.run(
        "UPDATE users SET failed_login_attempts = ?, is_locked = ?, updated_at = ? WHERE username = ?",
        [attempts, locked, new Date().toISOString(), entry.username]
      );
      if (locked) {
        store.logAudit({
          actorUsername: entry.username,
          action: "AUTH_ACCOUNT_LOCKED",
          targetUsername: entry.username,
          details: { reason: "Trop de tentatives de connexion échouées", attempts }
        });
      }
    }
    await refreshUsersCache(store);
    store.fail("auth:login", "Mot de passe invalide.", "AUTH_BAD_PASSWORD", { fullName: normalizedFullName });
  }

  if (authenticatedWithPassword) {
    await db.run(
      "UPDATE users SET failed_login_attempts = 0, is_locked = ?, updated_at = ? WHERE username = ?",
      [false, new Date().toISOString(), user.username]
    );
    if (needsPasswordMigration(user.password_hash)) {
      await db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?", [
        hashPassword(password),
        new Date().toISOString(),
        user.username
      ]);
    }
    user = await db.get("SELECT * FROM users WHERE username = ?", [user.username]);
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
async function unlockUser(store, { requesterRole, requesterUsername, username, role }) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const requester = getRequesterRow(store, requesterUsername);
  if (!isStationAdminRequester(requester, role) && !isSuperviseurRequester(requester, role)) {
    store.fail("users:unlock", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }
  const normalizedUsername = normalizeUsername(username);
  const user = await db.get("SELECT * FROM users WHERE username = ?", [normalizedUsername]);
  if (!user || !isDatabaseBooleanTrue(user.is_active)) {
    store.fail("users:unlock", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
  }
  if (user.role === role.DEV) {
    store.fail("users:unlock", "Le compte Admin ne peut pas etre modifie.", "USER_PROTECTED");
  }
  assertHigherRankForPasswordOrUnlock(store, requester, user, role, "users:unlock");
  await db.run(
    "UPDATE users SET failed_login_attempts = 0, is_locked = ?, updated_at = ? WHERE username = ?",
    [false, new Date().toISOString(), normalizedUsername]
  );
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_UNLOCK",
    targetUsername: normalizedUsername,
    details: { unlockedBy: requesterUsername }
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
  const rows = await db.all("SELECT * FROM users WHERE lower(full_name) = ?", [normalizedFullName]);
  const user = rows.find(
    (entry) =>
      isDatabaseBooleanTrue(entry.is_active) &&
      isDatabaseBooleanTrue(entry.must_change_password) &&
      verifyPassword(temporaryPassword, entry.password_hash)
  );
  if (!user) {
    store.fail("auth:firstLogin", "Nom affiché ou mot de passe temporaire invalide.", "AUTH_TEMP_PASSWORD_INVALID", {
      fullName: normalizedFullName
    });
  }
  if (!newPassword || newPassword.length < 6) {
    store.fail("auth:firstLogin", "Le mot de passe doit contenir au moins 6 caracteres.", "AUTH_PASSWORD_TOO_SHORT");
  }
  assertPasswordNotBlacklisted(newPassword);
  if (isPasswordRecentlyUsed(newPassword, user.password_hash, user.password_history_json)) {
    store.fail(
      "auth:firstLogin",
      "Mot de passe déjà utilisé récemment.",
      "AUTH_PASSWORD_RECENTLY_USED"
    );
  }
  const passwordHash = await assertFullNamePasswordPairUnique(
    store,
    user.full_name,
    newPassword,
    "auth:firstLogin",
    user.id
  );
  const nextHistoryJson = pushPasswordHistory(user.password_hash, user.password_history_json);
  await db.run(
    "UPDATE users SET password_hash = ?, password_history_json = ?, must_change_password = ?, updated_at = ? WHERE username = ?",
    [passwordHash, nextHistoryJson, false, new Date().toISOString(), user.username]
  );
  await refreshUsersCache(store);
  store.logAudit({ actorUsername: user.username, action: "AUTH_FIRST_LOGIN_COMPLETED", targetUsername: user.username });
  return { success: true };
}

/**
 * Liste tous les comptes pour l'écran Paramètres.
 *
 * @returns {Promise<object[]>}
 */
async function listUsers(store, { requesterUsername, role }) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  ensureCanListUsers(store, requesterUsername, role, "users:list");
  return (await db.all("SELECT * FROM users ORDER BY created_at DESC", [])).map(sanitizeUser);
}

/**
 * Crée un compte et son mot de passe temporaire.
 *
 * @returns {Promise<{user: object, temporaryPassword: string}>}
 */
async function createUser(
  store,
  { requesterRole, requesterUsername, username, fullName, role, managerProfile, pageAccess, roles }
) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  ensureUserAdminPermission(store, requesterRole, requesterUsername, roles, "users:create");
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
  const normalizedPageAccess = canManagePageAccess(store, requesterRole, requesterUsername, roles)
    ? normalizePageAccess(pageAccess, role)
    : normalizePageAccess(null, role);
  const normalizedManagerProfile = role === roles.RESPONSABLE ? managerProfile : null;
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
  const user = await db.get("SELECT * FROM users WHERE id = ?", [id]);
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
  ensureUserAdminPermission(store, requesterRole, requesterUsername, role, "users:deactivate");
  const normalizedUsername = normalizeUsername(username);
  const user = await db.get("SELECT * FROM users WHERE username = ?", [normalizedUsername]);
  if (!user || !isDatabaseBooleanTrue(user.is_active)) {
    store.fail("users:deactivate", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
  }
  if (user.role === role.DEV) {
    store.fail("users:deactivate", "Le compte Admin ne peut pas etre supprime.", "USER_PROTECTED");
  }
  const normalizedReason = String(reason || "").trim() ||
    "Désactivation demandée depuis la gestion des utilisateurs.";
  const beforeAudit = toUserAuditSnapshot(user);
  const usage = await hasRelatedDataForUserDeletion(store, normalizedUsername);
  if (!usage.hasRelated) {
    await db.run("DELETE FROM users WHERE username = ?", [normalizedUsername]);
    await refreshUsersCache(store);
    store.logAudit({
      actorUsername: requesterUsername,
      action: "USER_DELETE_HARD",
      targetUsername: normalizedUsername,
      details: { reason: normalizedReason, relatedUsage: usage.related, deleted: beforeAudit }
    });
    return { success: true, mode: "hard_delete" };
  }
  await db.run(
    "UPDATE users SET is_active = ?, updated_by = ?, updated_at = ? WHERE username = ?",
    [false, requesterUsername, new Date().toISOString(), normalizedUsername]
  );
  await refreshUsersCache(store);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_DEACTIVATE",
    targetUsername: normalizedUsername,
    details: {
      reason: normalizedReason,
      relatedUsage: usage.related,
      before: beforeAudit,
      after: { ...beforeAudit, isActive: false }
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
  ensureUserAdminPermission(store, requesterRole, requesterUsername, role, "users:reactivate");
  const normalizedUsername = normalizeUsername(username);
  const user = await db.get("SELECT * FROM users WHERE username = ?", [normalizedUsername]);
  if (!user || isDatabaseBooleanTrue(user.is_active)) {
    store.fail("users:reactivate", "Utilisateur introuvable ou déjà actif.", "AUTH_USER_NOT_FOUND");
  }
  if (user.role === role.DEV) {
    store.fail("users:reactivate", "Le compte Admin ne peut pas etre modifie.", "USER_PROTECTED");
  }
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) {
    store.fail("users:reactivate", "Le motif de réactivation est obligatoire.", "USER_REASON_REQUIRED");
  }
  const cleanFullName = String(fullName != null ? fullName : user.full_name || "").trim();
  if (!cleanFullName) {
    store.fail("users:reactivate", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  await assertActiveFullNameUnique(store, cleanFullName, "users:reactivate", user.id);
  const before = toUserAuditSnapshot(user);
  const temporaryPassword = await generateUniqueTemporaryPasswordForFullName(store, cleanFullName, user.id);
  const nextHistoryJson = pushPasswordHistory(user.password_hash, user.password_history_json);
  const passwordHash = hashPassword(temporaryPassword);
  const now = new Date().toISOString();
  await db.run(
    `UPDATE users
     SET is_active = ?, full_name = ?, password_hash = ?, password_history_json = ?, must_change_password = ?,
         failed_login_attempts = 0, is_locked = ?, updated_by = ?, updated_at = ?
     WHERE username = ?`,
    [true, cleanFullName, passwordHash, nextHistoryJson, true, false, requesterUsername, now, normalizedUsername]
  );
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
  { requesterRole, requesterUsername, username, fullName, newRole, role, managerProfile, pageAccess, mustResetPassword }
) {
  const db = requirePersistence(store);
  await refreshUsersCache(store);
  const normalizedUsername = normalizeUsername(username);
  const requester = getRequesterRow(store, requesterUsername);
  const station = isStationAdminRequester(requester, role);
  const superviseurOnly = isSuperviseurRequester(requester, role);
  if (!station && !superviseurOnly) {
    store.fail("users:updateProfile", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN");
  }
  const user = await db.get("SELECT * FROM users WHERE username = ?", [normalizedUsername]);
  if (!user || !isDatabaseBooleanTrue(user.is_active)) {
    store.fail("users:updateProfile", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND");
  }
  if (user.role === role.DEV) {
    store.fail("users:updateProfile", "Le compte Admin ne peut pas etre modifie.", "USER_PROTECTED");
  }
  const before = sanitizeUser(user);
  if (superviseurOnly && !station) {
    if (!mustResetPassword) {
      store.fail(
        "users:updateProfile",
        "Seule la reinitialisation du mot de passe est autorisee pour votre profil.",
        "AUTH_SUPERVISEUR_ONLY_PASSWORD_RESET"
      );
    }
    const nextManager = newRole === role.RESPONSABLE ? managerProfile || null : null;
    if (
      String(fullName || "").trim() !== before.fullName ||
      newRole !== before.role ||
      String(nextManager || "") !== String(before.managerProfile || "") ||
      JSON.stringify(normalizePageAccess(pageAccess, newRole)) !== JSON.stringify(before.pageAccess)
    ) {
      store.fail("users:updateProfile", "Modification du profil non autorisee.", "AUTH_FORBIDDEN");
    }
  } else {
    ensureStationAdminAccess(store, requesterUsername, role, "users:updateProfile");
  }
  const cleanFullName = String(fullName || "").trim();
  if (!cleanFullName) {
    store.fail("users:updateProfile", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  await assertActiveFullNameUnique(store, cleanFullName, "users:updateProfile", user.id);
  if (![role.OPERATEUR, role.RESPONSABLE].includes(newRole)) {
    store.fail("users:updateProfile", "Role invalide.", "USER_BAD_ROLE", { newRole });
  }
  if (newRole === role.RESPONSABLE && !MANAGER_PROFILES.includes(managerProfile || "")) {
    store.fail("users:updateProfile", "Profil responsable invalide.", "USER_BAD_MANAGER_PROFILE");
  }
  const nextManagerProfile = newRole === role.RESPONSABLE ? managerProfile : null;
  const nextPageAccess = canManagePageAccess(store, requesterRole, requesterUsername, role)
    ? normalizePageAccess(pageAccess, newRole)
    : normalizePageAccess(before.pageAccess, newRole);
  if (mustResetPassword) {
    assertHigherRankForPasswordOrUnlock(store, requester, user, role, "users:updateProfile");
  }
  let temporaryPassword = null;
  let passwordHash = user.password_hash;
  let nextMustChangePassword = isDatabaseBooleanTrue(user.must_change_password);
  let nextHistoryJson = user.password_history_json || null;
  if (mustResetPassword) {
    temporaryPassword = await generateUniqueTemporaryPasswordForFullName(store, cleanFullName, user.id);
    nextHistoryJson = pushPasswordHistory(user.password_hash, user.password_history_json);
    passwordHash = hashPassword(temporaryPassword);
    nextMustChangePassword = true;
  }
  await db.run(
    `UPDATE users
     SET full_name = ?, role = ?, manager_profile = ?, page_access_json = ?, password_hash = ?,
         password_history_json = ?, must_change_password = ?, updated_by = ?, updated_at = ?
     WHERE username = ?`,
    [
      cleanFullName, newRole, nextManagerProfile, JSON.stringify(nextPageAccess), passwordHash,
      nextHistoryJson, nextMustChangePassword, requesterUsername, new Date().toISOString(), normalizedUsername
    ]
  );
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
    action: "USER_UPDATE_PROFILE",
    targetUsername: normalizedUsername,
    details: {
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
  isActiveFullNameUsedByAnotherUser, assertActiveFullNameUnique,
  isFullNamePasswordPairUsedByAnotherUser, assertFullNamePasswordPairUnique,
  generateUniqueTemporaryPasswordForFullName, generateUniqueUsername, sanitizeUser,
  login, completeFirstLogin, listUsers, createUser, deactivateUser, updateUserProfile,
  reactivateUser, unlockUser, ensureDevUser, ensureStationAdminAccess, refreshUsersCache,
  getCachedUserRow, isStationAdminRequester
};
