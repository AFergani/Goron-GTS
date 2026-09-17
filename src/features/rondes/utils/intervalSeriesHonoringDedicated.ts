/**
 * Façade TypeScript du noyau unique d’horaires de ronde.
 *
 * Implémentation : `electron/store/domains/ronde/slotTimeKernel.js` (même code UI + Electron).
 */

import * as slotTimeKernelModule from "../../../../electron/store/domains/ronde/slotTimeKernel.js";
import type { DedicatedRondeAnchor, RandomWindowSlot } from "../../../../electron/store/domains/ronde/slotTimeKernel.js";

export type {
  DedicatedRondeKind,
  DedicatedRondeAnchor,
  RandomWindowSlot
} from "../../../../electron/store/domains/ronde/slotTimeKernel.js";

const kernel =
  (slotTimeKernelModule as { default?: typeof slotTimeKernelModule }).default ?? slotTimeKernelModule;

export const MAX_HONORED_RANDOM_SLOTS = kernel.MAX_HONORED_RANDOM_SLOTS;

/**
 * Horaires d’une fenêtre RANDOM (ancre + début/fin), hors jetons jour/nuit sans heure.
 */
export function generateRandomWindowSlots(params: {
  anchorDateIso: string;
  windowStart: string;
  windowEnd: string;
  intervalMinutes: number | null;
  roundsCount: number | null;
  dedicated: DedicatedRondeAnchor[];
}): RandomWindowSlot[] {
  return kernel.generateRandomWindowSlots(params);
}

/**
 * Libellé récap si une fermeture / ouverture a déformé la série aléatoire.
 */
export function intervalHonorRecapNote(dedicated: DedicatedRondeAnchor[], seriesEnabled: boolean): string {
  return kernel.intervalHonorRecapNote(dedicated, seriesEnabled);
}
