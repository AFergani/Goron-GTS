/**
 * Point d'entrée des domaines utilisateurs.
 *
 * Regroupe l'authentification, la gestion des comptes et les préférences utilisateur.
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
