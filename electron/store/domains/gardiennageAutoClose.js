/**
 * Clôture automatique des gardiennages dont l'horaire de fin est dépassé.
 *
 * Appelé avant `listGardiennages`, par timer dans `electron/main.js` et via `UserStore`.
 * Reprend la logique de `closeGardiennage` (série récurrente vs ponctuel) avec compte rendu système fixe.
 * Audit agrégé `GARDIENNAGE_AUTO_CLOSE_BATCH` si au moins une fiche est clôturée.
 */

const { writeAudit } = require("../core/audit");

/** Libellé enregistré en compte rendu de clôture (sans justification terrain). */
const GARDIENNAGE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";
const GARDIENNAGE_AUTO_CLOSE_ACTOR = "system:gardiennage-auto-close";

/**
 * @param {unknown} value
 * @returns {string}
 */
function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toIsoTime(value) {
  const raw = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return "";
}

/**
 * @param {string} isoDate - `AAAA-MM-JJ`
 * @param {number} amount - Jours à ajouter.
 * @returns {string}
 */
function shiftIsoDate(isoDate, amount) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

/**
 * Instant de fin de prestation (ms) pour décider si la clôture auto s'applique.
 * Priorité à `planning_slot_end`, sinon date active + `end_time` (+ lendemain si `crosses_midnight`).
 *
 * @param {object} row - Ligne `gardiennage_entries`.
 * @returns {number|null}
 */
function isOpenEndedContinuousRow(row) {
  const raw = String(row.planning_snapshot_json || "").trim();
  if (!raw) return false;
  try {
    const snap = JSON.parse(raw);
    return Boolean(snap?.isOpenEnded && snap?.isContinuous);
  } catch {
    return false;
  }
}

function resolveSlotEndMs(row) {
  const slotEndRaw = String(row.planning_slot_end || "").trim();
  if (slotEndRaw) {
    const iso = slotEndRaw.length === 16 ? `${slotEndRaw}:00` : slotEndRaw;
    const ts = new Date(iso).getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  const activeDate = toIsoDate(row.recurrence_start_date);
  const endTime = toIsoTime(row.end_time);
  if (!activeDate || !endTime) return null;

  const endDate = row.crosses_midnight ? shiftIsoDate(activeDate, 1) : activeDate;
  const ts = new Date(`${endDate}T${endTime}:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Applique la clôture automatique sur une ligne (aligné sur `closeGardiennage`).
 *
 * @param {import('../userStore')} store
 * @param {object} row
 * @param {string} nowIso
 * @returns {boolean} `false` si date de début invalide.
 */
function applyAutoCloseRow(store, row, nowIso) {
  const targetCloseDate = toIsoDate(row.recurrence_start_date);
  if (!targetCloseDate) return false;

  const currentStart = String(row.recurrence_start_date || "");
  const currentEnd = String(row.recurrence_end_date || "");
  const inRange =
    targetCloseDate >= currentStart &&
    (!currentEnd || targetCloseDate <= currentEnd);
  const nextDay = shiftIsoDate(targetCloseDate, 1);

  if (!row.is_ponctuel && inRange) {
    const shouldCloseWholeSeries = currentEnd && targetCloseDate >= currentEnd;
    const nextStatus = shouldCloseWholeSeries ? "CLOTURE" : "PLANIFIE";
    const nextStartDate = shouldCloseWholeSeries
      ? currentStart
      : (nextDay > currentStart ? nextDay : currentStart);
    store.db
      .prepare(
        `UPDATE gardiennage_entries
         SET status = ?,
             recurrence_start_date = ?,
             closure_report = ?,
             actual_start_time = '',
             actual_end_time = '',
             work_order_number = '',
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextStatus,
        nextStartDate,
        GARDIENNAGE_AUTO_CLOSURE_REPORT,
        nowIso,
        row.id
      );
    return true;
  }

  const newEndDate = row.is_ponctuel
    ? (row.recurrence_end_date || "")
    : (!row.recurrence_end_date || row.recurrence_end_date > targetCloseDate
        ? targetCloseDate
        : row.recurrence_end_date);

  store.db
    .prepare(
      `UPDATE gardiennage_entries
       SET status = 'CLOTURE',
           recurrence_end_date = ?,
           closure_report = ?,
           actual_start_time = '',
           actual_end_time = '',
           work_order_number = '',
           updated_at = ?
       WHERE id = ?`
    )
    .run(newEndDate, GARDIENNAGE_AUTO_CLOSURE_REPORT, nowIso, row.id);

  return true;
}

/**
 * Clôture les fiches `PLANIFIE` ou `ACTIF` dont l'horaire de fin est dépassé.
 *
 * @param {import('../userStore')} store
 * @param {object} [options]
 * @param {string} [options.requesterUsername="system:gardiennage-auto-close"] - Acteur de l'audit batch.
 * @returns {{ closedCount: number, closedIds: string[] }}
 */
function autoCloseExpiredGardiennageEntries(store, { requesterUsername = GARDIENNAGE_AUTO_CLOSE_ACTOR } = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const rows = store.db
    .prepare("SELECT * FROM gardiennage_entries WHERE status IN ('PLANIFIE', 'ACTIF')")
    .all();

  const closedIds = [];
  const closedSamples = [];

  for (const row of rows) {
    if (isOpenEndedContinuousRow(row)) continue;
    const endMs = resolveSlotEndMs(row);
    if (endMs == null || nowMs < endMs) continue;
    if (!applyAutoCloseRow(store, row, nowIso)) continue;
    closedIds.push(row.id);
    if (closedSamples.length < 20) {
      closedSamples.push({
        id: row.id,
        siteDisplay: row.site_display || "",
        recurrenceStartDate: row.recurrence_start_date || "",
        endTime: row.end_time || ""
      });
    }
  }

  if (closedIds.length > 0) {
    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_AUTO_CLOSE_BATCH",
      status: "SUCCESS",
      details: {
        total: closedIds.length,
        success: closedIds.length,
        failed: 0,
        closureReport: GARDIENNAGE_AUTO_CLOSURE_REPORT,
        samples: closedSamples
      }
    });
  }

  return { closedCount: closedIds.length, closedIds };
}

module.exports = {
  autoCloseExpiredGardiennageEntries
};
