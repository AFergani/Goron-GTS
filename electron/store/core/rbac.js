/**
 * Contrôles RBAC transverses pour la gestion des données (référentiels, paramètres, modèles, imports).
 * Complète les droits par page côté UI : ici, rôles applicatifs `OPERATEUR`, `RESPONSABLE`, `DEV`.
 *
 * Les fonctions reçoivent `fail` (typiquement `store.fail`) pour journaliser et lever `AppError` à code `AUTH_FORBIDDEN`.
 * Exposées via `UserStore.ensureData*Role`, appelées dans les domaines et `documentTemplates` / IPC système.
 */

/**
 * Exige le rôle responsable ou dev (création / modification référentiels, imports, modèles scopés, etc.).
 *
 * @param {string} requesterRole - Rôle de la session (`ROLE.*`).
 * @param {(source: string, message: string, code: string, details?: object) => never} fail - Callback d'échec (`store.fail`).
 * @param {{ OPERATEUR: string, RESPONSABLE: string, DEV: string }} role - Constantes de rôles (`UserStore` / `ROLE`).
 * @returns {void}
 * @throws {import('./errors').AppError} Via `fail` si rôle opérateur ou inconnu.
 */
function ensureDataManagerRole(requesterRole, fail, role) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    fail("data:forbidden", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
}

/**
 * Exige le rôle responsable ou dev pour une suppression référentielle.
 *
 * @param {string} requesterRole
 * @param {(source: string, message: string, code: string, details?: object) => never} fail
 * @param {{ OPERATEUR: string, RESPONSABLE: string, DEV: string }} role
 * @returns {void}
 * @throws {import('./errors').AppError} Via `fail` avec source `data:delete:forbidden`.
 */
function ensureDataDeleteRole(requesterRole, fail, role) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    fail("data:delete:forbidden", "Acces refuse: suppression reservee au responsable.", "AUTH_FORBIDDEN", {
      requesterRole
    });
  }
}

/**
 * Exige au minimum un rôle authentifié métier (lecture : opérateur, responsable ou dev).
 *
 * @param {string} requesterRole
 * @param {(source: string, message: string, code: string, details?: object) => never} fail
 * @param {{ OPERATEUR: string, RESPONSABLE: string, DEV: string }} role
 * @returns {void}
 * @throws {import('./errors').AppError} Via `fail` si rôle absent ou non reconnu.
 */
function ensureDataReaderRole(requesterRole, fail, role) {
  if (requesterRole !== role.OPERATEUR && requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    fail("data:forbidden", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
}

module.exports = { ensureDataManagerRole, ensureDataDeleteRole, ensureDataReaderRole };
