/**
 * Moteur de génération des passages pour rondes exceptionnelles (snapshot planification v1).
 *
 * Produit la liste des créneaux date+heure attendus depuis `RondePlanningSnapshotV1` (lignes,
 * intervalles, aléatoires jour/nuit, fériés). Utilisé par `ronde.js` pour resynchroniser un lot
 * (`buildDesiredExceptionalSlotList`, multiset add/consume, clés `horaires_demande_obs`).
 * Logique alignée avec le générateur frontend (modale demande ronde).
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const RANDOM_PERIOD_DAY = 1;
const RANDOM_PERIOD_NIGHT = 2;
const MAX_RANDOM_SLOTS = 48;

function formatLocalDateIso(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function addDaysIso(dateIso, deltaDays) {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDateIso(d);
}

function dateIsoToWeekdayMask(dateIso) {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const day = d.getDay();
  const idxFromMon = day === 0 ? 6 : day - 1;
  return 1 << idxFromMon;
}

function hhmmToMinutes(time) {
  const value = String(time || "").trim();
  if (!TIME_RE.test(value)) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutesAsTime(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isWeekdayEnabled(weekdaysMask, dateIso) {
  const m = Number(weekdaysMask);
  if (!Number.isFinite(m) || m <= 0) return true;
  return (m & dateIsoToWeekdayMask(dateIso)) !== 0;
}

function enumerateDatesInclusive(startIso, endIso) {
  const out = [];
  let cursor = String(startIso || "").trim();
  const lim = String(endIso || "").trim();
  while (cursor <= lim) {
    out.push(cursor);
    cursor = addDaysIso(cursor, 1);
    if (out.length > 5000) break;
  }
  return out;
}

function holidayMatcherFromSet(dateIsoSet) {
  return {
    isHoliday: (iso) => dateIsoSet.has(String(iso || "").trim()),
    isHolidayEve: (iso) => dateIsoSet.has(addDaysIso(String(iso || "").trim(), 1))
  };
}

function buildIntervalTimesAcrossValidity(startIso, startTime, endIso, endTime, intervalMinutes, anchor) {
  const safeInterval = Math.max(1, Math.round(intervalMinutes));
  const startTrim = String(startIso || "").trim();
  const startTimeTrim = TIME_RE.test(String(startTime || "").trim()) ? String(startTime).trim() : "00:00";
  const endTrim = String(endIso || "").trim();
  const endTimeTrim = TIME_RE.test(String(endTime || "").trim()) ? String(endTime).trim() : "23:59";
  const anchorDate = anchor?.demandDateIso?.trim();
  const anchorTime = anchor?.demandTimeHm?.trim();
  const useAnchor = Boolean(
    anchorDate && anchorDate === startTrim && anchorTime && TIME_RE.test(anchorTime)
  );
  const periodStartCandidate = useAnchor
    ? new Date(`${startTrim}T${anchorTime}:00`)
    : new Date(`${startTrim}T${startTimeTrim}:00`);
  let periodStartMs = periodStartCandidate.getTime();
  if (Number.isNaN(periodStartMs)) {
    periodStartMs = new Date(`${startTrim}T${startTimeTrim}:00`).getTime();
  }
  const periodStart = new Date(periodStartMs);
  const periodEnd = new Date(`${endTrim}T${endTimeTrim}:00`);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return [];
  }
  const out = [];
  const cursor = new Date(periodStart.getTime());
  let safety = 0;
  while (cursor <= periodEnd && safety < 2000) {
    out.push({
      requestDate: formatLocalDateIso(cursor),
      requestedTime: `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`
    });
    cursor.setMinutes(cursor.getMinutes() + safeInterval);
    safety += 1;
  }
  return out;
}

function parseDateTimeSafeMs(dateIso, hhmm) {
  const d = new Date(`${String(dateIso || "").trim()}T${String(hhmm || "").trim()}:00`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function timeToMinutes(t) {
  const m = TIME_RE.exec(String(t || "").trim());
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(String(t).slice(3, 5));
  return h * 60 + min;
}

function minutesToHHMM(total) {
  const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function windowCrossesMidnight(startHHMM, endHHMM) {
  return timeToMinutes(endHHMM) <= timeToMinutes(startHHMM);
}

function parseLocalDateTime(dateIso, hhmm) {
  return new Date(`${dateIso}T${hhmm}:00`);
}

function pickEmittedRandomKind(lineRandomPeriodMask, minutesFromMidnight) {
  const raw = lineRandomPeriodMask;
  const mask =
    raw == null || !Number.isFinite(Number(raw)) ? 3 : Math.min(3, Math.max(1, Math.round(Number(raw))));
  if (mask === RANDOM_PERIOD_DAY) return "RANDOM_DAY";
  if (mask === RANDOM_PERIOD_NIGHT) return "RANDOM_NIGHT";
  const h = minutesFromMidnight / 60;
  const isDay = h >= 6 && h < 18;
  return isDay ? "RANDOM_DAY" : "RANDOM_NIGHT";
}

/**
 * Adaptation de generateRandomSlotSpecs (snapshot : pas de champ randomPeriodMask par ligne —
 * on prend jour+nuit comme le frontend via RANDOM_PERIOD_DAY | NIGHT.)
 */
function generateRandomSlotSpecsFromLine(lineRef, anchorDateIso) {
  const ws = String(lineRef.randomWindowStart || "").trim();
  const we = String(lineRef.randomWindowEnd || "").trim();
  const lineId = lineRef.id || "rand-line";

  if (!TIME_RE.test(ws) || !TIME_RE.test(we)) {
    const mask =
      lineRef.randomPeriodMask == null || !Number.isFinite(Number(lineRef.randomPeriodMask))
        ? 3
        : Math.min(3, Math.max(1, Math.round(Number(lineRef.randomPeriodMask))));
    const out = [];
    let idx = 0;
    if (mask & RANDOM_PERIOD_DAY) {
      out.push({
        profileLineId: lineId,
        slotIndex: idx,
        calendarDateIso: anchorDateIso,
        requestedTime: null
      });
      idx += 1;
    }
    if (mask & RANDOM_PERIOD_NIGHT) {
      out.push({
        profileLineId: lineId,
        slotIndex: idx,
        calendarDateIso: anchorDateIso,
        requestedTime: null
      });
    }
    return out;
  }

  const crosses = windowCrossesMidnight(ws, we);
  const startM = timeToMinutes(ws);
  const endM = timeToMinutes(we);
  const span = crosses ? 24 * 60 - startM + endM : Math.max(0, endM - startM);

  const intervalMinutes =
    lineRef.intervalMinutes != null && Number.isFinite(Number(lineRef.intervalMinutes)) && Number(lineRef.intervalMinutes) >= 1
      ? Math.min(100080, Math.round(Number(lineRef.intervalMinutes)))
      : null;

  let rounds =
    lineRef.randomRoundsCount != null &&
    Number.isFinite(Number(lineRef.randomRoundsCount)) &&
    Number(lineRef.randomRoundsCount) >= 1
      ? Math.min(MAX_RANDOM_SLOTS, Math.round(Number(lineRef.randomRoundsCount)))
      : null;

  let count = 1;
  if (intervalMinutes != null && intervalMinutes >= 1 && span > 0) {
    count = Math.floor(span / intervalMinutes) + 1;
    count = Math.min(MAX_RANDOM_SLOTS, Math.max(1, count));
  } else if (rounds != null) {
    count = rounds;
  }

  let offsets;
  if (count === 1) {
    offsets = [0];
  } else {
    offsets = [];
    for (let i = 0; i < count; i += 1) {
      offsets.push(Math.round((i * span) / (count - 1)));
    }
  }

  const out = [];
  let slotIndex = 0;
  for (const off of offsets) {
    const startMs = parseLocalDateTime(anchorDateIso, ws).getTime();
    const t = new Date(startMs + off * 60 * 1000);
    if (Number.isNaN(t.getTime())) continue;
    const time = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    const calendarDateIso = crosses
      ? anchorDateIso
      : (() => {
          const y = t.getFullYear();
          const mo = String(t.getMonth() + 1).padStart(2, "0");
          const da = String(t.getDate()).padStart(2, "0");
          return `${y}-${mo}-${da}`;
        })();
    const minutesFromMidnight = t.getHours() * 60 + t.getMinutes();
    const roundKind = pickEmittedRandomKind(lineRef.randomPeriodMask, minutesFromMidnight);
    out.push({
      profileLineId: lineRef.id || lineId,
      slotIndex,
      calendarDateIso,
      requestedTime: time,
      roundKind /* pour alignement potentiel diagnostics */
    });
    slotIndex += 1;
  }
  /* span <= 0 : un créneau min */
  if (span <= 0 && out.length === 0) {
    const t0 = new Date(`${anchorDateIso}T${ws}:00`);
    const time = `${String(t0.getHours()).padStart(2, "0")}:${String(t0.getMinutes()).padStart(2, "0")}`;
    const minutesFromMidnight = t0.getHours() * 60 + t0.getMinutes();
    const roundKind = pickEmittedRandomKind(lineRef.randomPeriodMask, minutesFromMidnight);
    return [
      {
        profileLineId: lineRef.id || lineId,
        slotIndex: 0,
        slotKey: `${lineId}:0`,
        roundKind,
        requestedTime: time,
        calendarDateIso: anchorDateIso
      }
    ];
  }

  return out;
}

function lineAppliesOnDate(ln, dayIso, holidayMatch) {
  if (isWeekdayEnabled(ln.weekdaysMask, dayIso)) return true;
  if (ln.includeHolidays && holidayMatch.isHoliday(dayIso)) return true;
  if (ln.includeHolidayEves && holidayMatch.isHolidayEve(dayIso)) return true;
  return false;
}

/** Clé canonique passage : dateISO|heure (peut être vide pour aléatoire sans creneau fixe à l'écran ancien flux). */
function exceptionalPlanningSlotKey(requestDate, requestedTime) {
  return `${String(requestDate || "").trim()}|${String(requestedTime || "").trim()}`;
}

/** Extrait depuis horaires_demande_obs (formats issus création automatique ou fallback hh:mm dans le texte). */
function extractSlotKeyFromRondeObservation(requestDateIso, obs) {
  const o = String(obs || "");
  const m = /Heure demandée:\s*([01]\d|2[0-3]):([0-5]\d)/.exec(o);
  if (m) return exceptionalPlanningSlotKey(requestDateIso, `${m[1]}:${m[2]}`);
  const any = /(^|\s)([01]\d|2[0-3]):([0-5]\d)(\s|$)/.exec(o);
  if (any) return exceptionalPlanningSlotKey(requestDateIso, `${any[2]}:${any[3]}`);
  return exceptionalPlanningSlotKey(requestDateIso, "");
}

/**
 * Calcule tous les passages attendus sur la plage de validité du snapshot.
 *
 * @param {object|null} snapshot - `version: 1`, validFrom/To, lignes (types ronde planifiée).
 * @param {Set<string>} holidayDateIsoSet - Dates `data_holidays`.
 * @returns {Array<{ requestDate: string, requestedTime: string }>}
 */
function buildDesiredExceptionalSlotList(snapshot, holidayDateIsoSet) {
  if (!snapshot || snapshot.version !== 1) return [];
  const rangeEndIso = snapshot.validTo && String(snapshot.validTo).trim() ? String(snapshot.validTo).trim() : String(snapshot.validFrom || "").trim();
  const safeFrom = String(snapshot.validFrom || "").trim();
  if (!safeFrom || !rangeEndIso || rangeEndIso < safeFrom) return [];
  const validFromTimeNorm = TIME_RE.test(String(snapshot.validFromTime || "").trim())
    ? String(snapshot.validFromTime).trim()
    : "00:00";
  const validToTimeNorm = TIME_RE.test(String(snapshot.validToTime || "").trim())
    ? String(snapshot.validToTime).trim()
    : "23:59";
  const validityStartMs = parseDateTimeSafeMs(safeFrom, validFromTimeNorm);
  const validityEndMs = parseDateTimeSafeMs(rangeEndIso, validToTimeNorm);
  if (validityStartMs == null || validityEndMs == null || validityEndMs < validityStartMs) return [];

  const dateAnchors = enumerateDatesInclusive(safeFrom, rangeEndIso);
  const items = [];
  const motifTypeId = String(snapshot.motifTypeId || "").trim(); /* même signature que ligne ref attendue par generateRandom */
  void motifTypeId;

  const hm = holidayMatcherFromSet(holidayDateIsoSet);
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const pushIfInValidity = (arr, requestDateIso, requestedTimeHm) => {
    const timeNorm = TIME_RE.test(String(requestedTimeHm || "").trim()) ? String(requestedTimeHm).trim() : "00:00";
    const ms = parseDateTimeSafeMs(requestDateIso, timeNorm);
    if (ms == null || ms < validityStartMs || ms > validityEndMs) return;
    arr.push({ requestDate: requestDateIso, requestedTime: requestedTimeHm });
  };

  const requestDateStr = String(snapshot.requestDate || "").trim();
  const requestTimeRaw = TIME_RE.test(String(snapshot.requestTime || "").trim())
    ? String(snapshot.requestTime).trim()
    : "00:00";

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex] || {};
    const rk = raw.roundKind || "OPENING";
    const ln = {
      roundKind: rk === "OPENING" || rk === "CLOSING" || rk === "ACCOMPAGNEMENT" || rk === "RANDOM" ? rk : "RANDOM",
      requestedTime: String(raw.requestedTime ?? ""),
      randomWindowStart: String(raw.randomWindowStart ?? ""),
      randomWindowEnd: String(raw.randomWindowEnd ?? ""),
      randomRoundsCount: String(raw.randomRoundsCount ?? ""),
      intervalHours: String(raw.intervalHours ?? ""),
      intervalEndTime: String(raw.intervalEndTime ?? "").trim() || "23:59",
      weekdaysMask: typeof raw.weekdaysMask === "number" ? raw.weekdaysMask : Number(raw.weekdaysMask) || 0,
      includeHolidays: Boolean(raw.includeHolidays),
      includeHolidayEves: Boolean(raw.includeHolidayEves),
      /** id stable pour RNG */
      id: `snap-line-${lineIndex}`
    };

    if (ln.roundKind !== "RANDOM") {
      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
        pushIfInValidity(items, dayIso, ln.requestedTime.trim());
      }
      continue;
    }

    const intervalMinutes = ln.intervalHours.trim()
      ? Math.max(1, Math.round(Number(ln.intervalHours) * 60))
      : null;
    const roundsCount = ln.randomRoundsCount.trim()
      ? Math.max(1, Math.round(Number(ln.randomRoundsCount)))
      : null;

    const hasCompleteWindow = Boolean(ln.randomWindowStart.trim() && ln.randomWindowEnd.trim());

    if (hasCompleteWindow) {
      const lineRefRandom = {
        id: ln.id,
        randomWindowStart: ln.randomWindowStart.trim(),
        randomWindowEnd: ln.randomWindowEnd.trim(),
        intervalMinutes,
        randomRoundsCount: roundsCount,
        randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT
      };

      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
        const specs = generateRandomSlotSpecsFromLine(lineRefRandom, dayIso);
        for (const spec of specs) {
          pushIfInValidity(items, spec.calendarDateIso, spec.requestedTime != null ? spec.requestedTime : "");
        }
      }
      continue;
    }

    if (intervalMinutes != null) {
      const endTime = ln.intervalEndTime.trim() || "23:59";
      const intervalAnchor =
        requestDateStr === safeFrom ? { demandDateIso: requestDateStr, demandTimeHm: requestTimeRaw } : null;
      const intervalSlots = buildIntervalTimesAcrossValidity(
        safeFrom,
        validFromTimeNorm,
        rangeEndIso,
        validToTimeNorm,
        intervalMinutes,
        intervalAnchor
      );
      for (const slot of intervalSlots) {
        if (!lineAppliesOnDate(ln, slot.requestDate, hm)) continue;
        pushIfInValidity(items, slot.requestDate, slot.requestedTime);
      }
      continue;
    }

    if (roundsCount != null) {
      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
        const maxMinute =
          dayIso === rangeEndIso && ln.intervalEndTime.trim()
            ? hhmmToMinutes(ln.intervalEndTime.trim())
            : 23 * 60 + 59;
        const span = Math.max(0, maxMinute);
        for (let i = 0; i < roundsCount; i += 1) {
          const minute = roundsCount <= 1 ? 0 : Math.round((i * span) / (roundsCount - 1));
          pushIfInValidity(items, dayIso, formatMinutesAsTime(minute));
        }
      }
      continue;
    }

    for (const dayIso of dateAnchors) {
      if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
      pushIfInValidity(items, dayIso, "");
    }
  }

  return items;
}

/**
 * Décrémente le compteur d'une clé passage (resync lot vs fiches existantes).
 *
 * @param {Map<string, number>} mapObj
 * @param {string} slotKeyStr - Format `date|heure` via `exceptionalPlanningSlotKey`.
 * @returns {boolean} `true` si la clé existait avec compteur > 0.
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
