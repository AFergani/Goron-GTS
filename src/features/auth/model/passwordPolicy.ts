/**
 * Règle de mot de passe choisi par l'agent (première connexion).
 *
 * Huit caractères minimum, sans contrainte de classes de caractères :
 * l'application reste sur le réseau local. Le contrôle définitif est
 * dans `authUsersHelpers.js` (`MIN_USER_PASSWORD_LENGTH`).
 */

/** Longueur minimale d'un mot de passe personnel. */
export const MIN_USER_PASSWORD_LENGTH = 8;
