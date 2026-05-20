const crypto = require("crypto");
const { hashPassword, verifyPassword, needsPasswordMigration } = require("../core/password");
const { generateEntityId } = require("../core/ids");
const MANAGER_PROFILES = ["SUPERVISEUR", "RESPONSABLE_STATION", "DIRECTEUR_STATION"];

/** Mots de passe trop faibles refusés lors du premier changement. */
const PASSWORD_BLACKLIST = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "0000", "0000000", "00000000",
  "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
  "000000", "1111", "1234", "12345", "123123", "654321", "987654321",
  "password", "motdepasse", "azerty", "qwerty", "azertyuiop", "qwertyuiop",
  "abcdef", "abc123", "iloveyou", "letmein", "welcome", "admin", "pass", "test",
  "soleil", "bonjour", "bienvenue", "football", "dragon", "master", "superman",
  "monkey", "shadow", "michael", "jessica", "password1", "password123"
]);

function assertPasswordNotBlacklisted(password, context) {
  if (PASSWORD_BLACKLIST.has(String(password || "").toLowerCase())) {
    throw new Error(`[AUTH_PASSWORD_BLACKLISTED] Ce mot de passe est trop simple. Choisissez un mot de passe plus original.`);
  }
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDisplayName(value) {
  return String(value || "").trim().toLowerCase();
}

function generateLoginIdentifier() {
  return `usr-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeUser(user) {
  let parsedPageAccess = null;
  try {
    parsedPageAccess = user.page_access_json ? JSON.parse(user.page_access_json) : null;
  } catch {
    parsedPageAccess = null;
  }
  const defaultPageAccess =
    user.role === "OPERATEUR"
      ? { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: false, gardiennage: true }
      : { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: true, gardiennage: true };
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    managerProfile: user.manager_profile || null,
    pageAccess: {
      mainCourante: parsedPageAccess?.mainCourante ?? defaultPageAccess.mainCourante,
      fransor: parsedPageAccess?.fransor ?? defaultPageAccess.fransor,
      intervention: parsedPageAccess?.intervention ?? defaultPageAccess.intervention,
      rondes: parsedPageAccess?.rondes ?? defaultPageAccess.rondes,
      settings: parsedPageAccess?.settings ?? defaultPageAccess.settings,
      gardiennage: parsedPageAccess?.gardiennage ?? defaultPageAccess.gardiennage
    },
    mustChangePassword: Boolean(user.must_change_password),
    isActive: Boolean(user.is_active),
    isLocked: Boolean(user.is_locked),
    failedLoginAttempts: Number(user.failed_login_attempts || 0),
    createdBy: user.created_by,
    createdAt: user.created_at,
    updatedBy: user.updated_by || undefined,
    updatedAt: user.updated_at || undefined
  };
}

function normalizePageAccess(pageAccess, role) {
  const defaultPageAccess =
    role === "OPERATEUR"
      ? { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: false, gardiennage: true }
      : { mainCourante: true, fransor: true, intervention: true, rondes: true, settings: true, gardiennage: true };
  return {
    mainCourante: pageAccess?.mainCourante ?? defaultPageAccess.mainCourante,
    fransor: pageAccess?.fransor ?? defaultPageAccess.fransor,
    intervention: pageAccess?.intervention ?? defaultPageAccess.intervention,
    rondes: pageAccess?.rondes ?? defaultPageAccess.rondes,
    settings: pageAccess?.settings ?? defaultPageAccess.settings,
    gardiennage: pageAccess?.gardiennage ?? defaultPageAccess.gardiennage
  };
}

/**
 * Journal des actions, gestion des comptes : DEV, ou RESPONSABLE avec profil métier
 * directeur de station / responsable de station uniquement (pas superviseur, pas profil vide).
 * Toujours dérivé de la base (requesterUsername), jamais du rôle déclaré par le client.
 */
function ensureStationAdminAccess(store, requesterUsername, roles, source) {
  const requester = store.db
    .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
    .get(normalizeUsername(requesterUsername));
  if (!requester) {
    store.fail(source, "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }
  if (requester.role === roles.DEV) return;
  if (requester.role !== roles.RESPONSABLE) {
    store.fail(source, "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole: requester.role, requesterUsername });
  }
  if (requester.manager_profile !== "DIRECTEUR_STATION" && requester.manager_profile !== "RESPONSABLE_STATION") {
    store.fail(source, "Acces refuse: action reservee au directeur de station, responsable de station ou au dev.", "AUTH_FORBIDDEN", {
      requesterUsername
    });
  }
}

/** Alias : même contrôle que la gestion des comptes (profil lu en base). */
function ensureUserAdminPermission(store, requesterRole, requesterUsername, roles, source) {
  ensureStationAdminAccess(store, requesterUsername, roles, source);
}

function canManagePageAccess(store, requesterRole, requesterUsername, roles) {
  const requester = store.db
    .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
    .get(normalizeUsername(requesterUsername));
  if (!requester) return false;
  if (requester.role === roles.DEV) return true;
  if (requester.role !== roles.RESPONSABLE) return false;
  return requester.manager_profile === "DIRECTEUR_STATION" || requester.manager_profile === "RESPONSABLE_STATION";
}

function getRequesterRow(store, requesterUsername) {
  return store.db
    .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
    .get(normalizeUsername(requesterUsername));
}

function isStationAdminRequester(requester, roles) {
  if (!requester) return false;
  if (requester.role === roles.DEV) return true;
  if (requester.role !== roles.RESPONSABLE) return false;
  return requester.manager_profile === "DIRECTEUR_STATION" || requester.manager_profile === "RESPONSABLE_STATION";
}

function isSuperviseurRequester(requester, roles) {
  return Boolean(requester && requester.role === roles.RESPONSABLE && requester.manager_profile === "SUPERVISEUR");
}

/** Cible : opérateur 0, superviseur 1, responsable de station 2, directeur 3, compte DEV 4. */
function getPasswordHierarchyRankForTarget(userRow, roles) {
  if (!userRow) return -1;
  if (userRow.role === roles.DEV) return 4;
  if (userRow.role === roles.OPERATEUR) return 0;
  if (userRow.role === roles.RESPONSABLE) {
    const p = userRow.manager_profile;
    if (p === "SUPERVISEUR") return 1;
    if (p === "RESPONSABLE_STATION") return 2;
    if (p === "DIRECTEUR_STATION") return 3;
    return 1;
  }
  return -1;
}

function getRequesterPasswordRank(requesterRow, roles) {
  if (!requesterRow) return -1;
  if (requesterRow.role === roles.DEV) return 100;
  return getPasswordHierarchyRankForTarget(requesterRow, roles);
}

function assertHigherRankForPasswordOrUnlock(store, requesterRow, targetRow, roles, source) {
  const tr = getPasswordHierarchyRankForTarget(targetRow, roles);
  const rr = getRequesterPasswordRank(requesterRow, roles);
  if (!(rr > tr)) {
    store.fail(source, "Action refusee : hierarchie insuffisante pour ce compte.", "AUTH_FORBIDDEN", {});
  }
}

/** Liste des comptes : administrateurs station + superviseur (reset MDP uniquement côté UI). */
function ensureCanListUsers(store, requesterUsername, roles, source) {
  const requester = getRequesterRow(store, requesterUsername);
  if (!requester) {
    store.fail(source, "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }
  if (isStationAdminRequester(requester, roles)) return;
  if (isSuperviseurRequester(requester, roles)) return;
  store.fail(source, "Acces refuse: liste des utilisateurs reservee aux profils habilites.", "AUTH_FORBIDDEN", { requesterUsername });
}

function isFullNamePasswordPairUsedByAnotherUser(store, fullName, rawPassword, excludedUserId = null) {
  const normalizedFullName = normalizeDisplayName(fullName);
  const rows = excludedUserId
    ? store.db
        .prepare("SELECT id, password_hash FROM users WHERE lower(full_name) = ? AND is_active = 1 AND id <> ?")
        .all(normalizedFullName, excludedUserId)
    : store.db.prepare("SELECT id, password_hash FROM users WHERE lower(full_name) = ? AND is_active = 1").all(normalizedFullName);
  return rows.some((row) => verifyPassword(rawPassword, row.password_hash));
}

function assertFullNamePasswordPairUnique(store, fullName, rawPassword, source, excludedUserId = null) {
  if (isFullNamePasswordPairUsedByAnotherUser(store, fullName, rawPassword, excludedUserId)) {
    store.fail(
      source,
      "Ce nom affiché et ce mot de passe sont déjà utilisés sur un autre compte actif. Choisissez un mot de passe différent.",
      "AUTH_NAME_PASSWORD_PAIR_ALREADY_USED"
    );
  }
  return hashPassword(rawPassword);
}

function generateUniqueTemporaryPasswordForFullName(store, fullName, excludedUserId = null) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%!";
  const minLength = 8;
  const nextCandidate = () => {
    const random = crypto.randomBytes(minLength);
    let value = "";
    for (let i = 0; i < random.length; i += 1) {
      value += alphabet[random[i] % alphabet.length];
    }
    return value;
  };
  for (let i = 0; i < 10; i += 1) {
    const candidate = nextCandidate();
    if (!isFullNamePasswordPairUsedByAnotherUser(store, fullName, candidate, excludedUserId)) {
      return candidate;
    }
  }
  store.fail(
    "users:passwordGeneration",
    "Impossible de générer un mot de passe temporaire unique pour ce nom affiché. Merci de réessayer.",
    "AUTH_TEMP_PASSWORD_GENERATION_FAILED"
  );
}

function generateUniqueUsername(store) {
  for (let i = 0; i < 20; i += 1) {
    const candidate = generateLoginIdentifier();
    const exists = store.db.prepare("SELECT id FROM users WHERE username = ? LIMIT 1").get(candidate);
    if (!exists) return candidate;
  }
  store.fail("users:create", "Impossible de générer un identifiant interne unique.", "USER_ID_GENERATION_FAILED");
}

const MAX_FAILED_ATTEMPTS = 5;

function login(store, { username, password, role }) {
  const normalizedFullName = normalizeDisplayName(username);
  if (!normalizedFullName) {
    store.fail("auth:login", "Veuillez saisir un nom affiché.", "AUTH_DISPLAY_NAME_REQUIRED");
  }
  const users = store.db.prepare("SELECT * FROM users WHERE lower(full_name) = ? AND is_active = 1").all(normalizedFullName);
  if (!users.length) {
    store.fail("auth:login", "Nom affiché inconnu.", "AUTH_USER_NOT_FOUND", { fullName: normalizedFullName });
  }
  const devUser = users.find((u) => u.role === role.DEV) || null;
  const standardUsers = users.filter((u) => u.role !== role.DEV);

  // Vérifier le verrouillage sur tous les comptes standard portant ce nom.
  const lockedUser = standardUsers.find((u) => u.is_locked);
  if (lockedUser) {
    store.fail(
      "auth:login",
      "[AUTH_ACCOUNT_LOCKED] Compte bloqué après trop de tentatives échouées. Demandez à votre responsable de réinitialiser votre accès.",
      "AUTH_ACCOUNT_LOCKED",
      { fullName: normalizedFullName }
    );
  }

  let user = null;
  let authenticatedWithPassword = false;
  for (const u of standardUsers) {
    if (verifyPassword(password, u.password_hash)) {
      user = u;
      authenticatedWithPassword = true;
      break;
    }
  }
  if (!user && devUser) {
    if (!store.devMasterCode) {
      store.fail(
        "auth:login",
        "Accès admin désactivé: code admin introuvable/invalide (fichier gts-admin.enc ou data/acces_admin.env).",
        "AUTH_ADMIN_ACCESS_FILE_REQUIRED"
      );
    }
    if (password === store.devMasterCode) {
      user = { ...devUser, must_change_password: 0 };
    }
  }
  if (!user) {
    // Incrémenter le compteur d'échecs sur tous les comptes standard portant ce nom.
    for (const u of standardUsers) {
      const newAttempts = Number(u.failed_login_attempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
      store.db
        .prepare("UPDATE users SET failed_login_attempts = ?, is_locked = ?, updated_at = ? WHERE username = ?")
        .run(newAttempts, shouldLock ? 1 : 0, new Date().toISOString(), u.username);
      if (shouldLock) {
        store.logAudit({
          actorUsername: u.username,
          action: "AUTH_ACCOUNT_LOCKED",
          targetUsername: u.username,
          details: { reason: "Trop de tentatives de connexion échouées", attempts: newAttempts }
        });
      }
    }
    store.fail("auth:login", "Mot de passe invalide.", "AUTH_BAD_PASSWORD", { fullName: normalizedFullName });
  }
  // Réinitialiser le compteur d'échecs après connexion réussie.
  if (authenticatedWithPassword) {
    store.db
      .prepare("UPDATE users SET failed_login_attempts = 0, is_locked = 0, updated_at = ? WHERE username = ?")
      .run(new Date().toISOString(), user.username);
  }
  if (authenticatedWithPassword && needsPasswordMigration(user.password_hash)) {
    const newHash = hashPassword(password);
    store.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?").run(newHash, new Date().toISOString(), user.username);
    user = store.db.prepare("SELECT * FROM users WHERE username = ?").get(user.username);
  }
  store.logAudit({ actorUsername: user.username, action: "AUTH_LOGIN", targetUsername: user.username });
  return { user: sanitizeUser(user) };
}

function unlockUser(store, { requesterRole, requesterUsername, username, role }) {
  const normalizedUsername = normalizeUsername(username);
  const requester = getRequesterRow(store, requesterUsername);
  const station = isStationAdminRequester(requester, role);
  const superviseurOnly = isSuperviseurRequester(requester, role);
  if (!station && !superviseurOnly) {
    store.fail("users:unlock", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }
  const user = store.db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(normalizedUsername);
  if (!user) {
    store.fail("users:unlock", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
  }
  if (user.role === role.DEV) {
    store.fail("users:unlock", "Le compte Admin ne peut pas etre modifie.", "USER_PROTECTED");
  }
  assertHigherRankForPasswordOrUnlock(store, requester, user, role, "users:unlock");
  store.db
    .prepare("UPDATE users SET failed_login_attempts = 0, is_locked = 0, updated_at = ? WHERE username = ?")
    .run(new Date().toISOString(), normalizedUsername);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_UNLOCK",
    targetUsername: normalizedUsername,
    details: { unlockedBy: requesterUsername }
  });
  return { success: true };
}

function completeFirstLogin(store, { username, temporaryPassword, newPassword }) {
  const normalizedFullName = normalizeDisplayName(username);
  const users = store.db
    .prepare("SELECT * FROM users WHERE lower(full_name) = ? AND is_active = 1 AND must_change_password = 1")
    .all(normalizedFullName);
  const user = users.find((u) => verifyPassword(temporaryPassword, u.password_hash));
  if (!user) {
    store.fail("auth:firstLogin", "Nom affiché ou mot de passe temporaire invalide.", "AUTH_TEMP_PASSWORD_INVALID", {
      fullName: normalizedFullName
    });
  }
  if (!newPassword || newPassword.length < 6) {
    store.fail("auth:firstLogin", "Le mot de passe doit contenir au moins 6 caracteres.", "AUTH_PASSWORD_TOO_SHORT", {
      fullName: normalizedFullName
    });
  }
  assertPasswordNotBlacklisted(newPassword);
  const uniquePasswordHash = assertFullNamePasswordPairUnique(store, user.full_name, newPassword, "auth:firstLogin", user.id);
  store.db
    .prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0, updated_at = ?
       WHERE username = ?`
    )
    .run(uniquePasswordHash, new Date().toISOString(), user.username);
  store.logAudit({ actorUsername: user.username, action: "AUTH_FIRST_LOGIN_COMPLETED", targetUsername: user.username });
  return { success: true };
}

function listUsers(store, { requesterUsername, role }) {
  ensureCanListUsers(store, requesterUsername, role, "users:list");
  const rows = store.db.prepare("SELECT * FROM users ORDER BY datetime(created_at) DESC").all();
  return rows.map((u) => sanitizeUser(u));
}

function createUser(store, { requesterRole, requesterUsername, username, fullName, role, managerProfile, pageAccess, roles }) {
  const normalizedDisplayName = String(fullName || username || "").trim();
  ensureUserAdminPermission(store, requesterRole, requesterUsername, roles, "users:create");
  if (![roles.OPERATEUR, roles.RESPONSABLE].includes(role)) {
    store.fail("users:create", "Role invalide.", "USER_BAD_ROLE", { role });
  }
  if (role === roles.RESPONSABLE && !MANAGER_PROFILES.includes(managerProfile || "")) {
    store.fail("users:create", "Profil responsable invalide.", "USER_BAD_MANAGER_PROFILE", { managerProfile });
  }
  const requesterCanManagePageAccess = canManagePageAccess(store, requesterRole, requesterUsername, roles);
  const normalizedPageAccess = requesterCanManagePageAccess ? normalizePageAccess(pageAccess, role) : normalizePageAccess(null, role);
  const normalizedManagerProfile = role === roles.RESPONSABLE ? managerProfile : null;
  if (!normalizedDisplayName) {
    store.fail("users:create", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  const normalizedFullName = normalizedDisplayName;
  const temporaryPassword = generateUniqueTemporaryPasswordForFullName(store, normalizedFullName);
  const id = generateEntityId();
  const loginIdentifier = generateUniqueUsername(store);
  const now = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO users (
        id, username, full_name, role, password_hash, must_change_password,
        is_active, created_by, created_at, manager_profile, page_access_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      loginIdentifier,
      normalizedFullName,
      role,
      hashPassword(temporaryPassword),
      1,
      1,
      requesterUsername,
      now,
      normalizedManagerProfile,
      JSON.stringify(normalizedPageAccess)
    );
  const user = store.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_CREATE",
    targetUsername: loginIdentifier,
    details: {
      created: {
        username: loginIdentifier,
        role,
        managerProfile: normalizedManagerProfile,
        pageAccess: normalizedPageAccess
      }
    }
  });
  return { user: sanitizeUser(user), temporaryPassword };
}

function deactivateUser(store, { requesterRole, requesterUsername, username, role }) {
  const normalizedUsername = normalizeUsername(username);
  ensureUserAdminPermission(store, requesterRole, requesterUsername, role, "users:deactivate");
  const user = store.db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(normalizedUsername);
  if (!user) {
    store.fail("users:deactivate", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
  }
  if (user.role === role.DEV) {
    store.fail("users:deactivate", "Le compte Admin ne peut pas etre supprime.", "USER_PROTECTED");
  }
  store.db
    .prepare(
      `UPDATE users
       SET is_active = 0, updated_by = ?, updated_at = ?
       WHERE username = ?`
    )
    .run(requesterUsername, new Date().toISOString(), normalizedUsername);
  store.logAudit({ actorUsername: requesterUsername, action: "USER_DEACTIVATE", targetUsername: normalizedUsername });
  return { success: true };
}

function updateUserProfile(
  store,
  { requesterRole, requesterUsername, username, fullName, newRole, role, managerProfile, pageAccess, mustResetPassword }
) {
  const normalizedUsername = normalizeUsername(username);
  const requester = getRequesterRow(store, requesterUsername);
  const station = isStationAdminRequester(requester, role);
  const superviseurOnly = isSuperviseurRequester(requester, role);
  if (!station && !superviseurOnly) {
    store.fail("users:updateProfile", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterUsername });
  }

  const user = store.db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(normalizedUsername);
  if (!user) {
    store.fail("users:updateProfile", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { username: normalizedUsername });
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
    const svClean = String(fullName || "").trim();
    if (svClean !== before.fullName) {
      store.fail("users:updateProfile", "Modification du nom reservee aux profils habilites.", "AUTH_FORBIDDEN");
    }
    if (newRole !== before.role) {
      store.fail("users:updateProfile", "Modification du role non autorisee.", "AUTH_FORBIDDEN");
    }
    const nextMpSv = newRole === role.RESPONSABLE ? managerProfile || null : null;
    const beforeMpSv = before.role === role.RESPONSABLE ? before.managerProfile || null : null;
    if (String(nextMpSv || "") !== String(beforeMpSv || "")) {
      store.fail("users:updateProfile", "Modification du profil metier non autorisee.", "AUTH_FORBIDDEN");
    }
    const normalizedIncomingPa = normalizePageAccess(pageAccess, newRole);
    if (JSON.stringify(before.pageAccess) !== JSON.stringify(normalizedIncomingPa)) {
      store.fail(
        "users:updateProfile",
        "Modification des acces pages non autorisee pour votre profil.",
        "AUTH_FORBIDDEN"
      );
    }
  } else {
    ensureStationAdminAccess(store, requesterUsername, role, "users:updateProfile");
  }

  const cleanFullName = String(fullName || "").trim();
  if (!cleanFullName) {
    store.fail("users:updateProfile", "Le nom affiché est obligatoire.", "USER_DISPLAY_NAME_REQUIRED");
  }
  if (![role.OPERATEUR, role.RESPONSABLE].includes(newRole)) {
    store.fail("users:updateProfile", "Role invalide.", "USER_BAD_ROLE", { newRole });
  }
  if (newRole === role.RESPONSABLE && !MANAGER_PROFILES.includes(managerProfile || "")) {
    store.fail("users:updateProfile", "Profil responsable invalide.", "USER_BAD_MANAGER_PROFILE", { managerProfile });
  }

  const nextManagerProfile = newRole === role.RESPONSABLE ? managerProfile : null;
  const requesterCanManagePageAccess = canManagePageAccess(store, requesterRole, requesterUsername, role);
  const nextPageAccess = requesterCanManagePageAccess
    ? normalizePageAccess(pageAccess, newRole)
    : normalizePageAccess(before.pageAccess, newRole);

  if (mustResetPassword) {
    assertHigherRankForPasswordOrUnlock(store, requester, user, role, "users:updateProfile");
  }

  let temporaryPassword = null;
  let passwordHash = user.password_hash;
  let nextMustChangePassword = user.must_change_password;
  if (mustResetPassword) {
    temporaryPassword = generateUniqueTemporaryPasswordForFullName(store, cleanFullName, user.id);
    passwordHash = hashPassword(temporaryPassword);
    nextMustChangePassword = 1;
  }
  store.db
    .prepare(
      `UPDATE users
       SET full_name = ?, role = ?, manager_profile = ?, page_access_json = ?, password_hash = ?, must_change_password = ?, updated_by = ?, updated_at = ?
       WHERE username = ?`
    )
    .run(
      cleanFullName,
      newRole,
      nextManagerProfile,
      JSON.stringify(nextPageAccess),
      passwordHash,
      nextMustChangePassword,
      requesterUsername,
      new Date().toISOString(),
      normalizedUsername
    );
  store.logAudit({
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
        mustChangePassword: Boolean(nextMustChangePassword)
      },
      resetPasswordRequested: Boolean(mustResetPassword)
    }
  });
  return { success: true, temporaryPassword };
}

function ensureDevUser(store, { roles }) {
  const adminUser = store.db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get("admin");
  if (adminUser) return;

  const legacyDev = store.db
    .prepare("SELECT id FROM users WHERE username = ? AND role = ?")
    .get("alexandre", roles.DEV);

  if (legacyDev) {
    store.db
      .prepare(
        `UPDATE users
         SET username = ?, full_name = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .run("admin", "Admin", "system", new Date().toISOString(), legacyDev.id);
    return;
  }

  store.db
    .prepare(
      `INSERT INTO users (
        id, username, full_name, role, password_hash, must_change_password,
        is_active, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      "admin",
      "Admin",
      roles.DEV,
      hashPassword(crypto.randomUUID()),
      0,
      1,
      "system",
      new Date().toISOString()
    );
}

module.exports = {
  isFullNamePasswordPairUsedByAnotherUser,
  assertFullNamePasswordPairUnique,
  generateUniqueTemporaryPasswordForFullName,
  generateUniqueUsername,
  sanitizeUser,
  login,
  completeFirstLogin,
  listUsers,
  createUser,
  deactivateUser,
  updateUserProfile,
  unlockUser,
  ensureDevUser,
  ensureStationAdminAccess
};
