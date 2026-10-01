/**
 * Helpers partagés des fiches ronde : normalisation, durée, snapshot, SQL d'insert.
 *
 * Utilisés par `entries.js` (CRUD) et `entriesBatch.js` (lots).
 *
 * @module electron/store/domains/ronde/entriesShared
 */

const { parseJsonObject, RONDE_ENTRY_SELECT_R } = require("./mapping");
const { normalizeDateIso, normalizeTimeHm } = require("../../core/isoDate");

const ORIGIN_KINDS = new Set(["TELESURVEILLANCE", "CLIENT", "AUTRE"]);
const SOURCES = new Set(["URGENCE", "LIEE_INTERVENTION", "PLANIFIE"]);
const PLANNED_ROUND_KINDS = new Set(["OPENING", "CLOSING", "RANDOM_DAY", "RANDOM_NIGHT"]);
const PLANNED_SLOT_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\d+$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const INSERT_SQL = `INSERT INTO ronde_entries (
  id, created_at, updated_at, source, origin_intervention_id, site_id, site_display,
  request_date, motif_type_id, motif_category, motif_other, horaires_demande_obs,
  origin_kind, origin_detail, intervenant_id, intervenant_name, arrival_time,
  departure_time, duration_minutes, work_order_number, report,
  closure_custom_values_json, planned_profile_id, planned_round_kind, planned_slot_key,
  request_planning_snapshot_json, request_batch_id, status, cancellation_reason, closed_at,
  arrival_date, departure_date, daily_code
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** @param {string} dateIso @param {string} timeIso @returns {number|null} */
function parseDateTimeMs(dateIso, timeIso) {
  const ms = Date.parse(`${dateIso}T${timeIso}:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** @param {string} dateIso @param {number} days */
function shiftIsoDate(dateIso, days) {
  const base = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateIso;
  base.setDate(base.getDate() + days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/**
 * Dates explicites, sinon date de demande. Départ d'horloge plus tôt = lendemain
 * uniquement si la date de départ n'est pas fournie.
 *
 * @param {object} input
 * @returns {{ arrivalDate: string, departureDate: string }}
 */
function resolvePassageDates({ requestDate, arrivalTime, departureTime, arrivalDate, departureDate }) {
  const storedArrival = normalizeDateIso(arrivalDate);
  const storedDeparture = normalizeDateIso(departureDate);
  const resolvedArrival = storedArrival || (arrivalTime && requestDate ? requestDate : "");
  let resolvedDeparture = storedDeparture;
  if (!resolvedDeparture && departureTime && requestDate) {
    const overnight = Boolean(arrivalTime) && departureTime < arrivalTime;
    resolvedDeparture = overnight ? shiftIsoDate(requestDate, 1) : requestDate;
  }
  return { arrivalDate: resolvedArrival, departureDate: resolvedDeparture };
}

/** Minutes réelles entre les deux horodatages, sans rajouter 24 h. */
function computeDurationMinutes({ arrivalDate, arrivalTime, departureDate, departureTime }) {
  if (!arrivalDate || !arrivalTime || !departureDate || !departureTime) return null;
  const arrivalMs = parseDateTimeMs(arrivalDate, arrivalTime);
  const departureMs = parseDateTimeMs(departureDate, departureTime);
  if (arrivalMs == null || departureMs == null || departureMs < arrivalMs) return null;
  return Math.round((departureMs - arrivalMs) / 60000);
}

/** @param {unknown} input @returns {object} */
function normalizeClosureCustomValues(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey || "").trim().toLowerCase()
      .replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 63);
    if (key) output[key] = String(rawValue ?? "").trim().slice(0, 1000);
  }
  return output;
}

/**
 * Valide et normalise les champs métier d'une ronde.
 *
 * @param {import('../../../userStore')} store
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function normalizeRondeBody(store, db, payload) {
  const requestDate = normalizeDateIso(payload.requestDate);
  const siteDisplay = String(payload.siteDisplay || "").trim();
  const intervenantName = String(payload.intervenantName || "").trim();
  if (!requestDate) store.fail("ronde:validate", "La date de la demande est obligatoire.", "RONDE_REQUEST_DATE_REQUIRED");
  if (!siteDisplay) store.fail("ronde:validate", "Le site est obligatoire.", "RONDE_SITE_REQUIRED");
  if (!intervenantName) store.fail("ronde:validate", "Le prestataire est obligatoire.", "RONDE_PRESTATAIRE_REQUIRED");

  const motifTypeId = String(payload.motifTypeId || "").trim();
  if (!motifTypeId) store.fail("ronde:validate", "Le motif est obligatoire.", "RONDE_MOTIF_REQUIRED");
  const motif = await db.get(
    "SELECT id, label, requires_free_text FROM data_ronde_motif_types WHERE id = ?",
    [motifTypeId]
  );
  if (!motif) store.fail("ronde:validate", "Motif inconnu ou non disponible.", "RONDE_MOTIF_INVALID");

  const originKind = String(payload.originKind || "").trim().toUpperCase();
  const originDetail = String(payload.originDetail || "").trim();
  if (!ORIGIN_KINDS.has(originKind)) {
    store.fail("ronde:validate", "Origine de la demande invalide.", "RONDE_ORIGIN_INVALID");
  }
  if (originKind === "CLIENT" && !originDetail) {
    store.fail("ronde:validate", "Nom du client obligatoire lorsque l'origine est « Client ».", "RONDE_ORIGIN_CLIENT_REQUIRED");
  }
  const arrivalTime = normalizeTimeHm(payload.arrivalTime);
  const departureTime = normalizeTimeHm(payload.departureTime);
  const passageDates = resolvePassageDates({
    requestDate,
    arrivalTime,
    departureTime,
    arrivalDate: payload.arrivalDate,
    departureDate: payload.departureDate
  });
  const durationMinutes = computeDurationMinutes({
    arrivalDate: passageDates.arrivalDate,
    arrivalTime,
    departureDate: passageDates.departureDate,
    departureTime
  });
  if (arrivalTime && departureTime && durationMinutes == null) {
    store.fail(
      "ronde:validate",
      "La date et l'heure de départ doivent être postérieures à l'arrivée.",
      "RONDE_PASSAGE_ORDER"
    );
  }
  return {
    siteId: payload.siteId || null,
    siteDisplay,
    requestDate,
    motifTypeId,
    motifCategorySnapshot: String(motif.label || "").trim().slice(0, 200) || "—",
    motifOther: String(payload.motifDetail ?? payload.motifOther ?? "").trim(),
    horairesDemandeObs: String(payload.horairesDemandeObs || "").trim(),
    originKind,
    originDetail,
    intervenantId: payload.intervenantId || null,
    intervenantName,
    arrivalTime,
    departureTime,
    arrivalDate: passageDates.arrivalDate || null,
    departureDate: passageDates.departureDate || null,
    durationMinutes,
    workOrderNumber: String(payload.workOrderNumber || "").trim(),
    report: String(payload.report || "").trim(),
    closureCustomValues: normalizeClosureCustomValues(payload.closureCustomValues)
  };
}

/**
 * Charge une ronde et son motif depuis PostgreSQL.
 *
 * @param {object} db
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getRondeById(db, id) {
  return db.get(
    `SELECT ${RONDE_ENTRY_SELECT_R}, m.label AS motif_type_label,
            m.requires_free_text AS motif_type_requires_free_text
     FROM ronde_entries r
     LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
     WHERE r.id = ?`,
    [id]
  );
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Jour d’attribution du numéro de fiche.
 * Lot exceptionnel : date de la demande (figée pour tout le lot, même si le passage théorique change).
 * Ronde contractuelle : date théorique du passage.
 *
 * @param {string} source
 * @param {string} passageDateIso
 * @param {unknown} snapshotJson
 * @returns {string}
 */
function resolveRondeDailyCodeDayIso(source, passageDateIso, snapshotJson) {
  if (String(source || "").trim().toUpperCase() === "PLANIFIE") {
    return passageDateIso;
  }
  const parsed = parseJsonObject(snapshotJson, null);
  const demandDate = String(parsed?.requestDate || "").trim();
  return ISO_DAY_RE.test(demandDate) ? demandDate : passageDateIso;
}

/** @param {unknown} raw @param {string} source @param {import('../../../userStore')} store @returns {string|null} */
function normalizePlanningSnapshot(raw, source, store) {
  if (raw == null || source === "PLANIFIE") return null;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  if (text.length > 400000) {
    store.fail("ronde:validate", "Paramètres de demande trop volumineux.", "RONDE_PLANNING_SNAPSHOT_TOO_LARGE");
  }
  const parsed = parseJsonObject(text, null);
  return parsed?.version === 1 ? JSON.stringify(parsed) : null;
}

/**
 * Valide les métadonnées d'une ronde planifiée.
 *
 * @param {object} store
 * @param {object} db
 * @param {string} source
 * @param {unknown} profileId
 * @param {unknown} roundKind
 * @returns {Promise<{plannedProfileId:string|null,plannedRoundKind:string|null}>}
 */
async function ensurePlannedMeta(store, db, source, profileId, roundKind) {
  if (source !== "PLANIFIE") return { plannedProfileId: null, plannedRoundKind: null };
  const plannedProfileId = String(profileId || "").trim();
  const plannedRoundKind = String(roundKind || "").trim().toUpperCase();
  if (!plannedProfileId || !plannedRoundKind) {
    store.fail("ronde:validate", "Contexte planifié incomplet (profil ou type de passage).", "RONDE_PLANNED_META_REQUIRED");
  }
  if (!PLANNED_ROUND_KINDS.has(plannedRoundKind)) {
    store.fail("ronde:validate", "Type de passage planifié invalide.", "RONDE_PLANNED_KIND_INVALID");
  }
  if (!await db.get("SELECT id FROM data_ronde_planned_profiles WHERE id = ?", [plannedProfileId])) {
    store.fail("ronde:validate", "Profil de planification introuvable.", "RONDE_PLANNED_PROFILE_NOT_FOUND");
  }
  return { plannedProfileId, plannedRoundKind };
}

/**
 * Premier gardiennage lié à chaque ronde (`gardiennage_entries.linked_ronde_id`).
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {object[]} entries
 * @returns {Promise<object[]>}
 */
async function attachLinkedGardiennageIds(db, entries) {
  const ids = entries.map((entry) => String(entry.id || "").trim()).filter(Boolean);
  if (ids.length === 0) return entries;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await db.all(
    `SELECT id, linked_ronde_id FROM gardiennage_entries
     WHERE linked_ronde_id IN (${placeholders}) ORDER BY created_at ASC`,
    ids
  );
  const firstByRonde = new Map();
  for (const row of rows) {
    const rondeId = String(row.linked_ronde_id || "").trim();
    if (rondeId && !firstByRonde.has(rondeId)) firstByRonde.set(rondeId, row.id);
  }
  return entries.map((entry) => ({
    ...entry,
    linkedGardiennageId: firstByRonde.get(entry.id) || null
  }));
}

module.exports = {
  INSERT_SQL,
  TIME_RE,
  ORIGIN_KINDS,
  SOURCES,
  PLANNED_ROUND_KINDS,
  PLANNED_SLOT_KEY_RE,
  parseDateTimeMs,
  computeDurationMinutes,
  normalizeClosureCustomValues,
  normalizeRondeBody,
  getRondeById,
  resolveRondeDailyCodeDayIso,
  normalizePlanningSnapshot,
  ensurePlannedMeta,
  attachLinkedGardiennageIds
};
