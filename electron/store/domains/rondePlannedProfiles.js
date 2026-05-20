const { generateEntityId } = require("../core/ids");

const ROUND_KINDS = new Set(["OPENING", "CLOSING", "ACCOMPAGNEMENT", "RANDOM", "RANDOM_DAY", "RANDOM_NIGHT"]);
const RECURRENCE_KINDS = new Set(["WEEKLY", "DAILY", "MONTHLY", "DATE_RANGE"]);
const REQUESTED_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LINE_ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSURE_FIELD_TYPES = new Set(["text", "textarea", "number", "time", "select", "toggle"]);

function isUuidLineId(value) {
  return typeof value === "string" && LINE_ID_UUID_RE.test(value.trim());
}

function resolveSiteLabel(store, siteId) {
  if (!siteId) return null;
  const row = store.db.prepare("SELECT code, name FROM data_sites WHERE id = ?").get(siteId);
  if (!row) return null;
  const code = String(row.code || "").trim();
  const name = String(row.name || "").trim();
  return code && name ? `${code} — ${name}` : name || code || null;
}

function resolveMotifLabel(store, motifTypeId) {
  if (!motifTypeId) return null;
  const row = store.db.prepare("SELECT label FROM data_ronde_motif_types WHERE id = ?").get(motifTypeId);
  return row ? String(row.label || "").trim() || null : null;
}

function resolveIntervenantLabel(store, intervenantId) {
  if (!intervenantId) return null;
  const row = store.db.prepare("SELECT name FROM data_intervenants WHERE id = ?").get(intervenantId);
  return row ? String(row.name || "").trim() || null : null;
}

function mapLineRow(store, row) {
  const motifTypeId = row.motif_type_id && String(row.motif_type_id).trim() ? String(row.motif_type_id).trim() : null;
  let roundKind = String(row.round_kind || "OPENING").trim().toUpperCase();
  let randomPeriodMask =
    row.random_period_mask == null || row.random_period_mask === "" ? 3 : Number(row.random_period_mask);
  if (!Number.isFinite(randomPeriodMask) || randomPeriodMask < 1 || randomPeriodMask > 3) randomPeriodMask = 3;
  if (roundKind === "RANDOM_DAY") {
    roundKind = "RANDOM";
    randomPeriodMask = 1;
  } else if (roundKind === "RANDOM_NIGHT") {
    roundKind = "RANDOM";
    randomPeriodMask = 2;
  }
  const rangeStartDate =
    row.range_start_date && String(row.range_start_date).trim() ? String(row.range_start_date).trim().slice(0, 10) : null;
  const rangeEndDate =
    row.range_end_date && String(row.range_end_date).trim() ? String(row.range_end_date).trim().slice(0, 10) : null;
  const randomWindowStart =
    row.random_window_start && String(row.random_window_start).trim()
      ? String(row.random_window_start).trim().slice(0, 5)
      : null;
  const randomWindowEnd =
    row.random_window_end && String(row.random_window_end).trim() ? String(row.random_window_end).trim().slice(0, 5) : null;
  let randomRoundsCount =
    row.random_rounds_count == null || row.random_rounds_count === "" ? null : Number(row.random_rounds_count);
  if (!Number.isFinite(randomRoundsCount)) randomRoundsCount = null;
  return {
    id: row.id,
    profileId: row.profile_id,
    sortOrder: row.sort_order == null ? 0 : Number(row.sort_order),
    roundKind,
    recurrenceKind: row.recurrence_kind || "WEEKLY",
    weekdaysMask: row.weekdays_mask == null ? 0 : Number(row.weekdays_mask),
    monthDay: row.month_day == null ? null : Number(row.month_day),
    requestedTime: row.requested_time && String(row.requested_time).trim() ? String(row.requested_time).trim() : null,
    intervalMinutes: row.interval_minutes == null || row.interval_minutes === "" ? null : Number(row.interval_minutes),
    randomPeriodMask,
    randomWindowStart,
    randomWindowEnd,
    randomRoundsCount,
    includeHolidays: Boolean(row.include_holidays),
    includeHolidayEves: Boolean(row.include_holiday_eves),
    rangeStartDate,
    rangeEndDate,
    motifTypeId,
    motifTypeLabel: resolveMotifLabel(store, motifTypeId),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeLine(body) {
  let roundKind = String(body.roundKind || "").trim().toUpperCase();
  const recurrenceKind = String(body.recurrenceKind || "").trim().toUpperCase();
  let randomPeriodMask = body.randomPeriodMask != null ? Number(body.randomPeriodMask) : 3;
  if (!Number.isFinite(randomPeriodMask) || randomPeriodMask < 1 || randomPeriodMask > 3) randomPeriodMask = 3;
  if (roundKind === "RANDOM_DAY") {
    roundKind = "RANDOM";
    randomPeriodMask = 1;
  } else if (roundKind === "RANDOM_NIGHT") {
    roundKind = "RANDOM";
    randomPeriodMask = 2;
  }
  let weekdaysMask = Math.min(127, Math.max(0, Number(body.weekdaysMask)));
  if (!Number.isFinite(weekdaysMask)) weekdaysMask = 0;
  let monthDay = body.monthDay == null || body.monthDay === "" ? null : Number(body.monthDay);
  if (monthDay != null && !Number.isFinite(monthDay)) monthDay = null;
  let requestedTime = null;
  if (roundKind === "OPENING" || roundKind === "CLOSING" || roundKind === "ACCOMPAGNEMENT") {
    const rt = String(body.requestedTime ?? "").trim();
    requestedTime = rt || null;
  }
  let intervalMinutes = body.intervalMinutes;
  if (intervalMinutes === "" || intervalMinutes == null || intervalMinutes === undefined) {
    intervalMinutes = null;
  } else {
    const nm = Number(intervalMinutes);
    if (!Number.isFinite(nm) || nm < 1) {
      intervalMinutes = "__INVALID__";
    } else {
      intervalMinutes = Math.min(100080, Math.round(nm));
    }
  }
  const motifTypeIdRaw = body.motifTypeId != null ? String(body.motifTypeId).trim() : "";
  const motifTypeId = motifTypeIdRaw ? motifTypeIdRaw : null;
  let rangeStartDate = String(body.rangeStartDate ?? "").trim().slice(0, 10) || null;
  let rangeEndDate = String(body.rangeEndDate ?? "").trim().slice(0, 10) || null;
  if (recurrenceKind !== "DATE_RANGE") {
    rangeStartDate = null;
    rangeEndDate = null;
  }
  let randomWindowStart = String(body.randomWindowStart ?? "").trim().slice(0, 5) || null;
  let randomWindowEnd = String(body.randomWindowEnd ?? "").trim().slice(0, 5) || null;
  if (randomWindowStart && !REQUESTED_TIME_RE.test(randomWindowStart)) randomWindowStart = "__INVALID__";
  if (randomWindowEnd && !REQUESTED_TIME_RE.test(randomWindowEnd)) randomWindowEnd = "__INVALID__";
  let randomRoundsCount = body.randomRoundsCount;
  if (randomRoundsCount === "" || randomRoundsCount == null || randomRoundsCount === undefined) {
    randomRoundsCount = null;
  } else {
    const rc = Number(randomRoundsCount);
    if (!Number.isFinite(rc) || rc < 1) {
      randomRoundsCount = "__INVALID__";
    } else {
      randomRoundsCount = Math.min(48, Math.round(rc));
    }
  }
  if (roundKind !== "RANDOM") {
    randomWindowStart = null;
    randomWindowEnd = null;
    randomRoundsCount = null;
  }
  const clientLineId = body.id != null && String(body.id).trim() ? String(body.id).trim() : null;
  return {
    roundKind,
    recurrenceKind,
    weekdaysMask,
    monthDay,
    requestedTime,
    intervalMinutes,
    motifTypeId,
    randomPeriodMask,
    randomWindowStart,
    randomWindowEnd,
    randomRoundsCount,
    includeHolidays: Boolean(body.includeHolidays),
    includeHolidayEves: Boolean(body.includeHolidayEves),
    rangeStartDate,
    rangeEndDate,
    clientLineId
  };
}

function validateLine(store, n, failChannel, indexLabel) {
  const prefix = indexLabel ? `Ligne ${indexLabel} : ` : "";
  if (!ROUND_KINDS.has(n.roundKind)) {
    store.fail(failChannel, `${prefix}Type de ronde invalide.`, "DATA_RONDE_PLANNED_INVALID");
  }
  if (!RECURRENCE_KINDS.has(n.recurrenceKind)) {
    store.fail(failChannel, `${prefix}Récurrence invalide.`, "DATA_RONDE_PLANNED_INVALID");
  }
  if (n.roundKind === "OPENING" || n.roundKind === "CLOSING" || n.roundKind === "ACCOMPAGNEMENT") {
    if (!n.requestedTime || !REQUESTED_TIME_RE.test(n.requestedTime)) {
      store.fail(
        failChannel,
        `${prefix}Heure demandée obligatoire pour ouverture / fermeture / accompagnement (format 24 h, ex. 06:30).`,
        "DATA_RONDE_PLANNED_TIME"
      );
    }
  }
  if (n.roundKind === "RANDOM" && (n.randomPeriodMask & 3) === 0) {
    store.fail(
      failChannel,
      `${prefix}Pour une ronde aléatoire, activez au moins une période (jour ou nuit).`,
      "DATA_RONDE_PLANNED_RANDOM_PERIOD"
    );
  }
  if (n.roundKind === "RANDOM") {
    if (n.randomWindowStart === "__INVALID__" || n.randomWindowEnd === "__INVALID__") {
      store.fail(
        failChannel,
        `${prefix}Heures de fenêtre aléatoire invalides (format 24 h, ex. 20:00).`,
        "DATA_RONDE_PLANNED_RANDOM_WINDOW"
      );
    }
    const ws = n.randomWindowStart;
    const we = n.randomWindowEnd;
    if (ws || we) {
      if (!ws || !we) {
        store.fail(
          failChannel,
          `${prefix}Pour une fenêtre horaire aléatoire, indiquez une heure de début et de fin.`,
          "DATA_RONDE_PLANNED_RANDOM_WINDOW"
        );
      }
    }
    if (n.randomRoundsCount === "__INVALID__") {
      store.fail(failChannel, `${prefix}Nombre de rondes invalide (1 à 48).`, "DATA_RONDE_PLANNED_RANDOM_ROUNDS");
    }
  }
  // weekDaysMask est normalisé à 127 en amont si vide.
  if (n.recurrenceKind === "DATE_RANGE") {
    if (!n.rangeStartDate || !n.rangeEndDate) {
      store.fail(
        failChannel,
        `${prefix}Indiquez la date de début et la date de fin pour la plage.`,
        "DATA_RONDE_PLANNED_RANGE_DATES"
      );
    } else if (String(n.rangeStartDate) > String(n.rangeEndDate)) {
      store.fail(
        failChannel,
        `${prefix}La date de début doit être antérieure ou égale à la date de fin.`,
        "DATA_RONDE_PLANNED_RANGE_ORDER"
      );
    }
  }
  if (n.recurrenceKind === "MONTHLY") {
    if (n.monthDay == null || n.monthDay < 1 || n.monthDay > 31) {
      store.fail(failChannel, `${prefix}Jour du mois invalide (1 à 31).`, "DATA_RONDE_PLANNED_MONTH_DAY");
    }
  }
  if (n.intervalMinutes === "__INVALID__") {
    store.fail(failChannel, `${prefix}Fréquence invalide (nombre entier de minutes ≥ 1).`, "DATA_RONDE_PLANNED_INTERVAL");
  }
  if (n.motifTypeId) {
    const motif = store.db.prepare("SELECT id FROM data_ronde_motif_types WHERE id = ?").get(n.motifTypeId);
    if (!motif) {
      store.fail(failChannel, `${prefix}Motif de ronde inconnu.`, "DATA_RONDE_PLANNED_MOTIF_NOT_FOUND");
    }
  }
}

function toFieldKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return raw.slice(0, 40);
}

function parseClosureFields(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

function normalizeClosureField(input, idx) {
  const idRaw = String(input?.id || "").trim();
  const keyRaw = toFieldKey(input?.key);
  const labelTemplate = String(input?.labelTemplate || "").trim();
  const type = String(input?.type || "text").trim().toLowerCase();
  const required = Boolean(input?.required);
  const placeholder = String(input?.placeholder || "").trim().slice(0, 160);
  const options = Array.isArray(input?.options)
    ? input.options.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    id: idRaw || generateEntityId(),
    key: keyRaw || `champ_${idx + 1}`,
    labelTemplate,
    type,
    required,
    placeholder,
    options
  };
}

function validateClosureField(store, field, failChannel, indexLabel) {
  const prefix = indexLabel ? `Champ ${indexLabel} : ` : "";
  if (!field.labelTemplate) {
    store.fail(failChannel, `${prefix}Le libellé est obligatoire.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_LABEL_REQUIRED");
  }
  if (!field.key) {
    store.fail(failChannel, `${prefix}Le nom de donnée est obligatoire.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_KEY_REQUIRED");
  }
  if (!CLOSURE_FIELD_TYPES.has(field.type)) {
    store.fail(failChannel, `${prefix}Type de champ invalide.`, "DATA_RONDE_PLANNED_CLOSURE_FIELD_TYPE_INVALID");
  }
  if (field.type === "select" && field.options.length < 1) {
    store.fail(
      failChannel,
      `${prefix}Ajoutez au moins une option pour une liste déroulante.`,
      "DATA_RONDE_PLANNED_CLOSURE_FIELD_OPTIONS_REQUIRED"
    );
  }
}

function profilePlanningAppliesOnDateFromRow(row, dateIso) {
  const from = row.planning_valid_from && String(row.planning_valid_from).trim() ? String(row.planning_valid_from).trim().slice(0, 10) : null;
  const to = row.planning_valid_to && String(row.planning_valid_to).trim() ? String(row.planning_valid_to).trim().slice(0, 10) : null;
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

function assertOperatorMayModifyPlannedProfile(store, requesterRole, existingRow, failChannel) {
  if (requesterRole === "RESPONSABLE" || requesterRole === "DEV") return;
  const va = existingRow?.validated_at;
  if (va != null && String(va).trim() !== "") {
    store.fail(
      failChannel,
      "Ce profil a été validé par un responsable : seul un responsable peut en modifier le contenu.",
      "DATA_RONDE_PLANNED_PROFILE_LOCKED"
    );
  }
}

function normalizeAndValidateClosureFields(store, closureFormEnabled, closureRaw, failChannel) {
  const raw = Array.isArray(closureRaw) ? closureRaw : [];
  const normalizedClosureFields = raw.map((field, idx) => normalizeClosureField(field, idx)).slice(0, 30);
  const closureKeys = new Set();
  normalizedClosureFields.forEach((field, idx) => {
    validateClosureField(store, field, failChannel, String(idx + 1));
    if (closureKeys.has(field.key)) {
      store.fail(
        failChannel,
        `Champ ${idx + 1} : nom de donnée déjà utilisé (${field.key}).`,
        "DATA_RONDE_PLANNED_CLOSURE_FIELD_KEY_DUPLICATE"
      );
    }
    closureKeys.add(field.key);
  });
  if (closureFormEnabled && normalizedClosureFields.length < 1) {
    store.fail(failChannel, "Ajoutez au moins un champ au formulaire de clôture unique.", "DATA_RONDE_PLANNED_CLOSURE_FIELDS_REQUIRED");
  }
  return normalizedClosureFields;
}

function mapProfileRow(store, p, lines) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const appliesToday = profilePlanningAppliesOnDateFromRow(p, todayIso);
  return {
    id: p.id,
    label: p.label || "",
    siteId: p.site_id || null,
    siteDisplay: resolveSiteLabel(store, p.site_id),
    intervenantId: p.intervenant_id || null,
    intervenantDisplay: resolveIntervenantLabel(store, p.intervenant_id),
    notes: p.notes || "",
    planningValidFrom:
      p.planning_valid_from && String(p.planning_valid_from).trim() ? String(p.planning_valid_from).trim().slice(0, 10) : null,
    planningValidTo:
      p.planning_valid_to && String(p.planning_valid_to).trim() ? String(p.planning_valid_to).trim().slice(0, 10) : null,
    isActive: appliesToday,
    validatedAt: p.validated_at && String(p.validated_at).trim() ? String(p.validated_at).trim() : null,
    validatedByUsername: p.validated_by && String(p.validated_by).trim() ? String(p.validated_by).trim() : null,
    createRoundsEnabled: p.create_rounds_enabled == null ? true : Boolean(p.create_rounds_enabled),
    closureFormEnabled: Boolean(p.closure_form_enabled),
    closureFields: parseClosureFields(p.closure_fields_json),
    lines,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

function listRondePlannedProfiles(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const profiles = store.db
    .prepare(
      `SELECT id, label, site_id, intervenant_id, notes, is_active, created_at, updated_at
              , closure_form_enabled, closure_fields_json
              , planning_valid_from, planning_valid_to
              , validated_at, validated_by
              , create_rounds_enabled
       FROM data_ronde_planned_profiles
       ORDER BY label COLLATE NOCASE ASC`
    )
    .all();
  const lineStmt = store.db.prepare(
    `SELECT id, profile_id, sort_order, round_kind, recurrence_kind, weekdays_mask, month_day,
            requested_time, interval_minutes, motif_type_id, random_period_mask, range_start_date, range_end_date,
            random_window_start, random_window_end, random_rounds_count, include_holidays, include_holiday_eves,
            created_at, updated_at
     FROM data_ronde_planned_profile_lines
     WHERE profile_id = ?
     ORDER BY sort_order ASC, created_at ASC`
  );
  return profiles.map((p) =>
    mapProfileRow(
      store,
      p,
      lineStmt.all(p.id).map((row) => mapLineRow(store, row))
    )
  );
}

function getProfileById(store, id) {
  const p = store.db.prepare("SELECT * FROM data_ronde_planned_profiles WHERE id = ?").get(id);
  if (!p) return null;
  const lines = store.db
    .prepare(
      `SELECT id, profile_id, sort_order, round_kind, recurrence_kind, weekdays_mask, month_day,
              requested_time, interval_minutes, motif_type_id, random_period_mask, range_start_date, range_end_date,
              random_window_start, random_window_end, random_rounds_count, include_holidays, include_holiday_eves,
              created_at, updated_at
       FROM data_ronde_planned_profile_lines
       WHERE profile_id = ?
       ORDER BY sort_order ASC, created_at ASC`
    )
    .all(id)
    .map((row) => mapLineRow(store, row));
  return mapProfileRow(store, p, lines);
}

function upsertRondePlannedProfile(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const isManager = payload.requesterRole === "RESPONSABLE" || payload.requesterRole === "DEV";
  /* Auto-validation à la création pour les responsables/dev */
  const autoValidate = Boolean(payload.autoValidate) && isManager;
  const label = String(payload.label || "").trim();
  if (!label) {
    store.fail("data:rondePlannedProfiles:upsert", "Libellé du profil obligatoire.", "DATA_RONDE_PLANNED_REQUIRED");
  }
  const planningValidFrom = String(payload.planningValidFrom ?? "").trim().slice(0, 10) || null;
  const planningValidTo = String(payload.planningValidTo ?? "").trim().slice(0, 10) || null;
  if (!planningValidFrom) {
    store.fail(
      "data:rondePlannedProfiles:upsert",
      "Indiquez la date de début de validité du profil (Du).",
      "DATA_RONDE_PLANNED_PLANNING_FROM_REQUIRED"
    );
  }
  if (planningValidTo && planningValidFrom && String(planningValidTo) < String(planningValidFrom)) {
    store.fail(
      "data:rondePlannedProfiles:upsert",
      "La date de fin de validité doit être postérieure ou égale à la date de début.",
      "DATA_RONDE_PLANNED_PLANNING_ORDER"
    );
  }
  const notes = String(payload.notes || "").trim();
  const createRoundsEnabled = payload.createRoundsEnabled !== false;
  const closureFormEnabled = Boolean(payload.closureFormEnabled);
  const closureRaw = Array.isArray(payload.closureFields) ? payload.closureFields : [];
  const normalizedClosureFields = normalizeAndValidateClosureFields(
    store,
    closureFormEnabled,
    closureRaw,
    "data:rondePlannedProfiles:upsert"
  );
  const isActiveDb = 1;
  const siteIdRaw = payload.siteId != null ? String(payload.siteId).trim() : "";
  const siteId = siteIdRaw ? siteIdRaw : null;
  if (siteId) {
    const site = store.db.prepare("SELECT id FROM data_sites WHERE id = ?").get(siteId);
    if (!site) {
      store.fail("data:rondePlannedProfiles:upsert", "Site inconnu.", "DATA_RONDE_PLANNED_SITE_NOT_FOUND");
    }
  }

  const intervenantIdRaw = payload.intervenantId != null ? String(payload.intervenantId).trim() : "";
  const intervenantId = intervenantIdRaw ? intervenantIdRaw : null;
  if (!intervenantId) {
    store.fail("data:rondePlannedProfiles:upsert", "Prestataire obligatoire pour le profil.", "DATA_RONDE_PLANNED_INTERVENANT_REQUIRED");
  }
  const intervenantRow = store.db.prepare("SELECT id FROM data_intervenants WHERE id = ?").get(intervenantId);
  if (!intervenantRow) {
    store.fail("data:rondePlannedProfiles:upsert", "Prestataire inconnu.", "DATA_RONDE_PLANNED_INTERVENANT_NOT_FOUND");
  }

  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
  if (rawLines.length === 0) {
    store.fail(
      "data:rondePlannedProfiles:upsert",
      "Ajoutez au moins une ligne de planification (types, jours, fréquence).",
      "DATA_RONDE_PLANNED_LINES_REQUIRED"
    );
  }

  const normalizedLines = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const n = normalizeLine(rawLines[i]);
    validateLine(store, n, "data:rondePlannedProfiles:upsert", String(i + 1));
    const recurrenceKind = n.recurrenceKind;
    let wdMask = n.weekdaysMask;
    if (recurrenceKind === "DAILY") wdMask = 127;
    else if (recurrenceKind === "MONTHLY" || recurrenceKind === "DATE_RANGE") wdMask = 0;
    const monthDay = recurrenceKind === "MONTHLY" ? n.monthDay : null;
    const requestedTimeStored =
      n.roundKind === "OPENING" || n.roundKind === "CLOSING" || n.roundKind === "ACCOMPAGNEMENT" ? n.requestedTime : null;
    const intervalStored = n.intervalMinutes && n.intervalMinutes !== "__INVALID__" ? n.intervalMinutes : null;
    const randomRoundsStored =
      n.roundKind === "RANDOM" && n.randomRoundsCount && n.randomRoundsCount !== "__INVALID__"
        ? n.randomRoundsCount
        : null;
    const rwStart =
      n.roundKind === "RANDOM" && n.randomWindowStart && n.randomWindowStart !== "__INVALID__" ? n.randomWindowStart : null;
    const rwEnd =
      n.roundKind === "RANDOM" && n.randomWindowEnd && n.randomWindowEnd !== "__INVALID__" ? n.randomWindowEnd : null;
    normalizedLines.push({
      roundKind: n.roundKind,
      recurrenceKind,
      weekdaysMask: wdMask,
      monthDay,
      requestedTime: requestedTimeStored,
      intervalMinutes: intervalStored,
      motifTypeId: n.motifTypeId,
      randomPeriodMask: n.roundKind === "RANDOM" ? n.randomPeriodMask : 3,
      randomWindowStart: rwStart,
      randomWindowEnd: rwEnd,
      randomRoundsCount: randomRoundsStored,
      includeHolidays: Boolean(n.includeHolidays),
      includeHolidayEves: Boolean(n.includeHolidayEves),
      rangeStartDate: recurrenceKind === "DATE_RANGE" ? n.rangeStartDate : null,
      rangeEndDate: recurrenceKind === "DATE_RANGE" ? n.rangeEndDate : null,
      clientLineId: n.clientLineId
    });
  }

  const now = new Date().toISOString();
  const requestedId = payload.id != null ? String(payload.id).trim() : "";
  let profileId;
  let existing;
  if (requestedId) {
    existing = store.db.prepare("SELECT * FROM data_ronde_planned_profiles WHERE id = ?").get(requestedId);
    if (!existing) {
      store.fail("data:rondePlannedProfiles:upsert", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
    }
    profileId = requestedId;
  } else {
    profileId = generateEntityId();
    existing = null;
  }

  /* Tous les rôles peuvent modifier un profil (validation supprimée). */

  const runUpsert = () => {
    if (existing) {
      store.db
        .prepare(
          `UPDATE data_ronde_planned_profiles
           SET label = ?, site_id = ?, intervenant_id = ?, notes = ?, is_active = ?, create_rounds_enabled = ?, closure_form_enabled = ?, closure_fields_json = ?,
               planning_valid_from = ?, planning_valid_to = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          label,
          siteId,
          intervenantId,
          notes || null,
          isActiveDb,
          createRoundsEnabled ? 1 : 0,
          closureFormEnabled ? 1 : 0,
          JSON.stringify(normalizedClosureFields),
          planningValidFrom,
          planningValidTo || null,
          now,
          profileId
        );
    } else {
      const actor = String(payload.requesterUsername || "unknown").trim();
      store.db
        .prepare(
          `INSERT INTO data_ronde_planned_profiles (
            id, label, site_id, intervenant_id, notes, is_active, create_rounds_enabled, closure_form_enabled, closure_fields_json,
            planning_valid_from, planning_valid_to, validated_at, validated_by, created_at, updated_at
          )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          profileId,
          label,
          siteId,
          intervenantId,
          notes || null,
          isActiveDb,
          createRoundsEnabled ? 1 : 0,
          closureFormEnabled ? 1 : 0,
          JSON.stringify(normalizedClosureFields),
          planningValidFrom,
          planningValidTo || null,
          autoValidate ? now : null,
          autoValidate ? actor : null,
          now,
          now
        );
    }

    store.db.prepare("DELETE FROM data_ronde_planned_profile_lines WHERE profile_id = ?").run(profileId);

    const insertLine = store.db.prepare(
      `INSERT INTO data_ronde_planned_profile_lines (
        id, profile_id, sort_order, round_kind, recurrence_kind, weekdays_mask, month_day,
        requested_time, interval_minutes, motif_type_id, random_period_mask, range_start_date, range_end_date,
        random_window_start, random_window_end, random_rounds_count, include_holidays, include_holiday_eves,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    normalizedLines.forEach((ln, idx) => {
      const lineId = isUuidLineId(ln.clientLineId) ? ln.clientLineId.trim() : generateEntityId();
      insertLine.run(
        lineId,
        profileId,
        idx,
        ln.roundKind,
        ln.recurrenceKind,
        ln.weekdaysMask,
        ln.monthDay,
        ln.requestedTime,
        ln.intervalMinutes,
        ln.motifTypeId || null,
        ln.randomPeriodMask == null ? 3 : Number(ln.randomPeriodMask),
        ln.rangeStartDate || null,
        ln.rangeEndDate || null,
        ln.randomWindowStart || null,
        ln.randomWindowEnd || null,
        ln.randomRoundsCount == null ? null : Number(ln.randomRoundsCount),
        ln.includeHolidays ? 1 : 0,
        ln.includeHolidayEves ? 1 : 0,
        now,
        now
      );
    });
  };

  store.db.exec("BEGIN IMMEDIATE");
  try {
    runUpsert();
    store.db.exec("COMMIT");
  } catch (err) {
    try {
      store.db.exec("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  }

  const historyBefore = existing ? store.getEntityChangeHistory("data_ronde_planned_profiles", profileId, 3) : null;
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: existing ? "DATA_RONDE_PLANNED_PROFILE_UPDATE" : "DATA_RONDE_PLANNED_PROFILE_CREATE",
    details: {
      id: profileId,
      label,
      siteId,
      createRoundsEnabled,
      lineCount: normalizedLines.length,
      ...(!existing && autoValidate ? { autoValidated: true } : {}),
      ...(existing
        ? {
            historyBefore
          }
        : {})
    }
  });

  return getProfileById(store, profileId);
}

function deleteRondePlannedProfile(store, payload) {
  store.ensureDataDeleteRole(payload.requesterRole);
  const cleanId = String(payload.id || "").trim();
  const reason = String(payload.reason || "").trim();
  if (!cleanId) {
    store.fail("data:rondePlannedProfiles:delete", "Identifiant obligatoire.", "DATA_RONDE_PLANNED_REQUIRED");
  }
  if (!reason) {
    store.fail("data:rondePlannedProfiles:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT * FROM data_ronde_planned_profiles WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:rondePlannedProfiles:delete", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  }
  const linkedStats = store.db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'CLOTURE' THEN 1 ELSE 0 END) as closedCount
       FROM ronde_entries
       WHERE planned_profile_id = ?`
    )
    .get(cleanId);
  const totalLinked = Number(linkedStats?.total || 0);
  const closedLinked = Number(linkedStats?.closedCount || 0);
  const now = new Date().toISOString();
  const actor = String(payload.requesterUsername || "unknown").trim();

  if (closedLinked > 0) {
    /* Des rondes clôturées existent : désactiver la programmation pour préserver la traçabilité */
    store.db
      .prepare(
        `UPDATE data_ronde_planned_profiles
         SET is_active = 0, create_rounds_enabled = 0, updated_at = ?
         WHERE id = ?`
      )
      .run(now, cleanId);
    store.logAudit({
      actorUsername: actor,
      action: "DATA_RONDE_PLANNED_PROFILE_DEACTIVATE",
      details: {
        id: cleanId,
        label: String(existing.label || ""),
        reason,
        closedEntriesCount: closedLinked,
        totalEntriesCount: totalLinked,
        note: "Désactivation automatique (rondes clôturées liées — suppression impossible pour traçabilité)"
      }
    });
    return { success: true, action: "deactivated" };
  }

  /* Aucune ronde clôturée : suppression complète */
  store.db.prepare("DELETE FROM ronde_entries WHERE planned_profile_id = ?").run(cleanId);
  store.db.prepare("DELETE FROM data_ronde_planned_profile_lines WHERE profile_id = ?").run(cleanId);
  store.db.prepare("DELETE FROM data_ronde_planned_profiles WHERE id = ?").run(cleanId);

  store.logAudit({
    actorUsername: actor,
    action: "DATA_RONDE_PLANNED_PROFILE_DELETE",
    details: {
      id: cleanId,
      deleted: { label: String(existing.label || ""), reason, deletedRondeEntriesCount: totalLinked }
    }
  });

  return { success: true, action: "deleted" };
}

function setRondePlannedProfilePlanningEnd(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const cleanId = String(payload.id || "").trim();
  const endDate = String(payload.planningEndDate || "").trim().slice(0, 10);
  const reason = String(payload.reason || "").trim();
  if (!cleanId) {
    store.fail("data:rondePlannedProfiles:planningEnd", "Identifiant obligatoire.", "DATA_RONDE_PLANNED_REQUIRED");
  }
  if (!endDate) {
    store.fail(
      "data:rondePlannedProfiles:planningEnd",
      "Indiquez la date de fin de planification.",
      "DATA_RONDE_PLANNED_END_DATE_REQUIRED"
    );
  }
  if (!reason) {
    store.fail("data:rondePlannedProfiles:planningEnd", "Motif obligatoire.", "DATA_RONDE_PLANNED_END_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT * FROM data_ronde_planned_profiles WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:rondePlannedProfiles:planningEnd", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  }
  /* Tous les rôles peuvent arrêter une planification. */
  const from =
    existing.planning_valid_from && String(existing.planning_valid_from).trim()
      ? String(existing.planning_valid_from).trim().slice(0, 10)
      : null;
  if (from && endDate < from) {
    store.fail(
      "data:rondePlannedProfiles:planningEnd",
      "La date de fin doit être postérieure ou égale à la date de début du profil.",
      "DATA_RONDE_PLANNED_PLANNING_ORDER"
    );
  }
  const beforeTo =
    existing.planning_valid_to && String(existing.planning_valid_to).trim()
      ? String(existing.planning_valid_to).trim().slice(0, 10)
      : null;
  const now = new Date().toISOString();
  store.db
    .prepare(`UPDATE data_ronde_planned_profiles SET planning_valid_to = ?, updated_at = ? WHERE id = ?`)
    .run(endDate, now, cleanId);
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "DATA_RONDE_PLANNED_PROFILE_PLANNING_END",
    details: {
      label: String(existing.label || ""),
      reason,
      before: { planningValidTo: beforeTo },
      after: { planningValidTo: endDate }
    }
  });
  return getProfileById(store, cleanId);
}

function setRondePlannedProfileValidated(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const cleanId = String(payload.id || "").trim();
  const validated = Boolean(payload.validated);
  if (!cleanId) {
    store.fail("data:rondePlannedProfiles:validated", "Identifiant obligatoire.", "DATA_RONDE_PLANNED_REQUIRED");
  }
  const existing = store.db.prepare("SELECT * FROM data_ronde_planned_profiles WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:rondePlannedProfiles:validated", "Profil introuvable.", "DATA_RONDE_PLANNED_NOT_FOUND");
  }
  const beforeAt = existing.validated_at && String(existing.validated_at).trim() ? String(existing.validated_at).trim() : null;
  const beforeBy =
    existing.validated_by && String(existing.validated_by).trim() ? String(existing.validated_by).trim() : null;
  const now = new Date().toISOString();
  const actor = String(payload.requesterUsername || "unknown").trim();
  if (validated) {
    store.db
      .prepare(
        `UPDATE data_ronde_planned_profiles SET validated_at = ?, validated_by = ?, updated_at = ? WHERE id = ?`
      )
      .run(now, actor, now, cleanId);
  } else {
    store.db
      .prepare(`UPDATE data_ronde_planned_profiles SET validated_at = NULL, validated_by = NULL, updated_at = ? WHERE id = ?`)
      .run(now, cleanId);
  }
  const historyBefore = store.getEntityChangeHistory("data_ronde_planned_profiles", cleanId, 3);
  store.logAudit({
    actorUsername: actor,
    action: "DATA_RONDE_PLANNED_PROFILE_VALIDATION",
    details: {
      label: String(existing.label || ""),
      historyBefore,
      before: { validatedAt: beforeAt, validatedByUsername: beforeBy },
      after: {
        validatedAt: validated ? now : null,
        validatedByUsername: validated ? actor : null
      }
    }
  });
  return getProfileById(store, cleanId);
}

module.exports = {
  listRondePlannedProfiles,
  upsertRondePlannedProfile,
  deleteRondePlannedProfile,
  setRondePlannedProfilePlanningEnd,
  setRondePlannedProfileValidated
};
