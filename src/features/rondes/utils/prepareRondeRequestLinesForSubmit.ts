/**
 * Applique le masque jour unique / plage courte sur les lignes avant submit.
 */

import type { LineDraft } from "../model/rondeRequestLineDraft";
import { resolveSubmitWeekdayMask } from "./resolveValidityWeekdayLock";

export function prepareRondeRequestLinesForSubmit(
  lines: LineDraft[],
  opts: { isSingleDay: boolean; validFrom: string; effectiveValidTo: string }
): LineDraft[] {
  const mask = resolveSubmitWeekdayMask(opts);
  if (!mask) return lines;
  return lines.map((line) => ({
    ...line,
    weekdaysMask: mask || line.weekdaysMask
  }));
}
