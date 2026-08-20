/**
 * Domaine Main courante — PostgreSQL seulement.
 *
 * La façade exporte les fonctions métier actives et le mapper SQL → API.
 * Aucune trace de compatibilité legacy ou SQLite n'est conservée ici.
 *
 * @module electron/store/domains/mainCourante
 */

const entries = require("./entries");
const { mapMainCouranteRow } = require("./mapping");

module.exports = {
  mapMainCouranteRow,
  ...entries
};
