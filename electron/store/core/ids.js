/**
 * Génération d'identifiants techniques stables pour les entités métier (UUID v4).
 * Point unique pour éviter des stratégies d'ID divergentes entre domaines et schémas.
 *
 * Les UUID restent internes (BDD, IPC) ; l'UI affiche des libellés métier selon les règles projet.
 */

const crypto = require("crypto");

/**
 * Produit un identifiant unique pour une nouvelle ligne (création référentiel, utilisateur, gardiennage, etc.).
 *
 * @returns {string} UUID v4 (`crypto.randomUUID`).
 */
function generateEntityId() {
  return crypto.randomUUID();
}

module.exports = { generateEntityId };
