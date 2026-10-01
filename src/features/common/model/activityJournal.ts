/**
 * Journal d'activité partagé (gardiennage, rondes contractuelles et exceptionnelles).
 *
 * Le moteur est `electron/store/core/activityJournal.js`.
 */

// Le moteur est en CommonJS ; Vite le réécrit en ESM pour l'interface.
// @ts-expect-error pas de déclaration de module pour le fichier Electron
import * as activityJournalModule from "../../../../electron/store/core/activityJournal.js";

const engine =
  (activityJournalModule as { default?: typeof activityJournalModule }).default ?? activityJournalModule;

export type ActivityJournalKind =
  | "CONSIGNE_INITIALE"
  | "CONSIGNE_UPDATE"
  | "CLIENT_INITIAL"
  | "CLIENT_UPDATE"
  | "PLANNING_UPDATE"
  | "ANNULATION_REQUEST"
  | "ANNULATION"
  | "ANNULATION_REJECTED";

export type ActivityJournalEntry = {
  at: string;
  actor: string;
  kind: ActivityJournalKind | string;
  text: string;
};

type JournalEngine = {
  appendActivityEntry: (journal: unknown, entry: ActivityJournalEntry) => ActivityJournalEntry[];
  appendRenderedActivityLine: (history: string, entry: ActivityJournalEntry) => string;
  gardiennagePlanningSignature: (snapshot: object | null | undefined) => string;
  normalizeActivityJournal: (raw: unknown) => ActivityJournalEntry[];
  renderActivityJournal: (journal: unknown) => string;
  seedActivityJournal: (
    journal: unknown,
    seed: { notes?: string; clientName?: string; at: string; actor: string }
  ) => ActivityJournalEntry[];
};

const journal = engine as JournalEngine;

export function normalizeActivityJournal(raw: unknown): ActivityJournalEntry[] {
  return journal.normalizeActivityJournal(raw);
}

export function renderActivityJournal(raw: unknown): string {
  return journal.renderActivityJournal(raw);
}

export function appendActivityEntry(journalEntries: unknown, entry: ActivityJournalEntry): ActivityJournalEntry[] {
  return journal.appendActivityEntry(journalEntries, entry);
}

export function appendRenderedActivityLine(history: string, entry: ActivityJournalEntry): string {
  return journal.appendRenderedActivityLine(history, entry);
}

export function gardiennagePlanningSignature(snapshot: object | null | undefined): string {
  return journal.gardiennagePlanningSignature(snapshot);
}

export function seedActivityJournal(
  journalEntries: unknown,
  seed: { notes?: string; clientName?: string; at: string; actor: string }
): ActivityJournalEntry[] {
  return journal.seedActivityJournal(journalEntries, seed);
}

const RENDERED_JOURNAL_MARK = /(?:Consigne initiale|Modification d'une consigne|Client initial|Modification du client|Modification de la planification|Demande d'annulation|Annulation)/;

export function isRenderedActivityJournal(text: string): boolean {
  const value = String(text || "");
  return value.includes("\n---\n") || RENDERED_JOURNAL_MARK.test(value);
}

/** Affiche un texte déjà journalisé, ou une consigne ancienne comme ligne initiale. */
export function displayActivityHistory(
  text: string,
  seed?: { at: string; actor: string }
): string {
  const clean = String(text || "").trim();
  if (!clean) return "";
  if (isRenderedActivityJournal(clean)) return clean;
  return renderActivityJournal([
    {
      at: seed?.at || new Date().toISOString(),
      actor: seed?.actor || "Création",
      kind: "CONSIGNE_INITIALE",
      text: clean
    }
  ]);
}
