const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NIGHT_TRANSITION_LIMIT_MINUTES = 6 * 60;

function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(String(value || "").trim());
}

function isIsoTime(value: string): boolean {
  return ISO_TIME_RE.test(String(value || "").trim());
}

function addDaysToIsoDate(dateIso: string, days: number): string {
  const base = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateIso;
  base.setDate(base.getDate() + days);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMinutes(timeIso: string): number {
  const [h, m] = String(timeIso || "").split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

function isNightRoundKind(kind: string | null | undefined): boolean {
  const normalized = String(kind || "").trim().toUpperCase();
  return normalized === "RANDOM_NIGHT";
}

export function computeRondeLogicalDate(params: {
  requestDate: string;
  plannedRoundKind?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  preferredDate?: string | null;
}): { logicalDate: string; autoLogicalDate: string; shiftedAfterMidnight: boolean } {
  const requestDate = String(params.requestDate || "").trim();
  if (!isIsoDate(requestDate)) {
    return { logicalDate: "", autoLogicalDate: "", shiftedAfterMidnight: false };
  }

  const preferredDate = String(params.preferredDate || "").trim();
  const isNightRound = isNightRoundKind(params.plannedRoundKind);
  let autoLogicalDate = requestDate;
  let shiftedAfterMidnight = false;

  if (isNightRound) {
    const arrivalTime = String(params.arrivalTime || "").trim();
    const departureTime = String(params.departureTime || "").trim();
    const referenceTime = isIsoTime(arrivalTime) ? arrivalTime : isIsoTime(departureTime) ? departureTime : "";
    const referenceMinutes = referenceTime ? toMinutes(referenceTime) : -1;
    if (referenceMinutes >= 0 && referenceMinutes < NIGHT_TRANSITION_LIMIT_MINUTES) {
      autoLogicalDate = addDaysToIsoDate(requestDate, 1);
      shiftedAfterMidnight = true;
    }
  }

  const logicalDate = isIsoDate(preferredDate) ? preferredDate : autoLogicalDate;
  return {
    logicalDate,
    autoLogicalDate,
    shiftedAfterMidnight: shiftedAfterMidnight || logicalDate !== requestDate
  };
}
