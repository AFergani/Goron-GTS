/**
 * Point d'entrée du domaine utilisateurs.
 *
 * Authentification / comptes (`authUsers`), préférences thème (`userPreferences`),
 * présence multi-postes (`presence`).
 *
 * @module electron/store/domains/users
 */

const authUsers = require("./authUsers");
const userPreferences = require("./userPreferences");
const presence = require("./presence");

module.exports = {
  authUsers,
  userPreferences,
  presence
};
