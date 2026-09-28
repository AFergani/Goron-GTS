/**
 * Authentification et gestion PostgreSQL des comptes utilisateurs (`users`).
 *
 * La connexion, les mutations et les préférences utilisent l'adaptateur PostgreSQL dédié.
 * Helpers : `authUsersHelpers.js`. Aucune compatibilité historique n'est conservée ici.
 *
 * @module electron/store/domains/users/authUsers
 */

const crypto = require("crypto");
const { hashPassword, verifyPassword, needsPasswordMigration, isPasswordRecentlyUsed, pushPasswordHistory } = require("../../core/password");
const { generateEntityId } = require("../../core/ids");
const { normalizePageAccess, sanitizeUser, toUserAuditSnapshot, USERS_SELECT } = require("./userMapping");
const { assertOptimisticLock } = require("../data/optimisticLock");
const {
  AUTO_UNLOCK_DELAY_MS,
  normalizeBusinessProfile,
  requirePersistence,
  refreshUsersCache,
  getCachedUserRow,
  normalizeUsername,
  normalizeDisplayName,
  isDatabaseBooleanTrue,
  assertPasswordNotBlacklisted,
  assertUserChosenPasswordLength,
  hasRelatedDataForUserDeletion,
  ensureStationAdminAccess,
  isStationAdminRequester,
  isSuperviseurRequester,
  assertCanActOnUser,
  assertCanAssignRank,
  assertNotSelfTarget,
  requireAuditReason,
  ensureUserManagementAccess,
  assertActiveFullNameUnique,
  assertFullNamePasswordPairUnique,
  generateUniqueTemporaryPasswordForFullName,
  generateUniqueUsername,
  getActiveUserByDisplayName,
  registerFailedLoginAttempt,
  releaseExpiredLocks,
  checkAccountCredentials
} = require("./authUsersHelpers");

/** Message unique quand le code Admin AppData est absent. */
const ADMIN_ACCESS_FILE_MISSING_MESSAGE =
  "Accès admin désactivé : code administrateur introuvable dans le dossier AppData de Goron GTS.";

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
        ADMIN_ACCESS_FILE_MISSING_MESSAGE,
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
  assertUserChosenPasswordLength(store, "auth:firstLogin", newPassword);
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
      ADMIN_ACCESS_FILE_MISSING_MESSAGE,
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
  const normalizedFullName = String(fullName || username || "").trim();
  if (!normalizedFullName) {
    store.fail("users:create", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  await assertActiveFullNameUnique(store, normalizedFullName, "users:create");
  const normalizedManagerProfile = normalizeBusinessProfile(store, role, managerProfile, roles, "users:create");
  const normalizedPageAccess = normalizePageAccess(null, role, normalizedManagerProfile);
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
  const nextManagerProfile = normalizeBusinessProfile(store, newRole, managerProfile, role, "users:updateProfile");
  assertCanAssignRank(store, requester, newRole, nextManagerProfile, role, "users:updateProfile");
  // Le superviseur gère les comptes de rang inférieur, sans pouvoir les promouvoir.
  if (
    isSuperviseurRequester(requester, role) &&
    (newRole !== before.role || String(nextManagerProfile || "") !== String(before.managerProfile || ""))
  ) {
    store.fail(
      "users:updateProfile",
      "Seul un responsable de station ou un directeur peut modifier le niveau hiérarchique.",
      "AUTH_FORBIDDEN"
    );
  }
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
  const nextPageAccess = normalizePageAccess(null, newRole, nextManagerProfile);
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

/**
 * Vérifie le mot de passe d'un compte autorisé à gérer PostgreSQL (responsable
 * de station, directeur, ou Admin).
 *
 * @param {object} store
 * @param {{ username?: string, fullName?: string, password: string, roles: object }} options
 * @returns {Promise<"ok"|"invalid"|"forbidden"|"dev-code-unavailable">}
 */
async function confirmStationAdminPassword(store, { username, fullName, password, roles }) {
  const db = requirePersistence(store);
  const login = String(username || "").trim().toLowerCase();
  let row = login ? getCachedUserRow(store, login) : null;
  if (!row && login) {
    row = await db.get(`SELECT ${USERS_SELECT} FROM users WHERE lower(username) = ?`, [login]);
    if (row && !isDatabaseBooleanTrue(row.is_active)) row = null;
  }
  if (!row && fullName) {
    row = await getActiveUserByDisplayName(db, normalizeDisplayName(fullName));
  }
  if (!row || !isStationAdminRequester(row, roles)) return "forbidden";
  return checkAccountCredentials(store, row, password, roles);
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
  isStationAdminRequester,
  confirmStationAdminPassword
};

