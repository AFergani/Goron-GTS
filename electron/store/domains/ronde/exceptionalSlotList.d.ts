/**
 * Types de l’orchestrateur de lot exceptionnel (exceptionalSlotList.js).
 */

export type ExceptionalDesiredSlot = {
  requestDate: string;
  requestedTime: string;
  lineIndex: number;
};

export function buildDesiredExceptionalSlotList(
  snapshot: object | null,
  holidayDateIsoSet: Set<string> | string[]
): ExceptionalDesiredSlot[];
