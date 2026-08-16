/**
 * Profils et lignes de rondes planifiées, stockés exclusivement dans PostgreSQL.
 *
 * @module electron/store/domains/ronde/plannedProfiles
 */

const { generateEntityId } = require("../../core/ids");
const { requireRondePersistence } = require("./persistence");

const ROUND_KINDS = new Set(["OPENING", "CLOSING", "ACCOMPAGNEMENT", "RANDOM"]);
const RECURRENCE_KINDS = new Set(["WEEKLY", "DAILY", "MONTHLY", "DATE_RANGE"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSURE_FIELD_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);

/** @param {unknown} raw @returns {object[]} */
function parseClosureFields(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {unknown} value @returns {string} */
function toFieldKey(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "").slice(0, 40);
}

/**
 * Normalise et valide les champs du formulaire de clôture.
 *
 * @param {object} store
 * @param {boolean} enabled
 * @param {unknown} input
 * @param {string} source
 * @returns {object[]}
 */
function normalizeClosureFields(store, enabled, input, source) {
  const fields = (Array.isArray(input) ? input : []).slice(0, 30).map((field, index) => ({
    id: String(field?.id || "").trim() || generateEntityId(),
    key: toFieldKey(field?.key) || `champ_${index + 1}`,
    labelTemplate: String(field?.labelTemplate || "").trim(),
    type: String(field?.type || "text").trim().toLowerCase(),
    required: Boolean(field?.required),
    placeholder: String(field?.placeholder || "").trim().slice(0, 160),
    options: Array.isArray(field?.options)
      ? field.options.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 20)
      : []
  }));
  const keys = new Set();
  fields.forEach((field, index) => {
    const prefix = `Champ ${index + 1} : `;
    if (!field.labelTemplate) store.fail(source, `${prefix}Le libellé est obligatoire.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_LABEL_REQUIRED");
    if (!CLOSURE_FIELD_TYPES.has(field.type)) {
      store.fail(source, `${prefix}Type de champ invalide.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_TYPE_INVALID");
    }
    if (field.type === "select" && !field.options.length) {
      store.fail(source, `${prefix}Ajoutez au moins une option.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_OPTIONS_REQUIRED");
    }
    if (keys.has(field.key)) {
      store.fail(source, `${prefix}Nom de donnée déjà utilisé.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_KEY_DUPLICATE");
    }
    keys.add(field.key);
  });
  if (enabled && !fields.length) {
    store.fail(source, "Ajoutez au moins un champ au formulaire de clôture.", "DATA_RONDE_PLANNED_CLOSURE_FIELDS_REQUIRED");
  }
  return fields;
}

/** @param {object} body @returns {object} */
function normalizeLine(body) {
  let roundKind = String(body.roundKind || "").trim().toUpperCase();
  let randomPeriodMask = Number(body.randomPeriodMask ?? 3);
  if (!Number.isFinite(randomPeriodMask) || randomPeriodMask < 1 || randomPeriodMask > 3) randomPeriodMask = 3;
  if (roundKind === "RANDOM_DAY") {
    roundKind = "RANDOM";
    randomPeriodMask = 1;
  } else if (roundKind === "RANDOM_NIGHT") {
    roundKind = "RANDOM";
    randomPeriodMask = 2;
  }
  const recurrenceKind = String(body.recurrenceKind || "").trim().toUpperCase();
  let weekdaysMask = Number(body.weekdaysMask);
  if (!Number.isFinite(weekdaysMask)) weekdaysMask = 0;
  weekdaysMask = Math.min(127, Math.max(0, weekdaysMask));
  const numberOrNull = (value) => {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : "__INVALID__";
  };
  return {
    clientLineId: String(body.id || "").trim() || null,
    roundKind,
    recurrenceKind,
    weekdaysMask,
    monthDay: numberOrNull(body.monthDay),
    requestedTime: String(body.requestedTime || "").trim() || null,
    intervalMinutes: numberOrNull(body.intervalMinutes),
    motifTypeId: String(body.motifTypeId || "").trim() || null,
    randomPeriodMask,
    rangeStartDate: String(body.rangeStartDate || "").trim().slice(0, 10) || null,
    rangeEndDate: String(body.rangeEndDate || "").trim().slice(0, 10) || null,
    randomWindowStart: String(body.randomWindowStart || "").trim().slice(0, 5) || null,
    randomWindowEnd: String(body.randomWindowEnd || "").trim().slice(0, 5) || null,
    randomRoundsCount: numberOrNull(body.randomRoundsCount),
    includeHolidays: Boolean(body.includeHolidays),
    includeHolidayEves: Boolean(body.includeHolidayEves)
  };
}

/**
 * Valide une ligne et son motif PostgreSQL.
 *
 * @param {object} store
 * @param {object} db
 * @param {object} line
 * @param {number} index
 * @returns {Promise<void>}
 */
async function validateLine(store, db, line, index) {
  const source = "data:rondePlannedProfiles:upsert";
  const prefix = `Ligne ${index + 1} : `;
  if (!ROUND_KINDS.has(line.roundKind) || !RECURRENCE_KINDS.has(line.recurrenceKind)) {
    store.fail(source, `${prefix}Type ou récurrence invalide.`, "DATA_RONDE_PLANNED_INVALID");
  }
  if (["OPENING", "CLOSING", "ACCOMPAGNEMENT"].includes(line.roundKind) && !TIME_RE.test(line.requestedTime || "")) {
    store.fail(source, `${prefix}Heure demandée obligatoire (format 24 h).`, "DATA_RONDE_PLANNED_TIME");
  }
  if (line.roundKind === "RANDOM") {
    if ((line.randomPeriodMask & 3) === 0) {
      store.fail(source, `${prefix}Activez une période aléatoire.`, "DATA_RONDE_PLANNED_RANDOM_PERIOD");
    }
    if (Boolean(line.randomWindowStart) !== Boolean(line.randomWindowEnd)
      || (line.randomWindowStart && !TIME_RE.test(line.randomWindowStart))
      || (line.randomWindowEnd && !TIME_RE.test(line.randomWindowEnd))) {
      store.fail(source, `${prefix}Fenêtre aléatoire invalide.`, "DATA_RONDE_PLANNED_RANDOM_WINDOW");
    }
    if (line.randomRoundsCount === "__INVALID__" || Number(line.randomRoundsCount || 1) < 1) {
      store.fail(source, `${prefix}Nombre de rondes invalide.`, "DATA_RONDE_PLANNED_RANDOM_ROUNDS");
    }
  }
  if (line.recurrenceKind === "DATE_RANGE"
    && (!line.rangeStartDate || !line.rangeEndDate || line.rangeEndDate < line.rangeStartDate)) {
    store.fail(source, `${prefix}Plage de dates invalide.`, "DATA_RONDE_PLANNED_RANGE_DATES");
  }
  if (line.recurrenceKind === "MONTHLY"
    && (line.monthDay === "__INVALID__" || line.monthDay < 1 || line.monthDay > 31)) {
    store.fail(source, `${prefix}Jour du mois invalide.`, "DATA_RONDE_PLANNED_MONTH_DAY");
  }
  if (line.intervalMinutes === "__INVALID__" || Number(line.intervalMinutes || 1) < 1) {
    store.fail(source, `${prefix}Fréquence invalide.`, "DATA_RONDE_PLANNED_INTERVAL");
  }
  if (line.motifTypeId
    && !await db.get("SELECT id FROM data_ronde_motif_types WHERE id = ?", [line.motifTypeId])) {
    store.fail(source, `${prefix}Motif de ronde inconnu.`, "DATA_RONDE_PLANNED_MOTIF_NOT_FOUND");
  }
}

/** @param {object} row @returns {object} */
function mapLineRow(row) {
  let roundKind = String(row.round_kind || "OPENING").toUpperCase();
  let randomPeriodMask = Number(row.random_period_mask ?? 3);
  if (roundKind === "RANDOM_DAY") { roundKind = "RANDOM"; randomPeriodMask = 1; }
  if (roundKind === "RANDOM_NIGHT") { roundKind = "RANDOM"; randomPeriodMask = 2; }
  return {
    id: row.id,
    profileId: row.profile_id,
    sortOrder: Number(row.sort_order || 0),
    roundKind,
    recurrenceKind: row.recurrence_kind || "WEEKLY",
    weekdaysMask: Number(row.weekdays_mask || 0),
    monthDay: row.month_day == null ? null : Number(row.month_day),
    requestedTime: row.requested_time || null,
    intervalMinutes: row.interval_minutes == null ? null : Number(row.interval_minutes),
    randomPeriodMask,
    randomWindowStart: row.random_window_start || null,
    randomWindowEnd: row.random_window_end || null,
    randomRoundsCount: row.random_rounds_count == null ? null : Number(row.random_rounds_count),
    includeHolidays: Boolean(row.include_holidays),
    includeHolidayEves: Boolean(row.include_holiday_eves),
    rangeStartDate: row.range_start_date || null,
    rangeEndDate: row.range_end_date || null,
    motifTypeId: row.motif_type_id || null,
    motifTypeLabel: row.motif_type_label || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** @param {object} profile @param {object[]} lines @returns {object} */
function mapProfileRow(profile, lines) {
  const today = new Date().toISOString().slice(0, 10);
  const from = profile.planning_valid_from || null;
  const to = profile.planning_valid_to || null;
  return {
    id: profile.id,
    label: profile.label || "",
    siteId: profile.site_id || null,
    siteDisplay: profile.site_display || null,
    intervenantId: profile.intervenant_id || null,
    intervenantDisplay: profile.intervenant_display || null,
    notes: profile.notes || "",
    planningValidFrom: from,
    planningValidTo: to,
    isActive: (!from || today >= from) && (!to || today <= to),
    validatedAt: profile.validated_at || null,
    validatedByUsername: profile.validated_by || null,
    createRoundsEnabled: profile.create_rounds_enabled == null ? true : Boolean(profile.create_rounds_enabled),
    closureFormEnabled: Boolean(profile.closure_form_enabled),
    closureFields: parseClosureFields(profile.closure_fields_json),
    lines,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at
  };
}

/** @param {object} db @param {string|null} id @returns {Promise<object|null>} */
async function getProfileById(db, id) {
  const profile = await db.get(
    `SELECT p.*, CASE WHEN s.id IS NULL THEN NULL
       WHEN trim(COALESCE(s.code, '')) <> '' AND trim(COALESCE(s.name, '')) <> ''
         THEN concat(s.code, ' — ', s.name)
       ELSE COALESCE(NULLIF(trim(s.name), ''), NULLIF(trim(s.code), '')) END AS site_display,
       i.name AS intervenant_display
     FROM data_ronde_planned_profiles p
     LEFT JOIN data_sites s ON s.id = p.site_id
     LEFT JOIN data_intervenants i ON i.id = p.intervenant_id
     WHERE p.id = ?`,
    [id]
  );
  if (!profile) return null;
  const lines = await db.all(
    `SELECT l.*, m.label AS motif_type_label
     FROM data_ronde_planned_profile_lines l
     LEFT JOIN data_ronde_motif_types m ON m.id = l.motif_type_id
     WHERE l.profile_id = ? ORDER BY l.sort_order ASC, l.created_at ASC`,
    [id]
  );
  return mapProfileRow(profile, lines.map(mapLineRow));
}

/**
 * Liste les profils et leurs lignes.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object[]>}
 */
async function listRondePlannedProfiles(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireRondePersistence(store, "data:rondePlannedProfiles:list");
  const ids = await db.all("SELECT id FROM data_ronde_planned_profiles ORDER BY lower(label), id", []);
  return Promise.all(ids.map((row) => getProfileById(db, row.id)));
}

/**
 * Crée ou remplace un profil et ses lignes dans une transaction.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function upsertRondePlannedProfile(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const source = "data:rondePlannedProfiles:upsert";
  const db = requireRondePersistence(store, source);
  const label = String(payload.label || "").trim();
  const planningValidFrom = String(payload.planningValidFrom || "").trim().slice(0, 10) || null;
  const planningValidTo = String(payload.planningValidTo || "").trim().slice(0, 10) || null;
  if (!label) store.fail(source, "Libellé du profil obligatoire.", "DATA_RONDE_PLANNED_REQUIRED");
  if (!planningValidFrom) {
    store.fail(source, "Indiquez la date de début de validité.", "DATA_RONDE_PLANNED_PLANNING_FROM_REQUIRED");
  }
  if (planningValidTo && planningValidTo < planningValidFrom) {
    store.fail(source, "La date de fin doit suivre la date de début.", "DATA_RONDE_PLANNED_PLANNING_ORDER");
  }
  const siteId = String(payload.siteId || "").trim() || null;
  const intervenantId = String(payload.intervenantId || "").trim() || null;
  if (siteId && !await db.get("SELECT id FROM data_sites WHERE id = ?", [siteId])) {
    store.fail(source, "Site inconnu.", "DATA_RONDE_PLANNED_SITE_NOT_FOUND");
  }
  if (!intervenantId) {
    store.fail(source, "Prestataire obligatoire pour le profil.", "DATA_RONDE_PLANNED_INTERVENANT_REQUIRED");
  }
  if (!await db.get("SELECT id FROM data_intervenants WHERE id = ?", [intervenantId])) {
    store.fail(source, "Prestataire inconnu.", "DATA_RONDE_PLANNED_INTERVENANT_NOT_FOUND");
  }
  const lines = (Array.isArray(payload.lines) ? payload.lines : []).map(normalizeLine);
  if (!lines.length) store.fail(source, "Ajoutez au moins une ligne de planification.", "DATA_RONDE_PLANNED_LINES_REQUIRED");
  for (let index = 0; index < lines.length; index += 1) await validateLine(store, db, lines[index], index);
  const closureFormEnabled = Boolean(payload.closureFormEnabled);
  const closureFields = normalizeClosureFields(store, closureFormEnabled, payload.closureFields, source);
  const requestedId = String(payload.id || "").trim();
  const existing = requestedId
    ? await db.get("SELECT * FROM data_ronde_planned_profiles WHERE id = ?", [requestedId])
    : null;
  if (requestedId && !existing) store.fail(source, "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  const id = requestedId || generateEntityId();
  const now = new Date().toISOString();
  const isManager = payload.requesterRole === "RESPONSABLE" || payload.requesterRole === "DEV";
  const autoValidate = Boolean(payload.autoValidate) && isManager;
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.run(
        `UPDATE data_ronde_planned_profiles SET label = ?, site_id = ?, intervenant_id = ?,
         notes = ?, is_active = 1, create_rounds_enabled = ?, closure_form_enabled = ?,
         closure_fields_json = ?, planning_valid_from = ?, planning_valid_to = ?, updated_at = ? WHERE id = ?`,
        [label, siteId, intervenantId, String(payload.notes || "").trim() || null,
          payload.createRoundsEnabled !== false ? 1 : 0, closureFormEnabled ? 1 : 0,
          JSON.stringify(closureFields), planningValidFrom, planningValidTo, now, id]
      );
    } else {
      await tx.run(
        `INSERT INTO data_ronde_planned_profiles (
          id, label, site_id, intervenant_id, notes, is_active, create_rounds_enabled,
          closure_form_enabled, closure_fields_json, planning_valid_from, planning_valid_to,
          validated_at, validated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, label, siteId, intervenantId, String(payload.notes || "").trim() || null,
          payload.createRoundsEnabled !== false ? 1 : 0, closureFormEnabled ? 1 : 0,
          JSON.stringify(closureFields), planningValidFrom, planningValidTo,
          autoValidate ? now : null, autoValidate ? String(payload.requesterUsername || "unknown") : null,
          now, now]
      );
    }
    await tx.run("DELETE FROM data_ronde_planned_profile_lines WHERE profile_id = ?", [id]);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const recurrenceKind = line.recurrenceKind;
      await tx.run(
        `INSERT INTO data_ronde_planned_profile_lines (
          id, profile_id, sort_order, round_kind, recurrence_kind, weekdays_mask, month_day,
          requested_time, interval_minutes, motif_type_id, random_period_mask, range_start_date,
          range_end_date, random_window_start, random_window_end, random_rounds_count,
          include_holidays, include_holiday_eves, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [UUID_RE.test(line.clientLineId || "") ? line.clientLineId : generateEntityId(), id, index,
          line.roundKind, recurrenceKind,
          recurrenceKind === "DAILY" ? 127 : ["MONTHLY", "DATE_RANGE"].includes(recurrenceKind) ? 0 : line.weekdaysMask,
          recurrenceKind === "MONTHLY" ? line.monthDay : null,
          ["OPENING", "CLOSING", "ACCOMPAGNEMENT"].includes(line.roundKind) ? line.requestedTime : null,
          line.intervalMinutes === "__INVALID__" ? null : line.intervalMinutes, line.motifTypeId,
          line.roundKind === "RANDOM" ? line.randomPeriodMask : 3,
          recurrenceKind === "DATE_RANGE" ? line.rangeStartDate : null,
          recurrenceKind === "DATE_RANGE" ? line.rangeEndDate : null,
          line.roundKind === "RANDOM" ? line.randomWindowStart : null,
          line.roundKind === "RANDOM" ? line.randomWindowEnd : null,
          line.roundKind === "RANDOM" ? line.randomRoundsCount : null,
          line.includeHolidays ? 1 : 0, line.includeHolidayEves ? 1 : 0, now, now]
      );
    }
  });
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown",
    action: existing ? "DATA_RONDE_PLANNED_PROFILE_UPDATE" : "DATA_RONDE_PLANNED_PROFILE_CREATE",
    details: { id, label, siteId, createRoundsEnabled: payload.createRoundsEnabled !== false,
      lineCount: lines.length, ...(!existing && autoValidate ? { autoValidated: true } : {}) } });
  return getProfileById(db, id);
}

/**
 * Supprime un profil sans ronde clôturée, sinon le désactive.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{success:boolean,action:string}>}
 */
async function deleteRondePlannedProfile(store, payload) {
  store.ensureDataDeleteRole(payload.requesterRole);
  const db = requireRondePersistence(store, "data:rondePlannedProfiles:delete");
  const id = String(payload.id || "").trim();
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("data:rondePlannedProfiles:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  const existing = await db.get("SELECT * FROM data_ronde_planned_profiles WHERE id = ?", [id]);
  if (!existing) store.fail("data:rondePlannedProfiles:delete", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  const stats = await db.get(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'CLOTURE' THEN 1 ELSE 0 END) AS closed_count
     FROM ronde_entries WHERE planned_profile_id = ?`,
    [id]
  );
  const total = Number(stats?.total || 0);
  const closed = Number(stats?.closed_count || 0);
  if (closed > 0) {
    await db.run(
      "UPDATE data_ronde_planned_profiles SET is_active = 0, create_rounds_enabled = 0, updated_at = ? WHERE id = ?",
      [new Date().toISOString(), id]
    );
    store.logAudit({ actorUsername: payload.requesterUsername || "unknown",
      action: "DATA_RONDE_PLANNED_PROFILE_DEACTIVATE",
      details: { id, label: existing.label || "", reason, closedEntriesCount: closed, totalEntriesCount: total } });
    return { success: true, action: "deactivated" };
  }
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM ronde_entries WHERE planned_profile_id = ?", [id]);
    await tx.run("DELETE FROM data_ronde_planned_profile_lines WHERE profile_id = ?", [id]);
    await tx.run("DELETE FROM data_ronde_planned_profiles WHERE id = ?", [id]);
  });
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown",
    action: "DATA_RONDE_PLANNED_PROFILE_DELETE",
    details: { id, deleted: { label: existing.label || "", reason, deletedRondeEntriesCount: total } } });
  return { success: true, action: "deleted" };
}

/**
 * Fixe la date de fin de planification.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function setRondePlannedProfilePlanningEnd(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireRondePersistence(store, "data:rondePlannedProfiles:planningEnd");
  const id = String(payload.id || "").trim();
  const endDate = String(payload.planningEndDate || "").trim().slice(0, 10);
  const reason = String(payload.reason || "").trim();
  if (!endDate) store.fail("data:rondePlannedProfiles:planningEnd", "Indiquez la date de fin.", "DATA_RONDE_PLANNED_END_DATE_REQUIRED");
  if (!reason) store.fail("data:rondePlannedProfiles:planningEnd", "Motif obligatoire.", "DATA_RONDE_PLANNED_END_REASON_REQUIRED");
  const existing = await db.get("SELECT * FROM data_ronde_planned_profiles WHERE id = ?", [id]);
  if (!existing) store.fail("data:rondePlannedProfiles:planningEnd", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  if (existing.planning_valid_from && endDate < existing.planning_valid_from) {
    store.fail("data:rondePlannedProfiles:planningEnd", "La date de fin doit suivre la date de début.", "DATA_RONDE_PLANNED_PLANNING_ORDER");
  }
  await db.run("UPDATE data_ronde_planned_profiles SET planning_valid_to = ?, updated_at = ? WHERE id = ?",
    [endDate, new Date().toISOString(), id]);
  store.logAudit({ actorUsername: payload.requesterUsername || "unknown",
    action: "DATA_RONDE_PLANNED_PROFILE_PLANNING_END",
    details: { label: existing.label || "", reason,
      before: { planningValidTo: existing.planning_valid_to || null }, after: { planningValidTo: endDate } } });
  return getProfileById(db, id);
}

/**
 * Active ou retire la validation métier d'un profil.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function setRondePlannedProfileValidated(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const db = requireRondePersistence(store, "data:rondePlannedProfiles:validated");
  const id = String(payload.id || "").trim();
  const existing = await db.get("SELECT * FROM data_ronde_planned_profiles WHERE id = ?", [id]);
  if (!existing) store.fail("data:rondePlannedProfiles:validated", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  const validated = Boolean(payload.validated);
  const now = new Date().toISOString();
  const actor = String(payload.requesterUsername || "unknown").trim();
  await db.run(
    `UPDATE data_ronde_planned_profiles SET validated_at = ?, validated_by = ?, updated_at = ? WHERE id = ?`,
    [validated ? now : null, validated ? actor : null, now, id]
  );
  store.logAudit({ actorUsername: actor, action: "DATA_RONDE_PLANNED_PROFILE_VALIDATION",
    details: { label: existing.label || "",
      before: { validatedAt: existing.validated_at || null, validatedByUsername: existing.validated_by || null },
      after: { validatedAt: validated ? now : null, validatedByUsername: validated ? actor : null } } });
  return getProfileById(db, id);
}

module.exports = {
  deleteRondePlannedProfile,
  listRondePlannedProfiles,
  setRondePlannedProfilePlanningEnd,
  setRondePlannedProfileValidated,
  upsertRondePlannedProfile
};
