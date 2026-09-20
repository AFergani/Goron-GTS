/**
 * Moteur d’alignement demande / Validité Du (demande ≤ début de validité).
 */

import * as alignRequestValidityModule from "../../../../electron/store/core/alignRequestValidity.js";

const engine =
  (alignRequestValidityModule as { default?: typeof alignRequestValidityModule }).default ??
  alignRequestValidityModule;

export type RequestValidityRange = {
  requestDate: string;
  requestTime: string;
  validFromDate: string;
  validFromTime: string;
  validToDate: string;
  validToTime: string;
};

export type AlignRequestValidityOptions = {
  /** Comparer date+heure. `false` = date seule (planification libre gardiennage). */
  validityHasTime?: boolean;
  /** Corriger l’heure de fin si Au < Du. */
  compareEndTimes?: boolean;
};

type DateTimeParts = { date: string; time: string };

export function applyRequestDateTimeChange(
  state: RequestValidityRange,
  nextRequest: DateTimeParts,
  opts?: AlignRequestValidityOptions
): RequestValidityRange {
  return engine.applyRequestDateTimeChange(state, nextRequest, opts) as RequestValidityRange;
}

export function applyValidFromDateTimeChange(
  state: RequestValidityRange,
  nextFrom: { date: string; time?: string },
  opts?: AlignRequestValidityOptions
): RequestValidityRange {
  return engine.applyValidFromDateTimeChange(state, nextFrom, opts) as RequestValidityRange;
}

export function floorValidityStartToRequest(
  state: RequestValidityRange,
  opts?: AlignRequestValidityOptions
): RequestValidityRange {
  return engine.floorValidityStartToRequest(state, opts) as RequestValidityRange;
}
