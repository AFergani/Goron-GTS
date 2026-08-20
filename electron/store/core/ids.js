/**
 * Génération d'identifiants techniques stables pour les entités métier (UUID v4).
 * Point unique côté store : les domaines Electron passent par ici, pas par `crypto.randomUUID` direct.
 *
 * Les UUID restent internes (BDD, IPC) ; l'UI affiche des libellés métier.
 *
 * @module electron/store/core/ids
 */

const crypto = require("crypto");

/**
 * Produit un identifiant unique pour une nouvelle ligne métier.
 *
 * @returns {string} UUID v4 (`crypto.randomUUID`).
 */
function generateEntityId() {
  return crypto.randomUUID();
}

module.exports = { generateEntityId };
