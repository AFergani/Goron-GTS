/**
 * Contrôles RBAC transverses pour la gestion des données (référentiels, paramètres, modèles, imports).
 * Complète les droits par page côté UI : rôles applicatifs `OPERATEUR`, `RESPONSABLE`, `DEV`.
 *
 * Les fonctions reçoivent `fail` (typiquement `store.fail`) pour journaliser et lever `AppError`
 * à code `AUTH_FORBIDDEN`. Exposées via `UserStore.ensureData*Role`.
 *
 * @module electron/store/core/rbac
 */

/**
 * @param {string} requesterRole
 * @returns {boolean} `true` si responsable ou DEV.
 */
function isDataManagerRole(requesterRole) {
  return requesterRole === "RESPONSABLE" || requesterRole === "DEV";
}

/**
 * @param {string} requesterRole
 * @returns {boolean} `true` si opérateur, responsable ou DEV.
 */
function isDataReaderRole(requesterRole) {
  return requesterRole === "OPERATEUR" || isDataManagerRole(requesterRole);
}

/**
 * Exige le rôle responsable ou DEV (création / modification référentiels, imports, modèles scopés).
 *
 * @param {string} requesterRole - Rôle de la session.
 * @param {(source: string, message: string, code: string, details?: object) => never} fail
 * @returns {void}
 * @throws {import('./errors').AppError} Via `fail` si rôle opérateur ou inconnu.
 */
function ensureDataManagerRole(requesterRole, fail) {
  if (!isDataManagerRole(requesterRole)) {
    fail("data:forbidden", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
}

/**
 * Exige le rôle responsable ou DEV pour une suppression référentielle.
 *
 * @param {string} requesterRole
 * @param {(source: string, message: string, code: string, details?: object) => never} fail
 * @returns {void}
 * @throws {import('./errors').AppError} Via `fail` avec source `data:delete:forbidden`.
 */
function ensureDataDeleteRole(requesterRole, fail) {
  if (!isDataManagerRole(requesterRole)) {
    fail("data:delete:forbidden", "Accès refusé : suppression réservée au responsable.", "AUTH_FORBIDDEN", {
      requesterRole
    });
  }
}

/**
 * Exige un rôle métier authentifié (lecture : opérateur, responsable ou DEV).
 *
 * @param {string} requesterRole
 * @param {(source: string, message: string, code: string, details?: object) => never} fail
 * @returns {void}
 * @throws {import('./errors').AppError} Via `fail` si rôle absent ou non reconnu.
 */
function ensureDataReaderRole(requesterRole, fail) {
  if (!isDataReaderRole(requesterRole)) {
    fail("data:forbidden", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
}

module.exports = { ensureDataManagerRole, ensureDataDeleteRole, ensureDataReaderRole };
