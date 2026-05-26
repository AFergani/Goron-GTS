/**
 * Domaine interventions : fiches `intervention_entries`, statuts, facturation, archivage logique.
 *
 * Inclut les référentiels « en attente » (sites / intervenants saisis à la volée avant rattachement
 * au catalogue `data_sites` / `data_intervenants`). Champs export Word filtrés via
 * `data_intervention_word_extra_fields`. Liens vérifiés avant suppression d'un pending (ronde, gardiennage).
 */

const { generateEntityId } = require("../core/ids");

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

function toIsoTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return "";
}

function parseDateTimeMs(dateIso, timeIso) {
  if (!dateIso || !timeIso) return null;
  const ms = Date.parse(`${dateIso}T${timeIso}:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** Écart demande → arrivée en minutes. */
function computeDelayMinutes({ requestDate, requestTime, arrivalDate, arrivalTime }) {
  if (!requestDate || !requestTime || !arrivalTime) return null;
  const startMs = parseDateTimeMs(requestDate, requestTime);
  const arrivalBase = toIsoDate(arrivalDate) || requestDate;
  let arrivalMs = parseDateTimeMs(arrivalBase, arrivalTime);
  if (startMs == null || arrivalMs == null) return null;
  // Sans date d'arrivée explicite : heuristique passage après minuit (même jour que la demande).
  if (!toIsoDate(arrivalDate) && arrivalMs < startMs) {
    arrivalMs += 24 * 60 * 60 * 1000;
  }
  return Math.round((arrivalMs - startMs) / 60000);
}

/** Date civile du départ (saisie explicite ou calcul legacy). */
function computeDepartureDate({
  requestDate,
  requestTime,
  arrivalDate,
  arrivalTime,
  departureDate,
  departureTime
}) {
  const explicitDepartureDate = toIsoDate(departureDate);
  if (explicitDepartureDate) return explicitDepartureDate;
  if (!requestDate || !requestTime || !departureTime) return null;
  let departureMs = parseDateTimeMs(requestDate, departureTime);
  if (departureMs == null) return null;
  if (arrivalTime) {
    const arrivalBase = toIsoDate(arrivalDate) || requestDate;
    const arrivalMs = parseDateTimeMs(arrivalBase, arrivalTime);
    if (arrivalMs != null) {
      let dep = departureMs;
      if (dep < arrivalMs) {
        dep += 24 * 60 * 60 * 1000;
      }
      return new Date(dep).toISOString().slice(0, 10);
    }
  }
  const startMs = parseDateTimeMs(requestDate, requestTime);
  if (startMs == null) return null;
  let dep = departureMs;
  if (dep < startMs) {
    dep += 24 * 60 * 60 * 1000;
  }
  return new Date(dep).toISOString().slice(0, 10);
}

function assertPassageDateTimesCoherent(store, { arrivalDate, arrivalTime, departureDate, departureTime }) {
  const arrivalDateIso = toIsoDate(arrivalDate);
  const departureDateIso = toIsoDate(departureDate);
  const arrivalTimeIso = toIsoTime(arrivalTime);
  const departureTimeIso = toIsoTime(departureTime);
  if (arrivalTimeIso && !arrivalDateIso) {
    store.fail(
      "intervention:validate",
      "La date d'arrivée est obligatoire lorsque l'heure d'arrivée est renseignée.",
      "INTERVENTION_ARRIVAL_DATE_REQUIRED"
    );
  }
  if (departureTimeIso && !departureDateIso) {
    store.fail(
      "intervention:validate",
      "La date de départ est obligatoire lorsque l'heure de départ est renseignée.",
      "INTERVENTION_DEPARTURE_DATE_REQUIRED"
    );
  }
  if (arrivalDateIso && arrivalTimeIso && departureDateIso && departureTimeIso) {
    const arrivalMs = parseDateTimeMs(arrivalDateIso, arrivalTimeIso);
    const departureMs = parseDateTimeMs(departureDateIso, departureTimeIso);
    if (arrivalMs != null && departureMs != null && departureMs < arrivalMs) {
      store.fail(
        "intervention:validate",
        "La date et l'heure de départ doivent être postérieures à l'arrivée.",
        "INTERVENTION_DEPARTURE_BEFORE_ARRIVAL"
      );
    }
  }
}

function parseExportExtraJson(raw) {
  try {
    const o = JSON.parse(String(raw || "{}"));
    if (typeof o !== "object" || o === null || Array.isArray(o)) return {};
    return o;
  } catch {
    return {};
  }
}

function normalizeExportExtraJson(store, payload) {
  const defs = store.db.prepare("SELECT field_key FROM data_intervention_word_extra_fields ORDER BY sort_order").all();
  const allowed = defs.map((r) => r.field_key);
  const raw = payload.exportExtraValues && typeof payload.exportExtraValues === "object" ? payload.exportExtraValues : {};
  const out = {};
  for (const key of allowed) {
    const v = raw[key];
    out[key] = String(v ?? "").trim().slice(0, 4000);
  }
  return JSON.stringify(out);
}

/** Mappe une ligne SQL vers l'objet API intervention (usage interne). */
function mapInterventionRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    requestReason: row.request_reason,
    requestDate: row.request_date,
    requestTime: row.request_time,
    arrivalDate: row.arrival_date || null,
    arrivalTime: row.arrival_time || "",
    departureTime: row.departure_time || "",
    departureDate: row.departure_date || null,
    delayMinutes: row.delay_minutes == null ? null : Number(row.delay_minutes),
    workOrderNumber: row.work_order_number || "",
    report: row.report || "",
    intervenantId: row.intervenant_id || null,
    intervenantName: row.intervenant_name || "",
    status: row.status,
    billingStatus: row.billing_status || "FACTURABLE",
    billingReason: row.billing_reason || "",
    cancellationReason: row.cancellation_reason || "",
    closedAt: row.closed_at || null,
    archivedAt: row.archived_at || null,
    exportExtraValues: parseExportExtraJson(row.export_extra_json),
    linkedRondeId: row.linked_ronde_id || null,
    linkedGardiennageId: row.linked_gardiennage_id || null
  };
}

function getMissingClosureFieldsFromRow(row) {
  const missing = [];
  if (!toIsoTime(row.arrival_time)) missing.push("heure d'arrivée");
  if (!toIsoTime(row.departure_time)) missing.push("heure de départ");
  if (!String(row.work_order_number || "").trim()) missing.push("N° du bon d'intervention");
  if (!String(row.report || "").trim()) missing.push("compte-rendu");
  return missing;
}

function ensureInterventionPayload(store, payload, { requireArrival = false, requireDeparture = false } = {}) {
  const requestDate = toIsoDate(payload.requestDate);
  const requestTime = toIsoTime(payload.requestTime);
  const arrivalDate = toIsoDate(payload.arrivalDate);
  const arrivalTime = toIsoTime(payload.arrivalTime);
  const departureDateInput = toIsoDate(payload.departureDate);
  const departureTime = toIsoTime(payload.departureTime);
  const requestReason = String(payload.requestReason || "").trim();
  const siteDisplay = String(payload.siteDisplay || "").trim();
  const intervenantName = String(payload.intervenantName || "").trim();
  if (!requestDate) {
    store.fail("intervention:validate", "La date de demande est obligatoire.", "INTERVENTION_REQUEST_DATE_REQUIRED");
  }
  if (!requestTime) {
    store.fail("intervention:validate", "L'heure de demande est obligatoire.", "INTERVENTION_REQUEST_TIME_REQUIRED");
  }
  if (!siteDisplay) {
    store.fail("intervention:validate", "Le site est obligatoire.", "INTERVENTION_SITE_REQUIRED");
  }
  if (!requestReason) {
    store.fail("intervention:validate", "Le motif est obligatoire.", "INTERVENTION_REASON_REQUIRED");
  }
  if (!intervenantName) {
    store.fail("intervention:validate", "Le prestataire est obligatoire.", "INTERVENTION_PRESTATAIRE_REQUIRED");
  }
  if (requireArrival && !arrivalTime) {
    store.fail("intervention:validate", "L'heure d'arrivée est obligatoire.", "INTERVENTION_ARRIVAL_REQUIRED");
  }
  if (requireDeparture && !departureTime) {
    store.fail("intervention:validate", "L'heure de départ est obligatoire.", "INTERVENTION_DEPARTURE_REQUIRED");
  }
  const resolvedArrivalDate = arrivalTime ? arrivalDate || requestDate : null;
  const resolvedDepartureDate = departureTime
    ? departureDateInput ||
      computeDepartureDate({
        requestDate,
        requestTime,
        arrivalDate: resolvedArrivalDate,
        arrivalTime,
        departureDate: departureDateInput,
        departureTime
      })
    : null;
  assertPassageDateTimesCoherent(store, {
    arrivalDate: resolvedArrivalDate,
    arrivalTime,
    departureDate: resolvedDepartureDate,
    departureTime
  });
  if (arrivalTime) {
    const delay = computeDelayMinutes({
      requestDate,
      requestTime,
      arrivalDate: resolvedArrivalDate,
      arrivalTime
    });
    if (delay == null) {
      store.fail("intervention:validate", "L'heure d'arrivée est incohérente.", "INTERVENTION_ARRIVAL_INVALID");
    }
    if (delay != null && delay < 0) {
      store.fail(
        "intervention:validate",
        "La date et l'heure de la demande ne peuvent pas être postérieures à l'arrivée (délai d'intervention négatif).",
        "INTERVENTION_REQUEST_AFTER_ARRIVAL"
      );
    }
  }
  if (departureTime && !resolvedDepartureDate) {
    store.fail("intervention:validate", "L'heure de départ est incohérente.", "INTERVENTION_DEPARTURE_INVALID");
  }
  return {
    siteId: payload.siteId || null,
    siteDisplay,
    requestReason,
    requestDate,
    requestTime,
    arrivalDate: resolvedArrivalDate,
    arrivalTime,
    departureTime,
    departureDate: resolvedDepartureDate,
    delayMinutes: computeDelayMinutes({
      requestDate,
      requestTime,
      arrivalDate: resolvedArrivalDate,
      arrivalTime
    }),
    workOrderNumber: String(payload.workOrderNumber || "").trim(),
    report: String(payload.report || "").trim(),
    intervenantId: payload.intervenantId || null,
    intervenantName
  };
}

/** Liste les interventions (hors archivées sauf `includeArchived`). */
/**
 * Liste les interventions avec les liens inversés ronde/gardiennage.
 * Les sous-requêtes récupèrent le premier ID lié (ronde via `origin_intervention_id`,
 * gardiennage via `intervention_id`) pour permettre la navigation retour depuis la modale.
 */
function listInterventions(store, { requesterRole, includeArchived = false }) {
  store.ensureDataReaderRole(requesterRole);
  const baseSql = `
    SELECT i.*,
      (SELECT r.id FROM ronde_entries r WHERE r.origin_intervention_id = i.id LIMIT 1) AS linked_ronde_id,
      (SELECT g.id FROM gardiennage_entries g WHERE g.intervention_id = i.id LIMIT 1) AS linked_gardiennage_id
    FROM intervention_entries i
    ${includeArchived ? "" : "WHERE i.archived_at IS NULL"}
    ORDER BY datetime(i.request_date || 'T' || i.request_time) DESC, i.id DESC`;
  const rows = store.db.prepare(baseSql).all();
  return rows.map((row) => mapInterventionRow(row));
}

/** Compte les interventions `EN_COURS` non archivées (badge sidebar). */
function getInterventionOpenCount(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const row = store.db
    .prepare("SELECT COUNT(*) AS count FROM intervention_entries WHERE archived_at IS NULL AND status = 'EN_COURS'")
    .get();
  return { count: Number(row?.count || 0) };
}

/** Crée une fiche (idempotent si `id` existe déjà). Audit `INTERVENTION_CREATE`. */
function createInterventionEntry(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    id,
    requestDate,
    requestTime,
    siteId,
    siteDisplay,
    requestReason,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    intervenantId,
    intervenantName,
    exportExtraValues
  } = payload;
  store.ensureDataReaderRole(requesterRole);
  const normalized = ensureInterventionPayload(store, {
    requestDate,
    requestTime,
    siteId,
    siteDisplay,
    requestReason,
    arrivalDate: payload.arrivalDate,
    arrivalTime,
    departureDate: payload.departureDate,
    departureTime,
    workOrderNumber,
    report,
    intervenantId,
    intervenantName
  });
  const existing = store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id);
  if (existing) {
    return mapInterventionRow(existing);
  }
  const now = new Date().toISOString();
  const extraJson = normalizeExportExtraJson(store, { exportExtraValues });
  store.db
    .prepare(
      `INSERT INTO intervention_entries (
        id, created_at, updated_at, site_id, site_display,
        request_reason, request_date, request_time, arrival_date, arrival_time, departure_time, departure_date, delay_minutes,
        work_order_number, report, intervenant_id, intervenant_name, status, billing_status, billing_reason,
        export_extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      now,
      now,
      normalized.siteId,
      normalized.siteDisplay,
      normalized.requestReason,
      normalized.requestDate,
      normalized.requestTime,
      normalized.arrivalDate || null,
      normalized.arrivalTime || null,
      normalized.departureTime || null,
      normalized.departureDate || null,
      normalized.delayMinutes,
      normalized.workOrderNumber || null,
      normalized.report || null,
      normalized.intervenantId,
      normalized.intervenantName,
      "EN_COURS",
      "FACTURABLE",
      null,
      extraJson
    );
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_CREATE",
    details: {
      id,
      created: {
        siteDisplay: normalized.siteDisplay,
        requestReason: normalized.requestReason,
        requestDate: normalized.requestDate,
        requestTime: normalized.requestTime,
        intervenantName: normalized.intervenantName
      }
    }
  });
  const row = store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id);
  return mapInterventionRow(row);
}

/**
 * Met à jour une fiche (contrôle optimiste `expectedUpdatedAt`, champs clôture si statut clôturé).
 * Refuse modification si `archived_at` renseigné.
 */
function updateInterventionEntry(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    requestDate,
    requestTime,
    siteId,
    siteDisplay,
    requestReason,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    intervenantId,
    intervenantName,
    exportExtraValues
  } = payload;
  store.ensureDataReaderRole(requesterRole);
  const row = store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("intervention:update", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
  }
  if (row.archived_at) {
    store.fail("intervention:update", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
  }
  if (String(row.updated_at) !== String(expectedUpdatedAt || "")) {
    store.fail("intervention:update", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  }
  const normalized = ensureInterventionPayload(store, {
    requestDate,
    requestTime,
    siteId,
    siteDisplay,
    requestReason,
    arrivalDate: payload.arrivalDate,
    arrivalTime,
    departureDate: payload.departureDate,
    departureTime,
    workOrderNumber,
    report,
    intervenantId,
    intervenantName
  });
  const mergedExtras = {
    ...parseExportExtraJson(row.export_extra_json),
    ...(exportExtraValues && typeof exportExtraValues === "object" ? exportExtraValues : {})
  };
  const now = new Date().toISOString();
  const extraJson = normalizeExportExtraJson(store, { exportExtraValues: mergedExtras });
  const result = store.db
    .prepare(
      `UPDATE intervention_entries SET
        updated_at = ?, site_id = ?, site_display = ?, request_reason = ?, request_date = ?, request_time = ?,
        arrival_date = ?, arrival_time = ?, departure_time = ?, departure_date = ?, delay_minutes = ?,
        work_order_number = ?, report = ?, intervenant_id = ?, intervenant_name = ?, export_extra_json = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run(
      now,
      normalized.siteId,
      normalized.siteDisplay,
      normalized.requestReason,
      normalized.requestDate,
      normalized.requestTime,
      normalized.arrivalDate || null,
      normalized.arrivalTime || null,
      normalized.departureTime || null,
      normalized.departureDate || null,
      normalized.delayMinutes,
      normalized.workOrderNumber || null,
      normalized.report || null,
      normalized.intervenantId,
      normalized.intervenantName,
      extraJson,
      id,
      expectedUpdatedAt
    );
  if (result.changes === 0) {
    store.fail("intervention:update", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  }
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_UPDATE",
    details: {
      id,
      before: {
        siteDisplay: row.site_display || "",
        requestReason: row.request_reason || "",
        requestDate: row.request_date || "",
        requestTime: row.request_time || "",
        arrivalDate: row.arrival_date || "",
        arrivalTime: row.arrival_time || "",
        departureDate: row.departure_date || "",
        departureTime: row.departure_time || "",
        workOrderNumber: row.work_order_number || "",
        intervenantName: row.intervenant_name || ""
      },
      after: {
        siteDisplay: normalized.siteDisplay,
        requestReason: normalized.requestReason,
        requestDate: normalized.requestDate,
        requestTime: normalized.requestTime,
        arrivalDate: normalized.arrivalDate || "",
        arrivalTime: normalized.arrivalTime,
        departureDate: normalized.departureDate || "",
        departureTime: normalized.departureTime,
        workOrderNumber: normalized.workOrderNumber,
        intervenantName: normalized.intervenantName
      }
    }
  });
  return mapInterventionRow(store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id));
}

/** Passe le statut (`EN_COURS`, `CLOTURE`, `ANNULE`) avec règles de clôture et motif si annulation. */
function setInterventionStatus(store, { requesterRole, requesterUsername, id, expectedUpdatedAt, status, cancellationReason }) {
  store.ensureDataReaderRole(requesterRole);
  const row = store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("intervention:status", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
  }
  if (row.archived_at) {
    store.fail("intervention:status", "Intervention archivée non modifiable.", "INTERVENTION_ARCHIVED_READONLY");
  }
  if (String(row.updated_at) !== String(expectedUpdatedAt || "")) {
    store.fail("intervention:status", "Intervention modifiée ailleurs. Actualisez la liste.", "INTERVENTION_CONFLICT");
  }
  const nextStatus = status === "ANNULE" ? "ANNULE" : status === "CLOTURE" ? "CLOTURE" : "EN_COURS";
  const reason = String(cancellationReason || "").trim();
  if (nextStatus === "ANNULE" && !reason) {
    store.fail("intervention:status", "Le motif d'annulation est obligatoire.", "INTERVENTION_CANCEL_REASON_REQUIRED");
  }
  if (nextStatus === "CLOTURE") {
    const missing = getMissingClosureFieldsFromRow(row);
    if (missing.length) {
      store.fail(
        "intervention:status",
        `Clôture impossible: complétez ${missing.join(", ")}.`,
        "INTERVENTION_CLOSE_REQUIRED_FIELDS_MISSING"
      );
    }
  }
  const now = new Date().toISOString();
  store.db
    .prepare(
      `UPDATE intervention_entries SET
        status = ?, cancellation_reason = ?, closed_at = ?, updated_at = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run(nextStatus, nextStatus === "ANNULE" ? reason : null, nextStatus === "EN_COURS" ? null : now, now, id, expectedUpdatedAt);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action:
      nextStatus === "ANNULE"
        ? "INTERVENTION_CANCEL"
        : nextStatus === "CLOTURE"
          ? "INTERVENTION_CLOSE"
          : "INTERVENTION_REOPEN",
    details: {
      id,
      before: {
        status: row.status,
        cancellationReason: row.cancellation_reason || ""
      },
      after: {
        status: nextStatus,
        cancellationReason: nextStatus === "ANNULE" ? reason : ""
      }
    }
  });
  return mapInterventionRow(store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id));
}

/** Facturable / non facturable — réservé RESPONSABLE et DEV ; justification si non facturable. */
function setInterventionBillingStatus(store, { requesterRole, requesterUsername, id, expectedUpdatedAt, billingStatus, reason, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("intervention:billing", "Accès refusé : action réservée aux responsables.", "AUTH_FORBIDDEN");
  }
  const row = store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("intervention:billing", "Intervention introuvable.", "INTERVENTION_NOT_FOUND");
  }
  const next = billingStatus === "NON_FACTURABLE" ? "NON_FACTURABLE" : "FACTURABLE";
  const cleanReason = String(reason || "").trim();
  if (next === "NON_FACTURABLE" && !cleanReason) {
    store.fail("intervention:billing", "Une justification est obligatoire pour passer en non facturable.", "INTERVENTION_BILLING_REASON_REQUIRED");
  }
  const now = new Date().toISOString();
  store.db
    .prepare("UPDATE intervention_entries SET billing_status = ?, billing_reason = ?, updated_at = ? WHERE id = ?")
    .run(next, next === "NON_FACTURABLE" ? cleanReason : null, now, id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_BILLING_UPDATE",
    details: {
      id,
      before: {
        billingStatus: row.billing_status || "FACTURABLE",
        billingReason: row.billing_reason || ""
      },
      after: {
        billingStatus: next,
        billingReason: next === "NON_FACTURABLE" ? cleanReason : ""
      }
    }
  });
  return mapInterventionRow(store.db.prepare("SELECT * FROM intervention_entries WHERE id = ?").get(id));
}

/** Sites saisis en attente de validation (table `intervention_site_pending`). */
function listPendingInterventionSites(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const rows = store.db
    .prepare(
      `SELECT p.*, u.full_name AS created_by_display
       FROM intervention_site_pending p
       LEFT JOIN users u ON u.username = p.created_by
       ORDER BY datetime(p.created_at) DESC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    createdBy: row.created_by_display || row.created_by,
    createdAt: row.created_at
  }));
}

/** Enregistre un site provisoire à la saisie (sans doublon code catalogue / pending). */
function createPendingInterventionSite(store, { requesterRole, requesterUsername, code, name }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanCode = String(code || "").trim();
  const cleanName = String(name || "").trim();
  if (!cleanCode) {
    store.fail("intervention:pendingSite", "Le code site est obligatoire.", "INTERVENTION_PENDING_SITE_CODE_REQUIRED");
  }
  if (!cleanName) {
    store.fail("intervention:pendingSite", "Le nom du site est obligatoire.", "INTERVENTION_PENDING_SITE_NAME_REQUIRED");
  }
  const existingSite = store.db.prepare("SELECT id FROM data_sites WHERE lower(code) = lower(?) LIMIT 1").get(cleanCode);
  if (existingSite) {
    return { success: true, alreadyExists: true };
  }
  const existingPending = store.db
    .prepare("SELECT id FROM intervention_site_pending WHERE lower(code) = lower(?) LIMIT 1")
    .get(cleanCode);
  if (existingPending) {
    return { success: true, alreadyExists: true };
  }
  const id = `site-pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const now = new Date().toISOString();
  store.db
    .prepare("INSERT INTO intervention_site_pending (id, code, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, cleanCode, cleanName, String(requesterUsername || "unknown"), now);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_SITE_PENDING_CREATE",
    details: {
      pendingSite: {
        id,
        code: cleanCode,
        name: cleanName
      }
    }
  });
  return { success: true, alreadyExists: false };
}

/** Intervenants saisis en attente (`intervention_intervenant_pending`). */
function listPendingInterventionIntervenants(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const rows = store.db
    .prepare(
      `SELECT p.*, u.full_name AS created_by_display
       FROM intervention_intervenant_pending p
       LEFT JOIN users u ON u.username = p.created_by
       ORDER BY datetime(p.created_at) DESC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdBy: row.created_by_display || row.created_by,
    createdAt: row.created_at
  }));
}

/** Enregistre un intervenant provisoire (sans doublon nom catalogue / pending). */
function createPendingInterventionIntervenant(store, { requesterRole, requesterUsername, name }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    store.fail("intervention:pendingIntervenant", "Le nom de l'intervenant est obligatoire.", "INTERVENTION_PENDING_INTERVENANT_NAME_REQUIRED");
  }
  const existing = store.db
    .prepare("SELECT id FROM data_intervenants WHERE lower(name) = lower(?) LIMIT 1")
    .get(cleanName);
  if (existing) {
    return { success: true, alreadyExists: true };
  }
  const existingPending = store.db
    .prepare("SELECT id FROM intervention_intervenant_pending WHERE lower(name) = lower(?) LIMIT 1")
    .get(cleanName);
  if (existingPending) {
    return { success: true, alreadyExists: true };
  }
  const id = `intervenant-pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const now = new Date().toISOString();
  store.db
    .prepare("INSERT INTO intervention_intervenant_pending (id, name, created_by, created_at) VALUES (?, ?, ?, ?)")
    .run(id, cleanName, String(requesterUsername || "unknown"), now);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_INTERVENANT_PENDING_CREATE",
    details: {
      pendingIntervenant: {
        id,
        name: cleanName
      }
    }
  });
  return { success: true, alreadyExists: false };
}

/**
 * Rattache un site en attente au référentiel `data_sites` (création ou rattachement
 * si le code existe déjà), puis propage le `site_id` validé vers toutes les entrées
 * métier (intervention, ronde, gardiennage, main courante) qui référençaient ce
 * pending avec `site_id = NULL`.
 * Toute l'opération est encapsulée dans une transaction atomique.
 *
 * @param {object} store   Instance du store (db, logAudit, fail, ensureDataReaderRole).
 * @param {object} params  pendingId, parc, famille, requesterRole, requesterUsername.
 * @returns {{ success: boolean, siteId: string, alreadyExists: boolean, propagation: object }}
 */
function resolvePendingInterventionSite(store, { requesterRole, requesterUsername, pendingId, parc, famille }) {
  store.ensureDataReaderRole(requesterRole);
  const pending = store.db.prepare("SELECT * FROM intervention_site_pending WHERE id = ?").get(String(pendingId || "").trim());
  if (!pending) {
    store.fail("intervention:pendingSiteResolve", "Site en attente introuvable.", "INTERVENTION_PENDING_SITE_NOT_FOUND");
  }
  const cleanParc = String(parc || "")
    .trim()
    .toUpperCase();
  const cleanFamille = String(famille || "")
    .trim()
    .toUpperCase();
  if (!cleanParc) {
    store.fail("intervention:pendingSiteResolve", "Le parc est obligatoire.", "INTERVENTION_PENDING_SITE_PARC_REQUIRED");
  }

  store.db.exec("BEGIN IMMEDIATE");
  try {
    const existingSite = store.db
      .prepare("SELECT id, code, name FROM data_sites WHERE lower(code) = lower(?) LIMIT 1")
      .get(pending.code);

    let resolvedSiteId;
    let alreadyExists = false;
    let officialName;
    let officialCode;

    if (existingSite) {
      resolvedSiteId = existingSite.id;
      alreadyExists = true;
      officialName = existingSite.name;
      officialCode = existingSite.code;
      store.db.prepare("DELETE FROM intervention_site_pending WHERE id = ?").run(pending.id);
    } else {
      resolvedSiteId = generateEntityId();
      officialName = pending.name;
      officialCode = pending.code;
      store.db
        .prepare("INSERT INTO data_sites (id, code, name, parc, famille, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(resolvedSiteId, pending.code, pending.name, cleanParc, cleanFamille, new Date().toISOString());
      store.db.prepare("DELETE FROM intervention_site_pending WHERE id = ?").run(pending.id);
    }

    const canonicalDisplay = `${officialName} (${officialCode})`;
    const likePattern = `%(${pending.code})%`;
    const propagation = propagateSiteIdToEntries(store, resolvedSiteId, canonicalDisplay, likePattern);

    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "INTERVENTION_SITE_PENDING_RESOLVE",
      details: {
        pendingSite: { id: pending.id, code: pending.code, name: pending.name },
        ...(alreadyExists
          ? { resolvedSiteId, mode: "already_exists" }
          : {
              createdSite: { id: resolvedSiteId, code: pending.code, name: pending.name, parc: cleanParc, famille: cleanFamille },
              mode: "created"
            }),
        propagation
      }
    });

    store.db.exec("COMMIT");
    return { success: true, siteId: resolvedSiteId, alreadyExists, propagation };
  } catch (err) {
    try {
      store.db.exec("ROLLBACK");
    } catch (_) {
      /* rollback best-effort */
    }
    throw err;
  }
}

/**
 * Propage `site_id` et `site_display` validés vers les 4 tables métier dont les
 * entrées référençaient le site pending (site_id NULL + code dans site_display).
 *
 * @param {object} store           Instance du store (db).
 * @param {string} siteId          ID du site validé à propager.
 * @param {string} canonicalDisplay  Libellé officiel « Nom (CODE) ».
 * @param {string} likePattern     Pattern SQL LIKE `%(CODE)%`.
 * @returns {{ interventionEntries: number, rondeEntries: number, gardiennageEntries: number, mainCouranteEntries: number }}
 */
function propagateSiteIdToEntries(store, siteId, canonicalDisplay, likePattern) {
  const updateSql = (table) =>
    store.db
      .prepare(
        `UPDATE ${table}
         SET site_id = ?, site_display = ?
         WHERE site_id IS NULL
           AND lower(site_display) LIKE lower(?)`
      )
      .run(siteId, canonicalDisplay, likePattern);

  const interventionResult = updateSql("intervention_entries");
  const rondeResult = updateSql("ronde_entries");
  const gardiennageResult = updateSql("gardiennage_entries");
  const mainCouranteResult = updateSql("main_courante_entries");

  return {
    interventionEntries: interventionResult.changes,
    rondeEntries: rondeResult.changes,
    gardiennageEntries: gardiennageResult.changes,
    mainCouranteEntries: mainCouranteResult.changes
  };
}

/**
 * Rattache un intervenant en attente au référentiel `data_intervenants` (création
 * ou rattachement si le nom existe déjà), puis propage le `intervenant_id` validé
 * vers les entrées métier (intervention, ronde, gardiennage) qui référençaient ce
 * pending avec `intervenant_id = NULL`.
 * Toute l'opération est encapsulée dans une transaction atomique.
 *
 * @param {object} store   Instance du store (db, logAudit, fail, ensureDataReaderRole).
 * @param {object} params  pendingId, name (optionnel, correction admin), requesterRole, requesterUsername.
 * @returns {{ success: boolean, intervenantId: string, alreadyExists: boolean, propagation: object }}
 */
function resolvePendingInterventionIntervenant(store, { requesterRole, requesterUsername, pendingId, name }) {
  store.ensureDataReaderRole(requesterRole);
  const pending = store.db
    .prepare("SELECT * FROM intervention_intervenant_pending WHERE id = ?")
    .get(String(pendingId || "").trim());
  if (!pending) {
    store.fail(
      "intervention:pendingIntervenantResolve",
      "Intervenant en attente introuvable.",
      "INTERVENTION_PENDING_INTERVENANT_NOT_FOUND"
    );
  }
  const finalName = String(name || pending.name || "").trim();
  if (!finalName) {
    store.fail(
      "intervention:pendingIntervenantResolve",
      "Le nom de l'intervenant est obligatoire.",
      "INTERVENTION_PENDING_INTERVENANT_NAME_REQUIRED"
    );
  }

  store.db.exec("BEGIN IMMEDIATE");
  try {
    const existing = store.db
      .prepare("SELECT id FROM data_intervenants WHERE lower(name) = lower(?) LIMIT 1")
      .get(finalName);

    let resolvedId;
    let alreadyExists = false;

    if (existing) {
      resolvedId = existing.id;
      alreadyExists = true;
      store.db.prepare("DELETE FROM intervention_intervenant_pending WHERE id = ?").run(pending.id);
    } else {
      resolvedId = generateEntityId();
      store.db
        .prepare("INSERT INTO data_intervenants (id, name, created_at) VALUES (?, ?, ?)")
        .run(resolvedId, finalName, new Date().toISOString());
      store.db.prepare("DELETE FROM intervention_intervenant_pending WHERE id = ?").run(pending.id);
    }

    const propagation = propagateIntervenantIdToEntries(store, resolvedId, finalName, pending.name);

    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "INTERVENTION_INTERVENANT_PENDING_RESOLVE",
      details: {
        pendingIntervenant: { id: pending.id, name: pending.name },
        ...(alreadyExists
          ? { resolvedIntervenantId: resolvedId, mode: "already_exists" }
          : { createdIntervenant: { id: resolvedId, name: finalName }, mode: "created" }),
        propagation
      }
    });

    store.db.exec("COMMIT");
    return { success: true, intervenantId: resolvedId, alreadyExists, propagation };
  } catch (err) {
    try {
      store.db.exec("ROLLBACK");
    } catch (_) {
      /* rollback best-effort */
    }
    throw err;
  }
}

/**
 * Propage `intervenant_id` et `intervenant_name` validés vers les 3 tables métier
 * dont les entrées référençaient l'intervenant pending (intervenant_id NULL + nom exact).
 *
 * @param {object} store          Instance du store (db).
 * @param {string} intervenantId  ID de l'intervenant validé à propager.
 * @param {string} finalName      Nom officiel (potentiellement corrigé par l'admin).
 * @param {string} originalName   Nom original saisi par l'opérateur (pour le matching).
 * @returns {{ interventionEntries: number, rondeEntries: number, gardiennageEntries: number }}
 */
function propagateIntervenantIdToEntries(store, intervenantId, finalName, originalName) {
  const updateSql = (table) =>
    store.db
      .prepare(
        `UPDATE ${table}
         SET intervenant_id = ?, intervenant_name = ?
         WHERE intervenant_id IS NULL
           AND lower(intervenant_name) = lower(?)`
      )
      .run(intervenantId, finalName, originalName);

  const interventionResult = updateSql("intervention_entries");
  const rondeResult = updateSql("ronde_entries");
  const gardiennageResult = updateSql("gardiennage_entries");

  return {
    interventionEntries: interventionResult.changes,
    rondeEntries: rondeResult.changes,
    gardiennageEntries: gardiennageResult.changes
  };
}

/** Supprime un site en attente si non référencé par une entrée métier (motif obligatoire). */
function deletePendingInterventionSite(store, { requesterRole, requesterUsername, pendingId, reason }) {
  store.ensureDataReaderRole(requesterRole);
  const pending = store.db.prepare("SELECT * FROM intervention_site_pending WHERE id = ?").get(String(pendingId || "").trim());
  if (!pending) {
    store.fail("intervention:pendingSiteDelete", "Site en attente introuvable.", "INTERVENTION_PENDING_SITE_NOT_FOUND");
  }
  const existingSite = store.db.prepare("SELECT id FROM data_sites WHERE lower(code) = lower(?) LIMIT 1").get(pending.code);
  if (existingSite) {
    store.fail(
      "intervention:pendingSiteDelete",
      "Suppression impossible: ce site est déjà présent en base et reste requis pour la cohérence des données.",
      "INTERVENTION_PENDING_SITE_DELETE_BLOCKED_ALREADY_IN_BASE"
    );
  }
  const linkedIntervention = store.db
    .prepare(
      `SELECT id FROM intervention_entries
       WHERE archived_at IS NULL
         AND site_id IS NULL
         AND lower(site_display) LIKE lower(?)
       LIMIT 1`
    )
    .get(`%(${pending.code})%`);
  const linkedMainCourante = store.db
    .prepare(
      `SELECT id FROM main_courante_entries
       WHERE archived_at IS NULL
         AND site_id IS NULL
         AND lower(site_display) LIKE lower(?)
       LIMIT 1`
    )
    .get(`%(${pending.code})%`);
  const linkedRonde = store.db
    .prepare(
      `SELECT id FROM ronde_entries
       WHERE site_id IS NULL
         AND lower(site_display) LIKE lower(?)
       LIMIT 1`
    )
    .get(`%(${pending.code})%`);
  const linkedGardiennage = store.db
    .prepare(
      `SELECT id FROM gardiennage_entries
       WHERE site_id IS NULL
         AND lower(site_display) LIKE lower(?)
       LIMIT 1`
    )
    .get(`%(${pending.code})%`);
  if (linkedIntervention || linkedMainCourante || linkedRonde || linkedGardiennage) {
    store.fail(
      "intervention:pendingSiteDelete",
      "Suppression impossible: ce site en attente est encore utilisé par au moins une entrée métier (Main courante, intervention, ronde ou gardiennage).",
      "INTERVENTION_PENDING_SITE_DELETE_BLOCKED_LINKED_INTERVENTION"
    );
  }
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("intervention:pendingSiteDelete", "Le motif de suppression est obligatoire.", "INTERVENTION_PENDING_SITE_DELETE_REASON_REQUIRED");
  }
  store.db.prepare("DELETE FROM intervention_site_pending WHERE id = ?").run(pending.id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_SITE_PENDING_DELETE",
    details: {
      pendingSite: { id: pending.id, code: pending.code, name: pending.name },
      reason: cleanReason
    }
  });
  return { success: true };
}

/** Supprime un intervenant en attente si non lié (intervention, ronde, gardiennage). */
function deletePendingInterventionIntervenant(store, { requesterRole, requesterUsername, pendingId, reason }) {
  store.ensureDataReaderRole(requesterRole);
  const pending = store.db
    .prepare("SELECT * FROM intervention_intervenant_pending WHERE id = ?")
    .get(String(pendingId || "").trim());
  if (!pending) {
    store.fail(
      "intervention:pendingIntervenantDelete",
      "Intervenant en attente introuvable.",
      "INTERVENTION_PENDING_INTERVENANT_NOT_FOUND"
    );
  }
  const existingIntervenant = store.db
    .prepare("SELECT id FROM data_intervenants WHERE lower(name) = lower(?) LIMIT 1")
    .get(pending.name);
  if (existingIntervenant) {
    store.fail(
      "intervention:pendingIntervenantDelete",
      "Suppression impossible: cet intervenant est déjà présent en base et reste requis pour la cohérence des données.",
      "INTERVENTION_PENDING_INTERVENANT_DELETE_BLOCKED_ALREADY_IN_BASE"
    );
  }
  const linkedIntervention = store.db
    .prepare(
      `SELECT id FROM intervention_entries
       WHERE archived_at IS NULL
         AND intervenant_id IS NULL
         AND lower(intervenant_name) = lower(?)
       LIMIT 1`
    )
    .get(pending.name);
  const linkedRonde = store.db
    .prepare(
      `SELECT id FROM ronde_entries
       WHERE intervenant_id IS NULL
         AND lower(intervenant_name) = lower(?)
       LIMIT 1`
    )
    .get(pending.name);
  const linkedGardiennage = store.db
    .prepare(
      `SELECT id FROM gardiennage_entries
       WHERE intervenant_id IS NULL
         AND lower(intervenant_name) = lower(?)
       LIMIT 1`
    )
    .get(pending.name);
  if (linkedIntervention || linkedRonde || linkedGardiennage) {
    store.fail(
      "intervention:pendingIntervenantDelete",
      "Suppression impossible: cet intervenant en attente est encore utilisé par au moins une entrée métier (intervention, ronde ou gardiennage).",
      "INTERVENTION_PENDING_INTERVENANT_DELETE_BLOCKED_LINKED_INTERVENTION"
    );
  }
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail(
      "intervention:pendingIntervenantDelete",
      "Le motif de suppression est obligatoire.",
      "INTERVENTION_PENDING_INTERVENANT_DELETE_REASON_REQUIRED"
    );
  }
  store.db.prepare("DELETE FROM intervention_intervenant_pending WHERE id = ?").run(pending.id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "INTERVENTION_INTERVENANT_PENDING_DELETE",
    details: {
      pendingIntervenant: { id: pending.id, name: pending.name },
      reason: cleanReason
    }
  });
  return { success: true };
}

module.exports = {
  listInterventions,
  getInterventionOpenCount,
  createInterventionEntry,
  updateInterventionEntry,
  setInterventionStatus,
  setInterventionBillingStatus,
  listPendingInterventionSites,
  createPendingInterventionSite,
  listPendingInterventionIntervenants,
  createPendingInterventionIntervenant,
  resolvePendingInterventionSite,
  resolvePendingInterventionIntervenant,
  deletePendingInterventionSite,
  deletePendingInterventionIntervenant
};
