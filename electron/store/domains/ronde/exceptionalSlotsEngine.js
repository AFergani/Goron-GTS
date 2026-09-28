/**
 * Helpers de resync des lots exceptionnels (clés observation, multiset).
 * La liste des créneaux vient de `exceptionalSlotList` (noyau `slotTimeKernel`).
 *
 * @module electron/store/domains/ronde/exceptionalSlotsEngine
 */

const { buildDesiredExceptionalSlotList } = require("./exceptionalSlotList");
const { extractHeureDemandeeHm } = require("./passageRules");

/** Clé canonique passage : dateISO|heure. */
function exceptionalPlanningSlotKey(requestDate, requestedTime) {
  return `${String(requestDate || "").trim()}|${String(requestedTime || "").trim()}`;
}

/**
 * Extrait depuis `horaires_demande_obs` (création auto ou heuristique hh:mm).
 *
 * @param {string} requestDateIso
 * @param {string} obs
 * @returns {string}
 */
function extractSlotKeyFromRondeObservation(requestDateIso, obs) {
  const o = String(obs || "");
  const hm = extractHeureDemandeeHm(o);
  if (hm) return exceptionalPlanningSlotKey(requestDateIso, hm);
  const any = /(^|\s)([01]\d|2[0-3]):([0-5]\d)(\s|$)/.exec(o);
  if (any) return exceptionalPlanningSlotKey(requestDateIso, `${any[2]}:${any[3]}`);
  return exceptionalPlanningSlotKey(requestDateIso, "");
}

/**
 * Décrémente le compteur d'une clé passage (resync lot vs fiches existantes).
 *
 * @param {Map<string, number>} mapObj
 * @param {string} slotKeyStr
 * @returns {boolean}
 */
function multisetConsumeOne(mapObj, slotKeyStr) {
  const c = mapObj.get(slotKeyStr) || 0;
  if (c <= 0) return false;
  mapObj.set(slotKeyStr, c - 1);
  return true;
}

/**
 * Ajoute les passages désirés au multiset (clé canonique date|heure).
 *
 * @param {Map<string, number>} mapObj
 * @param {Array<{ requestDate: string, requestedTime: string }>} slotList
 * @returns {void}
 */
function multisetAddMany(mapObj, slotList) {
  for (const s of slotList) {
    const k = exceptionalPlanningSlotKey(s.requestDate, s.requestedTime);
    mapObj.set(k, (mapObj.get(k) || 0) + 1);
  }
}

module.exports = {
  buildDesiredExceptionalSlotList,
  extractSlotKeyFromRondeObservation,
  multisetAddMany,
  multisetConsumeOne
};
