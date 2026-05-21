const crypto = require("crypto");
const exceptionalSlots = require("./rondeExceptionalSlotsEngine");
const { autoCloseExpiredExceptionalRondes } = require("./rondeAutoClose");
const ORIGIN_KINDS = new Set(["TELESURVEILLANCE", "CLIENT", "AUTRE"]);
const SOURCES = new Set(["URGENCE", "LIEE_INTERVENTION", "PLANIFIE"]);
const PLANNED_ROUND_KINDS = new Set(["OPENING", "CLOSING", "RANDOM_DAY", "RANDOM_NIGHT"]);
const PLANNED_SLOT_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\d+$/i;

function normalizeActorName(value) {
  return String(value || "").trim().toLowerCase();
}

function parseAuditDetails(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return {};
}

function findRondeCreatorUsername(store, row) {
  const batchId = String(row.request_batch_id || "").trim();
  if (batchId) {
    const logs = store.db
      .prepare(
        `SELECT actor_username, details_json
         FROM audit_logs
         WHERE action = 'RONDE_BATCH_CREATE'
         ORDER BY datetime(occurred_at) DESC
         LIMIT 200`
      )
      .all();
    for (const log of logs) {
      const details = parseAuditDetails(log.details_json);
      if (String(details.batchId || "").trim() === batchId) {
        return String(log.actor_username || "").trim();
      }
    }
    return "";
  }
  const logs = store.db
    .prepare(
      `SELECT actor_username, details_json
       FROM audit_logs
       WHERE action = 'RONDE_CREATE'
       ORDER BY datetime(occurred_at) DESC
       LIMIT 300`
    )
    .all();
  for (const log of logs) {
    const details = parseAuditDetails(log.details_json);
    if (String(details.id || "").trim() === String(row.id || "").trim()) {
      return String(log.actor_username || "").trim();
    }
  }
  return "";
}

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

function computeDurationMinutes({ requestDate, arrivalTime, departureTime }) {
  if (!requestDate || !arrivalTime || !departureTime) return null;
  const arrivalMs = parseDateTimeMs(requestDate, arrivalTime);
  let departureMs = parseDateTimeMs(requestDate, departureTime);
  if (arrivalMs == null || departureMs == null) return null;
  if (departureMs < arrivalMs) {
    departureMs += 24 * 60 * 60 * 1000;
  }
  return Math.round((departureMs - arrivalMs) / 60000);
}

function parseRequestPlanningSnapshotJson(raw) {
  if (raw == null || raw === "") return null;
  try {
    const p = JSON.parse(String(raw));
    if (p && typeof p === "object" && !Array.isArray(p) && p.version === 1) {
      return p;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function formatDemandeEmiseContextRonde(dateIso, timeHm) {
  const trimmed = String(dateIso || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
    : new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const dateFr = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const t = String(timeHm || "").trim();
  return t ? `Demande émise le ${dateFr} à ${t}` : `Demande émise le ${dateFr}`;
}

const SNAP_TIME_LOCAL_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function mapRondeRow(row) {
  const requires =
    row.motif_type_requires_free_text != null && row.motif_type_requires_free_text !== ""
      ? Boolean(Number(row.motif_type_requires_free_text))
      : false;
  const label =
    row.motif_type_label && String(row.motif_type_label).trim()
      ? String(row.motif_type_label).trim()
      : String(row.motif_category || "").trim();
  let closureCustomValues = {};
  if (row.closure_custom_values_json) {
    try {
      const parsed = JSON.parse(String(row.closure_custom_values_json));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        closureCustomValues = parsed;
      }
    } catch (_) {
      closureCustomValues = {};
    }
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source || "URGENCE",
    originInterventionId: row.origin_intervention_id || null,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    requestDate: row.request_date,
    motifTypeId: row.motif_type_id || null,
    motifTypeLabel: label,
    motifRequiresFreeText: requires,
    motifDetail: row.motif_other || "",
    horairesDemandeObs: row.horaires_demande_obs || "",
    originKind: row.origin_kind || "TELESURVEILLANCE",
    originDetail: row.origin_detail || "",
    intervenantId: row.intervenant_id || null,
    intervenantName: row.intervenant_name || "",
    arrivalTime: row.arrival_time || "",
    departureTime: row.departure_time || "",
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    workOrderNumber: row.work_order_number || "",
    report: row.report || "",
    status: row.status,
    cancellationReason: row.cancellation_reason || "",
    closedAt: row.closed_at || null,
    plannedProfileId: row.planned_profile_id || null,
    plannedRoundKind: row.planned_round_kind || null,
    plannedSlotKey: row.planned_slot_key || null,
    closureCustomValues,
    requestPlanningSnapshot: parseRequestPlanningSnapshotJson(row.request_planning_snapshot_json),
    requestBatchId: row.request_batch_id || null,
    /** Chaîne brute pour regrouper un lot (ne pas afficher en UI). */
    requestPlanningSnapshotJson: row.request_planning_snapshot_json ? String(row.request_planning_snapshot_json) : null
  };
}

function normalizeClosureCustomValues(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  Object.entries(input).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (!key) return;
    out[key] = String(rawValue ?? "").trim().slice(0, 1000);
  });
  return out;
}

function ensurePlannedMeta(store, normalizedSource, plannedProfileId, plannedRoundKind) {
  if (normalizedSource !== "PLANIFIE") {
    return { plannedProfileId: null, plannedRoundKind: null };
  }
  const pid = String(plannedProfileId || "").trim();
  const rk = String(plannedRoundKind || "").trim().toUpperCase();
  if (!pid || !rk) {
    store.fail("ronde:validate", "Contexte planifié incomplet (profil ou type de passage).", "RONDE_PLANNED_META_REQUIRED");
  }
  if (!PLANNED_ROUND_KINDS.has(rk)) {
    store.fail("ronde:validate", "Type de passage planifié invalide.", "RONDE_PLANNED_KIND_INVALID");
  }
  const profile = store.db.prepare("SELECT id FROM data_ronde_planned_profiles WHERE id = ?").get(pid);
  if (!profile) {
    store.fail("ronde:validate", "Profil de planification introuvable.", "RONDE_PLANNED_PROFILE_NOT_FOUND");
  }
  return { plannedProfileId: pid, plannedRoundKind: rk };
}

function selectRondeWithMotif(store, id) {
  return store.db
    .prepare(
      `SELECT r.*, m.label AS motif_type_label, m.requires_free_text AS motif_type_requires_free_text
       FROM ronde_entries r
       LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
       WHERE r.id = ?`
    )
    .get(id);
}

function ensureMotifType(store, motifTypeId, motifOther) {
  const id = String(motifTypeId || "").trim();
  if (!id) {
    store.fail("ronde:validate", "Le motif est obligatoire.", "RONDE_MOTIF_REQUIRED");
  }
  const row = store.db
    .prepare("SELECT id, label, requires_free_text FROM data_ronde_motif_types WHERE id = ?")
    .get(id);
  if (!row) {
    store.fail("ronde:validate", "Motif inconnu ou non disponible.", "RONDE_MOTIF_INVALID");
  }
  const detail = String(motifOther || "").trim();
  const snapshot = String(row.label || "").trim().slice(0, 200) || "—";
  return {
    motifTypeId: id,
    motifOther: detail,
    motifCategorySnapshot: snapshot
  };
}

function ensureOrigin(store, originKind, originDetail) {
  const kind = String(originKind || "").trim().toUpperCase();
  if (!ORIGIN_KINDS.has(kind)) {
    store.fail("ronde:validate", "Origine de la demande invalide.", "RONDE_ORIGIN_INVALID");
  }
  const detail = String(originDetail || "").trim();
  if (kind === "CLIENT" && !detail) {
    store.fail("ronde:validate", "Nom du client obligatoire lorsque l'origine est « Client ».", "RONDE_ORIGIN_CLIENT_REQUIRED");
  }
  return { originKind: kind, originDetail: detail };
}

function ensureSource(store, source) {
  const src = String(source || "URGENCE").trim().toUpperCase();
  if (!SOURCES.has(src)) {
    store.fail("ronde:validate", "Source de ronde invalide.", "RONDE_SOURCE_INVALID");
  }
  return src;
}

function normalizeRondeBody(store, payload) {
  const requestDate = toIsoDate(payload.requestDate);
  const siteDisplay = String(payload.siteDisplay || "").trim();
  const horairesDemandeObs = String(payload.horairesDemandeObs || "").trim();
  const intervenantName = String(payload.intervenantName || "").trim();
  const arrivalTime = toIsoTime(payload.arrivalTime);
  const departureTime = toIsoTime(payload.departureTime);
  const workOrderNumber = String(payload.workOrderNumber || "").trim();
  const report = String(payload.report || "").trim();
  const closureCustomValues = normalizeClosureCustomValues(payload.closureCustomValues);

  if (!requestDate) {
    store.fail("ronde:validate", "La date de la demande est obligatoire.", "RONDE_REQUEST_DATE_REQUIRED");
  }
  if (!siteDisplay) {
    store.fail("ronde:validate", "Le site est obligatoire.", "RONDE_SITE_REQUIRED");
  }
  if (!intervenantName) {
    store.fail("ronde:validate", "Le prestataire est obligatoire.", "RONDE_PRESTATAIRE_REQUIRED");
  }

  const motif = ensureMotifType(store, payload.motifTypeId, payload.motifDetail ?? payload.motifOther);
  const origin = ensureOrigin(store, payload.originKind, payload.originDetail);

  if (arrivalTime && departureTime) {
    const arrivalMs = parseDateTimeMs(requestDate, arrivalTime);
    let departureMs = parseDateTimeMs(requestDate, departureTime);
    if (arrivalMs != null && departureMs != null && departureMs < arrivalMs) {
      departureMs += 24 * 60 * 60 * 1000;
    }
    if (arrivalMs != null && departureMs != null && departureMs < arrivalMs) {
      store.fail("ronde:validate", "Les horaires de la ronde sont incohérents.", "RONDE_TIMES_INVALID");
    }
  }

  const durationMinutes = computeDurationMinutes({ requestDate, arrivalTime, departureTime });

  return {
    siteId: payload.siteId || null,
    siteDisplay,
    requestDate,
    motifTypeId: motif.motifTypeId,
    motifOther: motif.motifOther,
    motifCategorySnapshot: motif.motifCategorySnapshot,
    horairesDemandeObs,
    originKind: origin.originKind,
    originDetail: origin.originDetail,
    intervenantId: payload.intervenantId || null,
    intervenantName,
    arrivalTime,
    departureTime,
    durationMinutes,
    workOrderNumber,
    report,
    closureCustomValues
  };
}

function listRondes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  autoCloseExpiredExceptionalRondes(store);
  const rows = store.db
    .prepare(
      `SELECT r.*, m.label AS motif_type_label, m.requires_free_text AS motif_type_requires_free_text
       FROM ronde_entries r
       LEFT JOIN data_ronde_motif_types m ON m.id = r.motif_type_id
       ORDER BY datetime(r.request_date) DESC, r.id DESC`
    )
    .all();
  return rows.map((row) => mapRondeRow(row));
}

function createRonde(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    id,
    source,
    originInterventionId,
    plannedProfileId: plannedProfileIdRaw,
    plannedRoundKind: plannedRoundKindRaw,
    plannedSlotKey: plannedSlotKeyRaw,
    requestPlanningSnapshotJson: rawPlanningSnapshotJson,
    requestBatchId: requestBatchIdRaw,
    requestDate,
    siteId,
    siteDisplay,
    motifTypeId,
    motifDetail,
    motifOther,
    horairesDemandeObs,
    originKind,
    originDetail,
    intervenantId,
    intervenantName,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    closureCustomValues,
    initialStatus: initialStatusRaw,
    cancellationReason: cancellationReasonRaw
  } = payload;

  store.ensureDataReaderRole(requesterRole);
  const src = ensureSource(store, source);
  const plannedMeta = ensurePlannedMeta(store, src, plannedProfileIdRaw, plannedRoundKindRaw);
  const plannedSlotKeyTrimmed = String(plannedSlotKeyRaw ?? "").trim();
  const plannedSlotKeyInsert =
    src === "PLANIFIE" && plannedSlotKeyTrimmed && PLANNED_SLOT_KEY_RE.test(plannedSlotKeyTrimmed)
      ? plannedSlotKeyTrimmed.slice(0, 120)
      : null;
  const normalized = normalizeRondeBody(store, {
    requestDate,
    siteId,
    siteDisplay,
    motifTypeId,
    motifDetail: motifDetail ?? motifOther,
    horairesDemandeObs,
    originKind,
    originDetail,
    intervenantId,
    intervenantName,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    closureCustomValues
  });

  let originId = null;
  if (originInterventionId) {
    originId = String(originInterventionId).trim();
    const exists = store.db.prepare("SELECT id FROM intervention_entries WHERE id = ?").get(originId);
    if (!exists) {
      store.fail("ronde:create", "Intervention liée introuvable.", "RONDE_ORIGIN_INTERVENTION_NOT_FOUND");
    }
  }

  const existing = store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id);
  if (existing) {
    return mapRondeRow(selectRondeWithMotif(store, id));
  }

  const initialStatusUpper = String(initialStatusRaw || "EN_COURS").trim().toUpperCase();
  const allowedCreateStatus = new Set(["EN_COURS", "CLOTURE", "ANNULE"]);
  const createdStatus = allowedCreateStatus.has(initialStatusUpper) ? initialStatusUpper : "EN_COURS";
  const cancelReasonTrimmed = String(cancellationReasonRaw || "").trim();
  if (createdStatus === "ANNULE" && !cancelReasonTrimmed) {
    store.fail("ronde:validate", "Le motif d'annulation est obligatoire.", "RONDE_CANCEL_REASON_REQUIRED");
  }

  const requestBatchIdInsert =
    src !== "PLANIFIE" && requestBatchIdRaw
      ? String(requestBatchIdRaw).trim().slice(0, 48)
      : null;
  const batchRowCountBeforeInsert = requestBatchIdInsert
    ? Number(
        (
          store.db
            .prepare("SELECT COUNT(1) AS c FROM ronde_entries WHERE request_batch_id = ?")
            .get(requestBatchIdInsert)?.c || 0
        )
      )
    : 0;

  let requestPlanningSnapshotStored = null;
  if (rawPlanningSnapshotJson != null && src !== "PLANIFIE") {
    const snapStr = typeof rawPlanningSnapshotJson === "string" ? rawPlanningSnapshotJson.trim() : "";
    if (snapStr.length > 0) {
      if (snapStr.length > 400000) {
        store.fail("ronde:validate", "Paramètres de demande trop volumineux.", "RONDE_PLANNING_SNAPSHOT_TOO_LARGE");
      }
      try {
        const parsed = JSON.parse(snapStr);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.version === 1) {
          requestPlanningSnapshotStored = JSON.stringify(parsed);
        }
      } catch (_) {
        /* snapshot ignoré si invalide */
      }
    }
  }

  const now = new Date().toISOString();
  const closedAtInsert = createdStatus === "EN_COURS" ? null : now;
  const cancellationInsert = createdStatus === "ANNULE" ? cancelReasonTrimmed : null;

  store.db
    .prepare(
      `INSERT INTO ronde_entries (
        id, created_at, updated_at, source, origin_intervention_id,
        site_id, site_display, request_date,
        motif_type_id, motif_category, motif_other, horaires_demande_obs,
        origin_kind, origin_detail,
        intervenant_id, intervenant_name,
        arrival_time, departure_time, duration_minutes,
        work_order_number, report, closure_custom_values_json,
        planned_profile_id, planned_round_kind, planned_slot_key,
        request_planning_snapshot_json,
        request_batch_id,
        status, cancellation_reason, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      now,
      now,
      src,
      originId,
      normalized.siteId,
      normalized.siteDisplay,
      normalized.requestDate,
      normalized.motifTypeId,
      normalized.motifCategorySnapshot,
      normalized.motifOther || null,
      normalized.horairesDemandeObs || null,
      normalized.originKind,
      normalized.originDetail || null,
      normalized.intervenantId,
      normalized.intervenantName,
      normalized.arrivalTime || null,
      normalized.departureTime || null,
      normalized.durationMinutes,
      normalized.workOrderNumber || null,
      normalized.report || null,
      JSON.stringify(normalized.closureCustomValues),
      plannedMeta.plannedProfileId,
      plannedMeta.plannedRoundKind,
      plannedSlotKeyInsert,
      requestPlanningSnapshotStored,
      requestBatchIdInsert,
      createdStatus,
      cancellationInsert,
      closedAtInsert
    );

  if (requestBatchIdInsert) {
    // Lot exceptionnel: éviter un log par ligne créée, conserver une seule entrée agrégée.
    if (batchRowCountBeforeInsert === 0) {
      const batchRowCountAfterInsert = Number(
        (
          store.db
            .prepare("SELECT COUNT(1) AS c FROM ronde_entries WHERE request_batch_id = ?")
            .get(requestBatchIdInsert)?.c || 0
        )
      );
      store.logAudit({
        actorUsername: requesterUsername || "unknown",
        action: "RONDE_BATCH_CREATE",
        details: {
          batchId: requestBatchIdInsert,
          total: batchRowCountAfterInsert,
          success: batchRowCountAfterInsert,
          failed: 0,
          preview: {
            source: src,
            siteDisplay: normalized.siteDisplay,
            requestDate: normalized.requestDate,
            motifLabel: normalized.motifCategorySnapshot,
            intervenantName: normalized.intervenantName
          }
        }
      });
    }
  } else {
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "RONDE_CREATE",
      details: {
        id,
        created: {
          source: src,
          siteDisplay: normalized.siteDisplay,
          requestDate: normalized.requestDate,
          motifLabel: normalized.motifCategorySnapshot,
          intervenantName: normalized.intervenantName,
          linkedIntervention: Boolean(originId),
          status: createdStatus,
          ...(createdStatus === "ANNULE" ? { cancellationReason: cancelReasonTrimmed } : {}),
          ...(plannedMeta.plannedRoundKind
            ? {
                plannedRoundKind: plannedMeta.plannedRoundKind
              }
            : {})
        }
      }
    });
  }

  return mapRondeRow(selectRondeWithMotif(store, id));
}

function updateRonde(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    requestDate,
    siteId,
    siteDisplay,
    motifTypeId,
    motifDetail,
    motifOther,
    horairesDemandeObs,
    originKind,
    originDetail,
    intervenantId,
    intervenantName,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    closureCustomValues
  } = payload;

  store.ensureDataReaderRole(requesterRole);
  const row = store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("ronde:update", "Ronde introuvable.", "RONDE_NOT_FOUND");
  }
  if (String(row.updated_at) !== String(expectedUpdatedAt || "")) {
    store.fail("ronde:update", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  }

  const normalized = normalizeRondeBody(store, {
    requestDate,
    siteId,
    siteDisplay,
    motifTypeId,
    motifDetail: motifDetail ?? motifOther,
    horairesDemandeObs,
    originKind,
    originDetail,
    intervenantId,
    intervenantName,
    arrivalTime,
    departureTime,
    workOrderNumber,
    report,
    closureCustomValues
  });

  const now = new Date().toISOString();
  const result = store.db
    .prepare(
      `UPDATE ronde_entries SET
        updated_at = ?, site_id = ?, site_display = ?, request_date = ?,
        motif_type_id = ?, motif_category = ?, motif_other = ?, horaires_demande_obs = ?,
        origin_kind = ?, origin_detail = ?,
        intervenant_id = ?, intervenant_name = ?,
        arrival_time = ?, departure_time = ?, duration_minutes = ?,
        work_order_number = ?, report = ?, closure_custom_values_json = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run(
      now,
      normalized.siteId,
      normalized.siteDisplay,
      normalized.requestDate,
      normalized.motifTypeId,
      normalized.motifCategorySnapshot,
      normalized.motifOther || null,
      normalized.horairesDemandeObs || null,
      normalized.originKind,
      normalized.originDetail || null,
      normalized.intervenantId,
      normalized.intervenantName,
      normalized.arrivalTime || null,
      normalized.departureTime || null,
      normalized.durationMinutes,
      normalized.workOrderNumber || null,
      normalized.report || null,
      JSON.stringify(normalized.closureCustomValues),
      id,
      expectedUpdatedAt
    );

  if (result.changes === 0) {
    store.fail("ronde:update", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  }

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "RONDE_UPDATE",
    details: {
      id,
      before: {
        siteDisplay: row.site_display || "",
        requestDate: row.request_date || "",
        motifLabel: row.motif_category || "",
        intervenantName: row.intervenant_name || "",
        arrivalTime: row.arrival_time || "",
        departureTime: row.departure_time || ""
      },
      after: {
        siteDisplay: normalized.siteDisplay,
        requestDate: normalized.requestDate,
        motifLabel: normalized.motifCategorySnapshot,
        intervenantName: normalized.intervenantName,
        arrivalTime: normalized.arrivalTime,
        departureTime: normalized.departureTime
      }
    }
  });

  return mapRondeRow(selectRondeWithMotif(store, id));
}

function setRondeStatus(store, { requesterRole, requesterUsername, id, expectedUpdatedAt, status, cancellationReason }) {
  store.ensureDataReaderRole(requesterRole);
  const row = store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("ronde:status", "Ronde introuvable.", "RONDE_NOT_FOUND");
  }
  if (String(row.updated_at) !== String(expectedUpdatedAt || "")) {
    store.fail("ronde:status", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  }

  const nextStatus = status === "ANNULE" ? "ANNULE" : status === "CLOTURE" ? "CLOTURE" : "EN_COURS";
  const reason = String(cancellationReason || "").trim();
  if (nextStatus === "ANNULE" && !reason) {
    store.fail("ronde:status", "Le motif d'annulation est obligatoire.", "RONDE_CANCEL_REASON_REQUIRED");
  }

  const now = new Date().toISOString();
  const updateResult = store.db
    .prepare(
      `UPDATE ronde_entries SET
        status = ?, cancellation_reason = ?, closed_at = ?, updated_at = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run(
      nextStatus,
      nextStatus === "ANNULE" ? reason : null,
      nextStatus === "EN_COURS" ? null : now,
      now,
      id,
      expectedUpdatedAt
    );

  if (updateResult.changes === 0) {
    store.fail("ronde:status", "Ronde modifiée ailleurs. Actualisez la liste.", "RONDE_CONFLICT");
  }

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action:
      nextStatus === "ANNULE" ? "RONDE_CANCEL" : nextStatus === "CLOTURE" ? "RONDE_CLOSE" : "RONDE_REOPEN",
    details: {
      id,
      before: { status: row.status, cancellationReason: row.cancellation_reason || "" },
      after: { status: nextStatus, cancellationReason: nextStatus === "ANNULE" ? reason : "" }
    }
  });

  return mapRondeRow(selectRondeWithMotif(store, id));
}

function parseRowClosureCustomValues(row) {
  let closureCustomValues = {};
  if (row.closure_custom_values_json) {
    try {
      const parsed = JSON.parse(String(row.closure_custom_values_json));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        closureCustomValues = parsed;
      }
    } catch (_) {
      closureCustomValues = {};
    }
  }
  return closureCustomValues;
}

function assertCoherentExceptionalBatch(store, rows) {
  if (!rows.length) {
    store.fail("ronde:batch", "Aucune ronde sélectionnée.", "RONDE_BATCH_EMPTY");
  }
  if (rows.some((r) => r.source === "PLANIFIE")) {
    store.fail(
      "ronde:batch",
      "Ce regroupement ne s'applique pas aux rondes issues de la programmation planifiée.",
      "RONDE_BATCH_PLANNED_FORBIDDEN"
    );
  }
  const batchIds = rows.map((r) => r.request_batch_id).filter((x) => x != null && String(x).trim() !== "");
  if (batchIds.length === rows.length) {
    const set = new Set(batchIds.map((x) => String(x)));
    if (set.size !== 1) {
      store.fail("ronde:batch", "Les rondes ne font pas partie du même lot.", "RONDE_BATCH_MISMATCH");
    }
    return;
  }
  if (batchIds.length > 0 && batchIds.length < rows.length) {
    store.fail(
      "ronde:batch",
      "Lot incohérent (anciennes fiches mélangées à un lot identifié).",
      "RONDE_BATCH_MISMATCH"
    );
  }
  const snaps = rows.map((r) => String(r.request_planning_snapshot_json || "").trim());
  const siteIds = rows.map((r) => String(r.site_id || ""));
  if (snaps.every((s) => s.length > 0) && new Set(snaps).size === 1 && new Set(siteIds).size === 1) {
    return;
  }
  if (rows.length === 1) {
    return;
  }
  store.fail(
    "ronde:batch",
    "Impossible de regrouper automatiquement ces fiches (données anciennes sans lot). Ouvrez chaque ronde depuis la liste.",
    "RONDE_BATCH_LEGACY_INCOHERENT"
  );
}

function updateRondeBatchSharedFields(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    entryIds,
    siteId,
    siteDisplay,
    motifTypeId,
    motifDetail,
    motifOther,
    originKind,
    originDetail,
    intervenantId,
    intervenantName,
    requestPlanningSnapshotJson
  } = payload;

  store.ensureDataReaderRole(requesterRole);
  const ids = [...new Set((entryIds || []).map((x) => String(x).trim()).filter(Boolean))];
  const rows = ids.map((id) => store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id));
  if (rows.some((r) => !r)) {
    store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  }
  assertCoherentExceptionalBatch(store, rows);

  const snapshotProvided = Object.prototype.hasOwnProperty.call(payload, "requestPlanningSnapshotJson");
  let snapshotStored = null;
  if (snapshotProvided) {
    const snapStr = String(requestPlanningSnapshotJson ?? "").trim();
    if (!snapStr) {
      store.fail("ronde:batch", "Instantané de demande vide.", "RONDE_BATCH_SNAPSHOT_INVALID");
    }
    if (snapStr.length > 400000) {
      store.fail("ronde:validate", "Paramètres de demande trop volumineux.", "RONDE_PLANNING_SNAPSHOT_TOO_LARGE");
    }
    try {
      const parsed = JSON.parse(snapStr);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.version === 1) {
        snapshotStored = JSON.stringify(parsed);
      }
    } catch (_) {
      /* below */
    }
    if (!snapshotStored) {
      store.fail("ronde:batch", "Instantané de demande invalide.", "RONDE_BATCH_SNAPSHOT_INVALID");
    }
  }

  let rowsForUpdate = rows;
  let planningResyncAudit = null;

  if (snapshotProvided && snapshotStored) {
    let parsedSnapBody = null;
    try {
      parsedSnapBody = JSON.parse(snapshotStored);
    } catch (_) {
      parsedSnapBody = null;
    }
    const allowResync =
      parsedSnapBody &&
      typeof parsedSnapBody === "object" &&
      parsedSnapBody.version === 1 &&
      parsedSnapBody.createRoundsEnabled !== false &&
      parsedSnapBody.origin !== "CONTRAT";

    if (allowResync) {
      const holidayIsoRows = store.db.prepare("SELECT date_iso FROM data_holidays").all();
      const holidaySet = new Set(holidayIsoRows.map((h) => String(h.date_iso || "").trim()).filter(Boolean));

      const desiredSlots = exceptionalSlots.buildDesiredExceptionalSlotList(parsedSnapBody, holidaySet);
      if (!desiredSlots.length) {
        store.fail(
          "ronde:batch",
          "Aucun créneau ne peut être calculé avec ces paramètres.",
          "RONDE_BATCH_RESYNC_EMPTY"
        );
      }

      const multiset = new Map();
      exceptionalSlots.multisetAddMany(multiset, desiredSlots);

      /* Consomme d’abord les passages encore « couverts » par une fiche clôturée (évite une recréation inutile). */
      for (const row of rows) {
        if (String(row.status) !== "CLOTURE") continue;
        const sk = exceptionalSlots.extractSlotKeyFromRondeObservation(row.request_date, row.horaires_demande_obs);
        exceptionalSlots.multisetConsumeOne(multiset, sk);
      }

      const toDeleteIds = [];
      for (const row of rows) {
        const st = String(row.status || "");
        if (st === "CLOTURE") continue;
        const sk = exceptionalSlots.extractSlotKeyFromRondeObservation(row.request_date, row.horaires_demande_obs);
        if (exceptionalSlots.multisetConsumeOne(multiset, sk)) {
          continue;
        }
        toDeleteIds.push(row.id);
      }

      const delStmt = store.db.prepare("DELETE FROM ronde_entries WHERE id = ?");
      for (const rid of toDeleteIds) {
        delStmt.run(rid);
      }

      const tpl = rows[0];
      const batchIdVal = tpl.request_batch_id ? String(tpl.request_batch_id).trim().slice(0, 48) : null;
      const consigneSnap = String(parsedSnapBody.consigne || "").trim();
      const snapshotRequestDate = String(parsedSnapBody.requestDate || "").trim();
      const snapshotRequestTime = SNAP_TIME_LOCAL_RE.test(String(parsedSnapBody.requestTime || "").trim())
        ? String(parsedSnapBody.requestTime).trim()
        : "00:00";

      /** Créneaux encore manquants après appariement fermés + ouverts (ordre déterministe pour l’audit). */
      const insertsNeeded = [];
      const sortedMultiset = Array.from(multiset.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      for (const [slotKey, qty] of sortedMultiset) {
        let n = qty;
        while (n > 0) {
          insertsNeeded.push(slotKey);
          n -= 1;
        }
      }

      const createdIds = [];
      let createdCount = 0;
      for (const slotKey of insertsNeeded) {
        const pipeIdx = slotKey.indexOf("|");
        const requestDatePart = pipeIdx >= 0 ? slotKey.slice(0, pipeIdx) : slotKey;
        const timePart = pipeIdx >= 0 ? slotKey.slice(pipeIdx + 1) : "";

        const newId =
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `ronde_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        createdIds.push(newId);

        const demandeCtx = formatDemandeEmiseContextRonde(snapshotRequestDate || requestDatePart, snapshotRequestTime);
        const scheduleDetails = [demandeCtx, timePart ? `Heure demandée: ${timePart}` : "", consigneSnap]
          .filter(Boolean)
          .join(" — ");

        createRonde(store, {
          requesterRole,
          requesterUsername,
          id: newId,
          source: tpl.source || "URGENCE",
          originInterventionId: tpl.origin_intervention_id || parsedSnapBody.originInterventionId || null,
          requestPlanningSnapshotJson: snapshotStored,
          requestBatchId: batchIdVal,
          requestDate: requestDatePart,
          siteId,
          siteDisplay,
          motifTypeId,
          motifDetail: motifDetail ?? motifOther,
          horairesDemandeObs: scheduleDetails,
          originKind,
          originDetail,
          intervenantId,
          intervenantName,
          arrivalTime: "",
          departureTime: "",
          workOrderNumber: "",
          report: "",
          closureCustomValues: {}
        });
        createdCount += 1;
      }

      const seen = new Set();
      rowsForUpdate = [];
      const pushFresh = (id) => {
        if (!id || seen.has(id)) return;
        const fresh = store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id);
        if (!fresh) return;
        seen.add(id);
        rowsForUpdate.push(fresh);
      };

      for (const r of rows) {
        if (toDeleteIds.includes(String(r.id))) continue;
        pushFresh(r.id);
      }
      for (const cid of createdIds) {
        pushFresh(cid);
      }

      planningResyncAudit = {
        deletedStalePasses: toDeleteIds.length,
        createdPasses: createdCount
      };
    }
  }

  const now = new Date().toISOString();
  const summaries = [];
  const upd = store.db.prepare(
    `UPDATE ronde_entries SET
      updated_at = ?, site_id = ?, site_display = ?,
      motif_type_id = ?, motif_category = ?, motif_other = ?,
      origin_kind = ?, origin_detail = ?,
      intervenant_id = ?, intervenant_name = ?,
      request_planning_snapshot_json = ?
    WHERE id = ?`
  );

  for (const row of rowsForUpdate) {
    const closureCustomValues = parseRowClosureCustomValues(row);
    const normalized = normalizeRondeBody(store, {
      requestDate: row.request_date,
      siteId,
      siteDisplay,
      motifTypeId,
      motifDetail: motifDetail ?? motifOther,
      horairesDemandeObs: row.horaires_demande_obs,
      originKind,
      originDetail,
      intervenantId,
      intervenantName,
      arrivalTime: row.arrival_time || "",
      departureTime: row.departure_time || "",
      workOrderNumber: row.work_order_number || "",
      report: row.report || "",
      closureCustomValues
    });

    const nextPlanningSnap = snapshotProvided ? snapshotStored : row.request_planning_snapshot_json;

    upd.run(
      now,
      normalized.siteId,
      normalized.siteDisplay,
      normalized.motifTypeId,
      normalized.motifCategorySnapshot,
      normalized.motifOther || null,
      normalized.originKind,
      normalized.originDetail || null,
      normalized.intervenantId,
      normalized.intervenantName,
      nextPlanningSnap,
      row.id
    );
    summaries.push({
      id: row.id,
      before: {
        siteDisplay: row.site_display || "",
        motifLabel: row.motif_category || "",
        intervenantName: row.intervenant_name || ""
      },
      after: {
        siteDisplay: normalized.siteDisplay,
        motifLabel: normalized.motifCategorySnapshot,
        intervenantName: normalized.intervenantName
      }
    });
  }

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "RONDE_BATCH_UPDATE",
    details: {
      count: rowsForUpdate.length,
      entryIds: rowsForUpdate.map((r) => r.id),
      planningSnapshotSynced: Boolean(snapshotProvided),
      planningResync: planningResyncAudit,
      rows: summaries.slice(0, 25)
    }
  });

  return { ok: true, updatedCount: rowsForUpdate.length };
}

function bulkCancelRondeBatch(store, payload) {
  const { requesterRole, requesterUsername, entryIds, reason } = payload;
  store.ensureDataReaderRole(requesterRole);
  const reasonTrim = String(reason || "").trim();
  if (!reasonTrim) {
    store.fail("ronde:batch", "Le motif d'annulation est obligatoire.", "RONDE_BATCH_CANCEL_REASON_REQUIRED");
  }
  const ids = [...new Set((entryIds || []).map((x) => String(x).trim()).filter(Boolean))];
  const rows = ids.map((id) => store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id));
  if (rows.some((r) => !r)) {
    store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  }
  assertCoherentExceptionalBatch(store, rows);

  const now = new Date().toISOString();
  const toCancel = rows.filter((r) => r.status === "EN_COURS");
  const stmt = store.db.prepare(
    `UPDATE ronde_entries SET status = 'ANNULE', cancellation_reason = ?, closed_at = ?, updated_at = ? WHERE id = ?`
  );
  for (const row of toCancel) {
    stmt.run(reasonTrim, now, now, row.id);
  }

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "RONDE_BATCH_CANCEL",
    details: {
      reason: reasonTrim,
      cancelledCount: toCancel.length,
      skippedCount: rows.length - toCancel.length,
      entryIds: toCancel.map((r) => r.id)
    }
  });

  return { ok: true, cancelledCount: toCancel.length, skippedCount: rows.length - toCancel.length };
}

function bulkDeleteRondeBatch(store, payload) {
  const { requesterRole, requesterUsername, entryIds, reason } = payload;
  store.ensureDataReaderRole(requesterRole);
  const reasonTrim = String(reason || "").trim();
  if (!reasonTrim) {
    store.fail("ronde:batch", "Le motif de suppression est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  }
  const ids = [...new Set((entryIds || []).map((x) => String(x).trim()).filter(Boolean))];
  const rows = ids.map((id) => store.db.prepare("SELECT * FROM ronde_entries WHERE id = ?").get(id));
  if (rows.some((r) => !r)) {
    store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  }
  assertCoherentExceptionalBatch(store, rows);

  const closedRows = rows.filter((r) => r.status === "CLOTURE");

  const isManager = requesterRole === "RESPONSABLE" || requesterRole === "DEV";
  if (!isManager) {
    for (const row of rows) {
      const creatorUsername = findRondeCreatorUsername(store, row);
      if (!creatorUsername || normalizeActorName(creatorUsername) !== normalizeActorName(requesterUsername)) {
        store.fail(
          "ronde:batch",
          "Suppression refusée : vous ne pouvez supprimer que vos propres créations.",
          "RONDE_BATCH_DELETE_FORBIDDEN_NOT_OWNER"
        );
      }
    }
  }

  const toDelete = rows.filter((r) => r.status !== "CLOTURE");

  /* Si le lot contient des clôturées, on coupe la programmation pour éviter toute recréation ultérieure. */
  let disabledProgrammingCount = 0;
  if (closedRows.length > 0) {
    const updateClosedSnapshot = store.db.prepare(
      "UPDATE ronde_entries SET request_planning_snapshot_json = ?, updated_at = ? WHERE id = ?"
    );
    const nowIso = new Date().toISOString();
    for (const row of closedRows) {
      const raw = String(row.request_planning_snapshot_json || "").trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        if (parsed.version !== 1) continue;
        if (parsed.createRoundsEnabled === false) continue;
        parsed.createRoundsEnabled = false;
        updateClosedSnapshot.run(JSON.stringify(parsed), nowIso, row.id);
        disabledProgrammingCount += 1;
      } catch {
        // Snapshot legacy/invalide: on conserve tel quel.
      }
    }
  }

  const removed = toDelete.map((r) => ({
    siteDisplay: r.site_display || "",
    requestDate: r.request_date || "",
    status: r.status || ""
  }));

  const del = store.db.prepare("DELETE FROM ronde_entries WHERE id = ?");
  for (const row of toDelete) {
    del.run(row.id);
  }

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "RONDE_BATCH_DELETE",
    details: {
      reason: reasonTrim,
      deletedCount: toDelete.length,
      preservedClosedCount: closedRows.length,
      disabledProgrammingCount,
      deleted: removed,
      preservedClosedIds: closedRows.map((r) => r.id)
    }
  });

  return {
    ok: true,
    deletedCount: toDelete.length,
    skippedCount: closedRows.length
  };
}

module.exports = {
  mapRondeRow,
  listRondes,
  autoCloseExpiredExceptionalRondes,
  createRonde,
  updateRonde,
  setRondeStatus,
  updateRondeBatchSharedFields,
  bulkCancelRondeBatch,
  bulkDeleteRondeBatch
};
