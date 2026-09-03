/**
 * Projections des lignes PostgreSQL `users` vers les objets métier.
 *
 * Utilisé par le domaine d'authentification pour normaliser les accès aux pages
 * et produire des instantanés d'audit sans mot de passe.
 *
 * @module electron/store/domains/users/userMapping
 */

/**
 * Colonnes explicites de `users` (évite `SELECT *`).
 * @type {string}
 */
const USERS_SELECT = `id, username, full_name, role, manager_profile, theme_mode, page_access_json,
  password_hash, password_history_json, must_change_password, failed_login_attempts, is_locked, locked_at, is_active,
  created_by, created_at, updated_by, updated_at`;

/**
 * Applique les accès aux pages : les vues métier sont toujours ouvertes, seul
 * Paramètres est réglable (off par défaut pour un opérateur, on pour un responsable).
 *
 * @param {object|null|undefined} pageAccess
 * @param {string} role
 * @returns {object}
 */
function normalizePageAccess(pageAccess, role) {
  const settingsDefault = role !== "OPERATEUR";
  return {
    mainCourante: true,
    fransor: true,
    intervention: true,
    rondes: true,
    gardiennage: true,
    settings: pageAccess?.settings ?? settingsDefault
  };
}

/**
 * Mappe une ligne `users` vers l'objet exposé au renderer.
 *
 * @param {object} user
 * @returns {object}
 */
function sanitizeUser(user) {
  let parsedPageAccess = null;
  try {
    parsedPageAccess = user.page_access_json ? JSON.parse(user.page_access_json) : null;
  } catch {
    parsedPageAccess = null;
  }
  const pageAccess = normalizePageAccess(parsedPageAccess, user.role);
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    managerProfile: user.manager_profile || null,
    pageAccess,
    mustChangePassword: Boolean(Number(user.must_change_password)),
    isActive: Boolean(Number(user.is_active)),
    isLocked: Boolean(Number(user.is_locked)),
    failedLoginAttempts: Number(user.failed_login_attempts || 0),
    createdBy: user.created_by,
    createdAt: user.created_at,
    updatedBy: user.updated_by || undefined,
    updatedAt: user.updated_at || undefined
  };
}

/**
 * Prépare une projection métier sans identifiant technique pour l'audit.
 *
 * @param {object} user
 * @returns {object}
 */
function toUserAuditSnapshot(user) {
  const sanitized = sanitizeUser(user);
  return {
    fullName: sanitized.fullName,
    role: sanitized.role,
    managerProfile: sanitized.managerProfile || null,
    pageAccess: sanitized.pageAccess,
    isActive: sanitized.isActive,
    isLocked: sanitized.isLocked,
    mustChangePassword: sanitized.mustChangePassword
  };
}

module.exports = {
  USERS_SELECT,
  normalizePageAccess,
  sanitizeUser,
  toUserAuditSnapshot
};
