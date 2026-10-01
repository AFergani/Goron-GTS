/**
 * Journal de consigne / client / planification pour les rondes.
 *
 * Les profils contractuels stockent le texte rendu dans `notes`.
 * Les rondes exceptionnelles stockent les entrées dans le snapshot.
 */

import {
  appendActivityEntry,
  appendRenderedActivityLine,
  isRenderedActivityJournal,
  normalizeActivityJournal,
  renderActivityJournal,
  type ActivityJournalEntry
} from "../../common/model/activityJournal";
import type { LineDraft } from "../model/rondeRequestLineDraft";

export function rondeDraftPlanningSignature(input: {
  validFrom: string;
  validFromTime: string;
  validTo: string;
  validToTime: string;
  isSingleDay: boolean;
  lines: LineDraft[];
}): string {
  return JSON.stringify({
    validFrom: input.validFrom.trim(),
    validFromTime: input.validFromTime,
    validTo: input.validTo.trim(),
    validToTime: input.validToTime,
    isSingleDay: input.isSingleDay,
    lines: input.lines.map((line) => ({
      roundKind: line.roundKind,
      requestedTime: line.requestedTime,
      randomWindowStart: line.randomWindowStart,
      randomWindowEnd: line.randomWindowEnd,
      randomRoundsCount: line.randomRoundsCount,
      intervalHours: line.intervalHours,
      intervalEndTime: line.intervalEndTime,
      weekdaysMask: line.weekdaysMask,
      includeHolidays: line.includeHolidays,
      includeHolidayEves: line.includeHolidayEves
    }))
  });
}

type ApplyRondeJournalInput = {
  mode: "create" | "update";
  previousEntries?: unknown;
  previousPlainConsigne?: string;
  previousNotes?: string;
  previousClient?: string;
  nextClient?: string;
  planningChanged: boolean;
  /** Phrase « Ancien flux : … => Nouveau flux : … », vide si la planification est inchangée. */
  planningFluxChange?: string;
  draft: string;
  actor: string;
  at: string;
  trackClient: boolean;
  /** `notes` : profil contractuel. `entries` : snapshot exceptionnel. */
  storeAs: "notes" | "entries";
};

export type AppliedRondeJournal = {
  entries: ActivityJournalEntry[];
  historyText: string;
  consigne: string;
  error: string | null;
};

export function applyRondeActivityJournal(input: ApplyRondeJournalInput): AppliedRondeJournal {
  const draft = String(input.draft || "").trim();
  const actor = String(input.actor || "").trim() || "Utilisateur";
  const at = input.at || new Date().toISOString();
  const previousPlain = String(input.previousPlainConsigne || "").trim();
  const previousClient = String(input.previousClient || "").trim();
  const nextClient = String(input.nextClient || "").trim();
  if (input.planningChanged && draft.length < 5) {
    return {
      entries: [],
      historyText: "",
      consigne: previousPlain,
      error: "Indiquez pourquoi la planification change (5 caractères minimum)."
    };
  }
  if (input.storeAs === "notes") {
    return applyNotesJournal({ ...input, draft, actor, at, previousPlain });
  }
  if (input.mode === "create") {
    let entries = appendActivityEntry([], { at, actor, kind: "CONSIGNE_INITIALE", text: draft });
    if (input.trackClient) {
      entries = appendActivityEntry(entries, {
        at,
        actor,
        kind: "CLIENT_INITIAL",
        text: nextClient || "Télésurveillance"
      });
    }
    return { entries, historyText: renderActivityJournal(entries), consigne: draft, error: null };
  }
  let entries = normalizeActivityJournal(input.previousEntries);
  if (!entries.length && previousPlain && !isRenderedActivityJournal(previousPlain)) {
    entries = appendActivityEntry(entries, {
      at,
      actor: "Création",
      kind: "CONSIGNE_INITIALE",
      text: previousPlain
    });
  }
  const hasClientLine = entries.some((entry) => entry.kind === "CLIENT_INITIAL" || entry.kind === "CLIENT_UPDATE");
  if (input.trackClient && previousClient && !hasClientLine) {
    entries = appendActivityEntry(entries, {
      at,
      actor: "Création",
      kind: "CLIENT_INITIAL",
      text: previousClient
    });
  }
  if (input.planningChanged) {
    entries = appendActivityEntry(entries, { at, actor, kind: "PLANNING_UPDATE", text: planningUpdateText(input.planningFluxChange, draft) });
  } else if (draft) {
    entries = appendActivityEntry(entries, { at, actor, kind: "CONSIGNE_UPDATE", text: draft });
  }
  if (input.trackClient && previousClient !== nextClient) {
    const from = previousClient || "Télésurveillance";
    const to = nextClient || "Télésurveillance";
    entries = appendActivityEntry(entries, { at, actor, kind: "CLIENT_UPDATE", text: `${from} → ${to}` });
  }
  const consigne = input.planningChanged ? previousPlain : (draft || previousPlain);
  return { entries, historyText: renderActivityJournal(entries), consigne, error: null };
}

function planningUpdateText(fluxChange: string | undefined, draft: string): string {
  const flux = String(fluxChange || "").trim();
  const motif = String(draft || "").trim();
  if (flux && motif) return `${flux} — ${motif}`;
  return flux || motif;
}

function applyNotesJournal(
  input: ApplyRondeJournalInput & { draft: string; actor: string; at: string; previousPlain: string }
): AppliedRondeJournal {
  const previousNotes = String(input.previousNotes || "").trim();
  if (input.mode === "create") {
    const entries = appendActivityEntry([], {
      at: input.at,
      actor: input.actor,
      kind: "CONSIGNE_INITIALE",
      text: input.draft
    });
    return {
      entries,
      historyText: renderActivityJournal(entries),
      consigne: input.draft,
      error: null
    };
  }
  if (!input.planningChanged && !input.draft) {
    return { entries: [], historyText: previousNotes, consigne: input.previousPlain, error: null };
  }
  const base = isRenderedActivityJournal(previousNotes)
    ? previousNotes
    : previousNotes
      ? renderActivityJournal([
        {
          at: input.at,
          actor: "Création",
          kind: "CONSIGNE_INITIALE",
          text: previousNotes
        }
      ])
      : "";
  const historyText = appendRenderedActivityLine(base, {
    at: input.at,
    actor: input.actor,
    kind: input.planningChanged ? "PLANNING_UPDATE" : base ? "CONSIGNE_UPDATE" : "CONSIGNE_INITIALE",
    text: input.planningChanged ? planningUpdateText(input.planningFluxChange, input.draft) : input.draft
  });
  const consigne = input.planningChanged ? input.previousPlain : (input.draft || input.previousPlain);
  return { entries: [], historyText, consigne, error: null };
}
