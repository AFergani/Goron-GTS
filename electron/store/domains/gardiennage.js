/**
 * Domaine gardiennage : CRUD `gardiennage_entries`, planification par snapshot (v1), lots `planning_batch_id`.
 *
 * Moteur de créneaux : `gardiennagePlannerEngine.js` ; clôture automatique : `gardiennageAutoClose.js`.
 * Horizon glissant H24 ouvert : `gardiennageOpenEndedHorizon.js` (avant clôture auto).
 * Modes : demande simple (récurrence / ponctuel) ou génération multi-créneaux depuis `planningSnapshot`.
 * Statuts : PLANIFIE, ACTIF, CLOTURE, ANNULE. Écritures audit via `writeAudit` (before/after selon l'action).
 * Liste : prolongation H24 ouvert puis `autoCloseExpiredGardiennageEntries`.
 */

const { writeAudit } = require("../core/audit");
const { generateEntityId } = require("../core/ids");
const { autoCloseExpiredGardiennageEntries } = require("./gardiennageAutoClose");
const {
  computeOpenEndedHorizonEndDate,
  extendOpenEndedGardiennageHorizons
} = require("./gardiennageOpenEndedHorizon");
const {
  buildGardiennageSlotsFromSnapshot,
  collectActiveDatesForLine,
  buildHolidayMatchers
} = require("./gardiennagePlannerEngine");

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

function toIsoTime(value) {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return "";
}

function parseTimeToMinutes(value) {
  const hhmm = toIsoTime(value);
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isIsoDate(value) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)));
}

function shiftIsoDate(isoDate, amount) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

function loadHolidayDateIsos(store) {
  return store.db
    .prepare("SELECT date_iso FROM data_holidays ORDER BY date_iso ASC")
    .all()
    .map((row) => String(row.date_iso || "").trim())
    .filter(Boolean);
}

function validatePlanningLinesNoOverlap(snapshot, holidayDateIsos) {
  if (!snapshot || snapshot.isContinuous) return;
  const holiday = buildHolidayMatchers(holidayDateIsos);
  const anchoredStartDates = new Set(
    (snapshot.lines || [])
      .map((line) => (isIsoDate(line.anchorDate) ? line.anchorDate : ""))
      .filter((value) => Boolean(value))
  );
  const daySegments = {};
  const pushDaySegment = (isoDate, segment) => {
    if (!daySegments[isoDate]) daySegments[isoDate] = [];
    daySegments[isoDate].push(segment);
  };
  for (const line of snapshot.lines || []) {
    const start = parseTimeToMinutes(line.startTime);
    const end = parseTimeToMinutes(line.endTime);
    if (start < 0 || end < 0) continue;
    const activeDates = collectActiveDatesForLine(
      line,
      snapshot.validFromDate,
      snapshot.validToDate,
      anchoredStartDates,
      holiday
    );
    for (const activeDate of activeDates) {
      if (end > start) {
        pushDaySegment(activeDate, { start, end });
      } else if (end < start) {
        pushDaySegment(activeDate, { start, end: 24 * 60 });
        pushDaySegment(shiftIsoDate(activeDate, 1), { start: 0, end });
      } else {
        pushDaySegment(activeDate, { start: 0, end: 24 * 60 });
      }
    }
  }
  for (const isoDate of Object.keys(daySegments)) {
    const segments = daySegments[isoDate].sort((a, b) => a.start - b.start);
    for (let i = 1; i < segments.length; i += 1) {
      const prev = segments[i - 1];
      const current = segments[i];
      // Continuité autorisée (start === end), chevauchement interdit (start < end).
      if (current.start < prev.end) {
        const err = new Error("Chevauchement détecté entre lignes de planification.");
        err.code = "GARDIENNAGE_PLANNER_OVERLAP";
        throw err;
      }
    }
  }
}

function mapRow(row) {
  const snapshotRaw = String(row.planning_snapshot_json || "").trim();
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    crossesMidnight: Boolean(row.crosses_midnight),
    recurrenceStartDate: row.recurrence_start_date || "",
    recurrenceEndDate: row.recurrence_end_date || "",
    isPonctuel: Boolean(row.is_ponctuel),
    intervenantId: row.intervenant_id || null,
    intervenantName: row.intervenant_name || "",
    notes: row.notes || "",
    status: row.status || "PLANIFIE",
    linkedInterventionId: row.intervention_id || null,
    linkedRondeId: row.linked_ronde_id || null,
    closureReport: row.closure_report || "",
    actualStartTime: row.actual_start_time || "",
    actualEndTime: row.actual_end_time || "",
    workOrderNumber: row.work_order_number || "",
    cancellationReason: row.cancellation_reason || "",
    planningBatchId: row.planning_batch_id || null,
    planningSlotStart: row.planning_slot_start || "",
    planningSlotEnd: row.planning_slot_end || "",
    planningSnapshot: snapshotRaw ? (() => {
      try { return JSON.parse(snapshotRaw); } catch { return null; }
    })() : null
  };
}

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

function findGardiennageCreatorUsername(store, row) {
  const batchId = String(row.planning_batch_id || "").trim();
  if (batchId) {
    const logs = store.db
      .prepare(
        `SELECT actor_username, details_json
         FROM audit_logs
         WHERE action = 'GARDIENNAGE_BATCH_CREATE'
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
       WHERE action = 'GARDIENNAGE_CREATE'
       ORDER BY datetime(occurred_at) DESC
       LIMIT 200`
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

function addDaysIso(isoDate, amount) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isPonctuelPlanningSnapshot(snapshot) {
  if (!snapshot || snapshot.isContinuous) return false;
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  return lines.length === 1 && lines[0]?.id === "ponctuel-slot";
}

function slotConflictsWithClosedRow(slot, closedRow) {
  const closedStart = String(closedRow.planning_slot_start || "").trim();
  const closedEnd = String(closedRow.planning_slot_end || "").trim();
  if (closedStart && closedEnd) {
    return slot.startIso < closedEnd && closedStart < slot.endIso;
  }
  return (
    String(closedRow.recurrence_start_date || "") === slot.startDate &&
    String(closedRow.start_time || "") === slot.startTime &&
    String(closedRow.end_time || "") === slot.endTime
  );
}

function filterSlotsPreservingClosed(generatedSlots, closedRows) {
  if (!closedRows.length) return generatedSlots;
  return generatedSlots.filter((slot) => !closedRows.some((row) => slotConflictsWithClosedRow(slot, row)));
}

function normalizePlanningSnapshot(payload) {
  const snap = payload.planningSnapshot;
  if (!snap || Number(snap.version) !== 1) return null;
  const validFromDate = toIsoDate(snap.validFromDate);
  if (!validFromDate) return null;
  const validFromTime = toIsoTime(snap.validFromTime);
  if (!validFromTime) return null;
  const isContinuous = Boolean(snap.isContinuous);
  let validToTime = toIsoTime(snap.validToTime);
  if (!validToTime && isContinuous) {
    validToTime = validFromTime;
  }
  if (!validToTime) return null;
  const isOpenEnded = Boolean(snap.isOpenEnded);
  let validToDate = toIsoDate(snap.validToDate);
  if (!validToDate && isOpenEnded) {
    validToDate = computeOpenEndedHorizonEndDate(validFromDate);
  }
  if (!validToDate) return null;
  return {
    version: 1,
    validFromDate,
    validFromTime,
    validToDate,
    validToTime,
    isContinuous: Boolean(snap.isContinuous),
    isOpenEnded,
    lines: Array.isArray(snap.lines) ? snap.lines
      .map((line, index) => ({
        id: String(line.id || `line-${index + 1}`),
        label: String(line.label || `Ligne ${index + 1}`),
        anchorDate: toIsoDate(line.anchorDate) || "",
        startTime: toIsoTime(line.startTime),
        endTime: toIsoTime(line.endTime),
        weekdaysMask: Number.isFinite(Number(line.weekdaysMask)) ? Number(line.weekdaysMask) : 127,
        includeHolidays: Boolean(line.includeHolidays),
        includeHolidayEves: Boolean(line.includeHolidayEves)
      }))
      .filter((line) => line.startTime && line.endTime)
      : []
  };
}

function insertGardiennageRow(store, rowPayload) {
  store.db
    .prepare(
      `INSERT INTO gardiennage_entries (
        id, site_id, site_display, start_time, end_time, crosses_midnight,
        recurrence_start_date, recurrence_end_date, recurrence_days, is_ponctuel,
        intervenant_id, intervenant_name, notes, status,
        intervention_id, linked_ronde_id,
        closure_report, actual_start_time, actual_end_time, work_order_number, cancellation_reason,
        planning_batch_id, planning_snapshot_json, planning_slot_start, planning_slot_end,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      rowPayload.id,
      rowPayload.siteId || null,
      rowPayload.siteDisplay,
      rowPayload.startTime,
      rowPayload.endTime,
      rowPayload.crossesMidnight ? 1 : 0,
      rowPayload.recurrenceStartDate,
      rowPayload.recurrenceEndDate,
      127, rowPayload.isPonctuel ? 1 : 0,
      rowPayload.intervenantId || null,
      rowPayload.intervenantName,
      rowPayload.notes,
      rowPayload.status || "PLANIFIE",
      rowPayload.linkedInterventionId || null,
      rowPayload.linkedRondeId || null,
      rowPayload.closureReport || "",
      rowPayload.actualStartTime || "",
      rowPayload.actualEndTime || "",
      rowPayload.workOrderNumber || "",
      rowPayload.cancellationReason || "",
      rowPayload.planningBatchId || null,
      rowPayload.planningSnapshotJson || null,
      rowPayload.planningSlotStart || "",
      rowPayload.planningSlotEnd || "",
      rowPayload.createdAt,
      rowPayload.updatedAt
    );
}

/** Liste toutes les entrées (reader) après passage auto-clôture des expirées. */
function listGardiennages(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  extendOpenEndedGardiennageHorizons(store);
  autoCloseExpiredGardiennageEntries(store);
  const rows = store.db
    .prepare(
      `SELECT * FROM gardiennage_entries
       ORDER BY recurrence_start_date DESC, start_time ASC`
    )
    .all();
  return rows.map(mapRow);
}

/**
 * Crée une entrée ou un lot planifié (audit `GARDIENNAGE_CREATE` ou `GARDIENNAGE_BATCH_CREATE`).
 * Valide chevauchements de lignes et génère les créneaux si snapshot présent.
 */
function createGardiennage(store, payload) {
  const { requesterRole, requesterUsername, id } = payload;
  store.ensureDataReaderRole(requesterRole);

  const startTime = toIsoTime(payload.startTime);
  const endTime = toIsoTime(payload.endTime);
  if (!startTime || !endTime) {
    store.fail("gardiennage:create", "Les horaires de début et de fin sont obligatoires.", "GARDIENNAGE_TIME_REQUIRED");
  }
  const recurrenceStartDate = toIsoDate(payload.recurrenceStartDate);
  if (!recurrenceStartDate) {
    store.fail("gardiennage:create", "La date de début est obligatoire.", "GARDIENNAGE_DATE_REQUIRED");
  }

  const crossesMidnight = endTime < startTime;
  const recurrenceEndDate = payload.isPonctuel ? recurrenceStartDate : (toIsoDate(payload.recurrenceEndDate) || "");
  const isPonctuel = Boolean(payload.isPonctuel);
  const now = new Date().toISOString();
  const planningSnapshot = normalizePlanningSnapshot(payload);
  const holidayDateIsos = loadHolidayDateIsos(store);
  try {
    validatePlanningLinesNoOverlap(planningSnapshot, holidayDateIsos);
  } catch (error) {
    store.fail("gardiennage:create", error.message, error.code || "GARDIENNAGE_PLANNER_OVERLAP");
  }
  const planningBatchId = planningSnapshot ? id : null;
  const planningSnapshotJson = planningSnapshot ? JSON.stringify(planningSnapshot) : null;
  const generatedSlots = planningSnapshot
    ? buildGardiennageSlotsFromSnapshot(planningSnapshot, { holidayDateIsos })
    : [];

  if (planningSnapshot && generatedSlots.length === 0) {
    store.fail("gardiennage:create", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
  }

  if (planningSnapshot) {
    generatedSlots.forEach((slot, index) => {
      insertGardiennageRow(store, {
        id: index === 0 ? id : generateEntityId(),
        siteId: payload.siteId || null,
        siteDisplay: String(payload.siteDisplay || "").trim(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        crossesMidnight: slot.crossesMidnight,
        recurrenceStartDate: slot.startDate,
        recurrenceEndDate: planningSnapshot.isOpenEnded ? "" : slot.endDate,
        isPonctuel: isPonctuelPlanningSnapshot(planningSnapshot),
        intervenantId: payload.intervenantId || null,
        intervenantName: String(payload.intervenantName || "").trim(),
        notes: String(payload.notes || "").trim(),
        linkedInterventionId: payload.linkedInterventionId || null,
        linkedRondeId: payload.linkedRondeId || null,
        planningBatchId,
        planningSnapshotJson,
        planningSlotStart: slot.startIso,
        planningSlotEnd: slot.endIso,
        createdAt: now,
        updatedAt: now
      });
    });
  } else {
    insertGardiennageRow(store, {
      id,
      siteId: payload.siteId || null,
      siteDisplay: String(payload.siteDisplay || "").trim(),
      startTime,
      endTime,
      crossesMidnight,
      recurrenceStartDate,
      recurrenceEndDate,
      isPonctuel,
      intervenantId: payload.intervenantId || null,
      intervenantName: String(payload.intervenantName || "").trim(),
      notes: String(payload.notes || "").trim(),
      linkedInterventionId: payload.linkedInterventionId || null,
      linkedRondeId: payload.linkedRondeId || null,
      createdAt: now,
      updatedAt: now
    });
  }

  if (planningSnapshot) {
    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_BATCH_CREATE",
      status: "SUCCESS",
      details: {
        batchId: planningBatchId,
        total: generatedSlots.length,
        success: generatedSlots.length,
        failed: 0,
        siteDisplay: payload.siteDisplay,
        validFrom: planningSnapshot.validFromDate,
        validTo: planningSnapshot.validToDate,
        isContinuous: Boolean(planningSnapshot.isContinuous),
        linesCount: Array.isArray(planningSnapshot.lines) ? planningSnapshot.lines.length : 0,
        linkedInterventionId: payload.linkedInterventionId || null,
        linkedRondeId: payload.linkedRondeId || null
      }
    });
  } else {
    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_CREATE",
      status: "SUCCESS",
      details: {
        id,
        siteDisplay: payload.siteDisplay,
        startTime, endTime, crossesMidnight,
        recurrenceStartDate, recurrenceEndDate, isPonctuel,
        linkedInterventionId: payload.linkedInterventionId || null,
        linkedRondeId: payload.linkedRondeId || null
      }
    });
  }

  return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id));
}

/**
 * Met à jour une demande (manager, contrôle `expectedUpdatedAt`).
 * Peut régénérer tout le lot planifié (suppression des non clôturées + réinsertion).
 */
function updateGardiennage(store, payload) {
  const { requesterRole, requesterUsername, id, expectedUpdatedAt } = payload;
  store.ensureDataManagerRole(requesterRole);

  const existing = store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id);
  if (!existing) store.fail("gardiennage:update", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
  if (existing.updated_at !== expectedUpdatedAt) {
    store.fail("gardiennage:update", "Ce gardiennage a été modifié par un autre utilisateur.", "GARDIENNAGE_CONFLICT");
  }

  const startTime = toIsoTime(payload.startTime);
  const endTime = toIsoTime(payload.endTime);
  const crossesMidnight = startTime && endTime ? endTime < startTime : false;
  const recurrenceStartDate = toIsoDate(payload.recurrenceStartDate);
  const recurrenceEndDate = payload.isPonctuel ? recurrenceStartDate : (toIsoDate(payload.recurrenceEndDate) || "");
  const isPonctuel = Boolean(payload.isPonctuel);
  const now = new Date().toISOString();
  const planningSnapshot = normalizePlanningSnapshot(payload);
  const holidayDateIsos = loadHolidayDateIsos(store);
  try {
    validatePlanningLinesNoOverlap(planningSnapshot, holidayDateIsos);
  } catch (error) {
    store.fail("gardiennage:update", error.message, error.code || "GARDIENNAGE_PLANNER_OVERLAP");
  }
  const planningSnapshotJson = planningSnapshot ? JSON.stringify(planningSnapshot) : null;
  const existingBatchId = existing.planning_batch_id || existing.id;

  if (planningSnapshot) {
    const generatedSlots = buildGardiennageSlotsFromSnapshot(planningSnapshot, { holidayDateIsos });
    if (!generatedSlots.length) {
      store.fail("gardiennage:update", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
    }
    const closedRows = store.db
      .prepare("SELECT * FROM gardiennage_entries WHERE (planning_batch_id = ? OR id = ?) AND status = 'CLOTURE'")
      .all(existingBatchId, id);
    const slotsToInsert = filterSlotsPreservingClosed(generatedSlots, closedRows);
    if (!slotsToInsert.length && !closedRows.length) {
      store.fail("gardiennage:update", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
    }
    store.db
      .prepare("DELETE FROM gardiennage_entries WHERE (planning_batch_id = ? OR id = ?) AND status <> 'CLOTURE'")
      .run(existingBatchId, id);
    let assignAnchorId = true;
    slotsToInsert.forEach((slot) => {
      insertGardiennageRow(store, {
        id: assignAnchorId ? id : generateEntityId(),
        siteId: payload.siteId || null,
        siteDisplay: String(payload.siteDisplay || "").trim(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        crossesMidnight: slot.crossesMidnight,
        recurrenceStartDate: slot.startDate,
        recurrenceEndDate: planningSnapshot.isOpenEnded ? "" : slot.endDate,
        isPonctuel: isPonctuelPlanningSnapshot(planningSnapshot),
        intervenantId: payload.intervenantId || null,
        intervenantName: String(payload.intervenantName || "").trim(),
        notes: String(payload.notes || "").trim(),
        linkedInterventionId: payload.linkedInterventionId || null,
        linkedRondeId: payload.linkedRondeId || null,
        planningBatchId: existingBatchId,
        planningSnapshotJson,
        planningSlotStart: slot.startIso,
        planningSlotEnd: slot.endIso,
        createdAt: now,
        updatedAt: now
      });
      assignAnchorId = false;
    });
    closedRows.forEach((row) => {
      store.db
        .prepare(
          `UPDATE gardiennage_entries
           SET site_id = ?, site_display = ?, intervenant_id = ?, intervenant_name = ?, notes = ?,
               intervention_id = ?, linked_ronde_id = ?, planning_snapshot_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          payload.siteId || null,
          String(payload.siteDisplay || "").trim(),
          payload.intervenantId || null,
          String(payload.intervenantName || "").trim(),
          String(payload.notes || "").trim(),
          payload.linkedInterventionId || null,
          payload.linkedRondeId || null,
          planningSnapshotJson,
          now,
          row.id
        );
    });
    const returnId = slotsToInsert.length ? id : (closedRows.find((row) => row.id === id)?.id || closedRows[0]?.id || id);
    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_UPDATE",
      status: "SUCCESS",
      details: {
        id: returnId,
        before: { siteDisplay: existing.site_display, startTime: existing.start_time, endTime: existing.end_time },
        after: {
          siteDisplay: payload.siteDisplay,
          startTime,
          endTime,
          planner: { batchId: existingBatchId, generated: true, inserted: slotsToInsert.length, preservedClosed: closedRows.length }
        }
      }
    });
    return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(returnId));
  } else {
    store.db
      .prepare(
        `UPDATE gardiennage_entries SET
          site_id = ?, site_display = ?,
          start_time = ?, end_time = ?, crosses_midnight = ?,
          recurrence_start_date = ?, recurrence_end_date = ?, is_ponctuel = ?,
          intervenant_id = ?, intervenant_name = ?, notes = ?,
          intervention_id = ?, linked_ronde_id = ?,
          planning_batch_id = NULL, planning_snapshot_json = NULL, planning_slot_start = '', planning_slot_end = '',
          updated_at = ?
         WHERE id = ?`
      )
      .run(
        payload.siteId || null,
        String(payload.siteDisplay || "").trim(),
        startTime, endTime, crossesMidnight ? 1 : 0,
        recurrenceStartDate, recurrenceEndDate, isPonctuel ? 1 : 0,
        payload.intervenantId || null,
        String(payload.intervenantName || "").trim(),
        String(payload.notes || "").trim(),
        payload.linkedInterventionId || null,
        payload.linkedRondeId || null,
        now, id
      );
  }

  writeAudit(store.db, {
    actorUsername: requesterUsername,
    action: "GARDIENNAGE_UPDATE",
    status: "SUCCESS",
    details: {
      id,
      before: { siteDisplay: existing.site_display, startTime: existing.start_time, endTime: existing.end_time },
      after: {
        siteDisplay: payload.siteDisplay,
        startTime,
        endTime,
        planner: planningSnapshot ? { batchId: existingBatchId, generated: true } : { generated: false }
      }
    }
  });

  return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id));
}

/** Change le statut ; annulation d'un lot propage `ANNULE` sur les créneaux non clôturés du batch. */
function setGardiennageStatus(store, payload) {
  const { requesterRole, requesterUsername, id, expectedUpdatedAt, status, cancellationReason } = payload;
  store.ensureDataReaderRole(requesterRole);

  const existing = store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id);
  if (!existing) store.fail("gardiennage:setStatus", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
  if (existing.updated_at !== expectedUpdatedAt) {
    store.fail("gardiennage:setStatus", "Ce gardiennage a été modifié. Veuillez recharger.", "GARDIENNAGE_CONFLICT");
  }

  const VALID_STATUSES = ["PLANIFIE", "ACTIF", "CLOTURE", "ANNULE"];
  if (!VALID_STATUSES.includes(status)) {
    store.fail("gardiennage:setStatus", "Statut invalide.", "GARDIENNAGE_STATUS_INVALID");
  }
  if (status === "ANNULE" && !String(cancellationReason || "").trim()) {
    store.fail("gardiennage:setStatus", "Un motif d'annulation est obligatoire.", "GARDIENNAGE_CANCEL_REASON_REQUIRED");
  }

  const batchId = String(existing.planning_batch_id || "").trim();
  if (status === "ANNULE" && batchId) {
    const now = new Date().toISOString();
    const reason = String(cancellationReason || "").trim();
    const rows = store.db.prepare("SELECT * FROM gardiennage_entries WHERE planning_batch_id = ?").all(batchId);
    const toCancel = rows.filter((row) => String(row.status || "") !== "CLOTURE");
    const alreadyClosed = rows.filter((row) => String(row.status || "") === "CLOTURE");
    const stmt = store.db.prepare(
      "UPDATE gardiennage_entries SET status = 'ANNULE', cancellation_reason = ?, updated_at = ? WHERE id = ?"
    );
    for (const row of toCancel) {
      stmt.run(reason, now, row.id);
    }
    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_BATCH_CANCEL",
      status: "SUCCESS",
      details: {
        id,
        batchId,
        reason,
        cancelledCount: toCancel.length,
        preservedClosedCount: alreadyClosed.length
      }
    });
    return {
      ...mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id)),
      batchOperation: {
        type: "CANCEL",
        isBatch: true,
        cancelledCount: toCancel.length,
        preservedClosedCount: alreadyClosed.length
      }
    };
  }

  const now = new Date().toISOString();
  store.db
    .prepare(
      "UPDATE gardiennage_entries SET status = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?"
    )
    .run(status, status === "ANNULE" ? String(cancellationReason || "").trim() : (existing.cancellation_reason || ""), now, id);

  const actionMap = {
    PLANIFIE: "GARDIENNAGE_STATUS_PLANIFIE",
    ACTIF: "GARDIENNAGE_STATUS_ACTIF",
    CLOTURE: "GARDIENNAGE_STATUS_CLOTURE",
    ANNULE: "GARDIENNAGE_STATUS_ANNULE"
  };

  writeAudit(store.db, {
    actorUsername: requesterUsername,
    action: actionMap[status] || "GARDIENNAGE_STATUS_CHANGE",
    status: "SUCCESS",
    details: {
      id,
      before: existing.status,
      after: status,
      ...(status === "ANNULE" ? { cancellationReason: String(cancellationReason || "").trim() } : {})
    }
  });

  return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id));
}

/**
 * Clôture avec compte rendu et horaires réels ; gère clôture d'un jour sur série récurrente.
 */
function closeGardiennage(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    closureReport,
    actualStartTime,
    actualEndTime,
    workOrderNumber,
    closeDate
  } = payload;
  store.ensureDataReaderRole(requesterRole);

  const existing = store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id);
  if (!existing) store.fail("gardiennage:close", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
  if (existing.updated_at !== expectedUpdatedAt) {
    store.fail("gardiennage:close", "Ce gardiennage a été modifié. Veuillez recharger.", "GARDIENNAGE_CONFLICT");
  }
  if (existing.status === "ANNULE") {
    store.fail("gardiennage:close", "Un gardiennage annulé ne peut pas être clôturé.", "GARDIENNAGE_STATUS_INVALID");
  }

  const now = new Date().toISOString();
  const targetCloseDate = toIsoDate(closeDate) || now.slice(0, 10);
  const currentStart = String(existing.recurrence_start_date || "");
  const currentEnd = String(existing.recurrence_end_date || "");
  const inRange =
    targetCloseDate >= currentStart &&
    (!currentEnd || targetCloseDate <= currentEnd);
  const nextDay = (() => {
    const d = new Date(`${targetCloseDate}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  /* Série récurrente : clôture de la journée ciblée uniquement
     (la planification continue ensuite). */
  if (!existing.is_ponctuel && inRange) {
    const shouldCloseWholeSeries = currentEnd && targetCloseDate >= currentEnd;
    const nextStatus = shouldCloseWholeSeries ? "CLOTURE" : "PLANIFIE";
    const nextStartDate = shouldCloseWholeSeries ? currentStart : (nextDay > currentStart ? nextDay : currentStart);
    store.db
      .prepare(
        `UPDATE gardiennage_entries
         SET status = ?,
             recurrence_start_date = ?,
             closure_report = ?,
             actual_start_time = ?,
             actual_end_time = ?,
             work_order_number = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextStatus,
        nextStartDate,
        String(closureReport || "").trim(),
        toIsoTime(actualStartTime) || "",
        toIsoTime(actualEndTime) || "",
        String(workOrderNumber || "").trim(),
        now,
        id
      );

    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_STATUS_CLOTURE",
      status: "SUCCESS",
      details: {
        id,
        siteDisplay: existing.site_display,
        closeDate: targetCloseDate,
        singleDayClose: true,
        nextSeriesStartDate: nextStartDate,
        statusAfterClose: nextStatus
      }
    });
    return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id));
  }

  const newEndDate = existing.is_ponctuel
    ? (existing.recurrence_end_date || "")
    : (!existing.recurrence_end_date || existing.recurrence_end_date > targetCloseDate ? targetCloseDate : existing.recurrence_end_date);

  store.db
    .prepare(
      `UPDATE gardiennage_entries
       SET status = 'CLOTURE',
           recurrence_end_date = ?,
           closure_report = ?,
           actual_start_time = ?,
           actual_end_time = ?,
           work_order_number = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .run(
      newEndDate,
      String(closureReport || "").trim(),
      toIsoTime(actualStartTime) || "",
      toIsoTime(actualEndTime) || "",
      String(workOrderNumber || "").trim(),
      now, id
    );

  writeAudit(store.db, {
    actorUsername: requesterUsername,
    action: "GARDIENNAGE_STATUS_CLOTURE",
    status: "SUCCESS",
    details: {
      id,
      siteDisplay: existing.site_display,
      closeDate: targetCloseDate,
      closureReport: String(closureReport || "").trim() || null,
      actualStartTime: toIsoTime(actualStartTime) || null,
      actualEndTime: toIsoTime(actualEndTime) || null,
      workOrderNumber: String(workOrderNumber || "").trim() || null
    }
  });

  return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id));
}

/** Rouvre un gardiennage clôturé ou annulé (retour à PLANIFIE, effacement champs de clôture). */
function reopenGardiennage(store, payload) {
  const { requesterRole, requesterUsername, id, expectedUpdatedAt } = payload;
  store.ensureDataReaderRole(requesterRole);

  const existing = store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id);
  if (!existing) store.fail("gardiennage:reopen", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
  if (existing.updated_at !== expectedUpdatedAt) {
    store.fail("gardiennage:reopen", "Ce gardiennage a été modifié. Veuillez recharger.", "GARDIENNAGE_CONFLICT");
  }
  if (existing.status !== "CLOTURE" && existing.status !== "ANNULE") {
    store.fail("gardiennage:reopen", "Seul un gardiennage annulé ou clôturé peut être rouvert.", "GARDIENNAGE_STATUS_INVALID");
  }

  const now = new Date().toISOString();
  const previousStatus = String(existing.status || "");
  store.db
    .prepare(
      `UPDATE gardiennage_entries
       SET status = 'PLANIFIE',
           closure_report = '',
           actual_start_time = '',
           actual_end_time = '',
           work_order_number = '',
           cancellation_reason = '',
           updated_at = ?
       WHERE id = ?`
    )
    .run(now, id);

  writeAudit(store.db, {
    actorUsername: requesterUsername,
    action: "GARDIENNAGE_REOPEN",
    status: "SUCCESS",
    details: {
      id,
      siteDisplay: existing.site_display,
      before: {
        status: previousStatus,
        cancellationReason: existing.cancellation_reason || "",
        closureReport: existing.closure_report || ""
      },
      after: {
        status: "PLANIFIE",
        cancellationReason: "",
        closureReport: ""
      }
    }
  });

  return mapRow(store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id));
}

/**
 * Supprime entrée ou lot (hors lignes CLOTURE). Opérateur : uniquement ses créations (audit CREATE/BATCH_CREATE).
 */
function deleteGardiennage(store, payload) {
  const { requesterRole, requesterUsername, id, reason } = payload;
  store.ensureDataReaderRole(requesterRole);

  const existing = store.db.prepare("SELECT * FROM gardiennage_entries WHERE id = ?").get(id);
  if (!existing) store.fail("gardiennage:delete", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");

  const batchId = String(existing.planning_batch_id || "").trim();
  const scopeRows = batchId
    ? store.db.prepare("SELECT * FROM gardiennage_entries WHERE planning_batch_id = ?").all(batchId)
    : [existing];
  const toDeleteRows = scopeRows.filter((row) => String(row.status || "") !== "CLOTURE");
  const preservedClosedRows = scopeRows.filter((row) => String(row.status || "") === "CLOTURE");
  if (toDeleteRows.length === 0) {
    store.fail("gardiennage:delete", "Aucune entrée supprimable dans ce lot.", "GARDIENNAGE_DELETE_NOTHING_TO_DELETE");
  }

  const isManager = requesterRole === "RESPONSABLE" || requesterRole === "DEV";
  if (!isManager) {
    for (const row of toDeleteRows) {
      const creatorUsername = findGardiennageCreatorUsername(store, row);
      if (!creatorUsername || normalizeActorName(creatorUsername) !== normalizeActorName(requesterUsername)) {
        store.fail(
          "gardiennage:delete",
          "Suppression refusée : vous ne pouvez supprimer que vos propres créations.",
          "GARDIENNAGE_DELETE_FORBIDDEN_NOT_OWNER"
        );
      }
    }
  }

  if (batchId) {
    store.db.prepare("DELETE FROM gardiennage_entries WHERE planning_batch_id = ? AND status <> 'CLOTURE'").run(batchId);
  } else {
    store.db.prepare("DELETE FROM gardiennage_entries WHERE id = ?").run(id);
  }

  writeAudit(store.db, {
    actorUsername: requesterUsername,
    action: batchId ? "GARDIENNAGE_BATCH_DELETE" : "GARDIENNAGE_DELETE",
    status: "SUCCESS",
    details: {
      id,
      batchId: batchId || null,
      deletedCount: toDeleteRows.length,
      preservedClosedCount: preservedClosedRows.length,
      siteDisplay: existing.site_display,
      startTime: existing.start_time,
      endTime: existing.end_time,
      reason: reason || ""
    }
  });

  return {
    success: true,
    batchId: batchId || null,
    deletedCount: toDeleteRows.length,
    preservedClosedCount: preservedClosedRows.length
  };
}

module.exports = {
  listGardiennages,
  extendOpenEndedGardiennageHorizons,
  /** Réexport — voir `gardiennageAutoClose.js`. */
  autoCloseExpiredGardiennageEntries,
  createGardiennage,
  updateGardiennage,
  setGardiennageStatus,
  closeGardiennage,
  reopenGardiennage,
  deleteGardiennage
};
