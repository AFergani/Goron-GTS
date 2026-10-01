/**
 * Journal d'activité horodaté (consigne, client, planification).
 *
 * Même forme que les observations de la main courante : une ligne par événement,
 * séparées par `---`. Partagé par le gardiennage et les rondes.
 *
 * @module electron/store/core/activityJournal
 */

const KIND_LABELS = {
  CONSIGNE_INITIALE: "Consigne initiale",
  CONSIGNE_UPDATE: "Modification d'une consigne",
  CLIENT_INITIAL: "Client initial",
  CLIENT_UPDATE: "Modification du client",
  PLANNING_UPDATE: "Modification de la planification",
  ANNULATION_REQUEST: "Demande d'annulation",
  ANNULATION: "Annulation",
  ANNULATION_REJECTED: "Refus d'annulation"
};

/**
 * @param {string} iso
 * @returns {string}
 */
function formatActivityStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * @param {unknown} raw
 * @returns {Array<{ at: string, actor: string, kind: string, text: string }>}
 */
function normalizeActivityJournal(raw) {
  if (!Array.isArray(raw)) return [];
  const entries = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const text = String(item.text || "").trim();
    const kind = String(item.kind || "").trim();
    const at = String(item.at || "").trim();
    const actor = String(item.actor || "").trim();
    if (!text || !kind || !at || !actor) continue;
    entries.push({ at, actor, kind, text });
  }
  return entries;
}

/**
 * @param {{ at: string, actor: string, kind: string, text: string }} entry
 * @returns {string}
 */
function formatActivityLine(entry) {
  const label = KIND_LABELS[entry.kind] || entry.kind;
  const stamp = formatActivityStamp(entry.at);
  return `${stamp} : ${entry.actor} ${label} : ${entry.text}`;
}

/**
 * @param {unknown} journal
 * @returns {string}
 */
function renderActivityJournal(journal) {
  return normalizeActivityJournal(journal).map(formatActivityLine).join("\n---\n");
}

/**
 * @param {unknown} journal
 * @param {{ at: string, actor: string, kind: string, text: string }} entry
 * @returns {Array<{ at: string, actor: string, kind: string, text: string }>}
 */
function appendActivityEntry(journal, entry) {
  const text = String(entry?.text || "").trim();
  if (!text) return normalizeActivityJournal(journal);
  return [
    ...normalizeActivityJournal(journal),
    {
      at: String(entry.at || new Date().toISOString()),
      actor: String(entry.actor || "").trim() || "Utilisateur",
      kind: String(entry.kind || "").trim(),
      text
    }
  ];
}

/**
 * Ajoute une ligne au texte déjà rendu (profils ronde, où le journal tient dans `notes`).
 *
 * @param {string} history
 * @param {{ at: string, actor: string, kind: string, text: string }} entry
 * @returns {string}
 */
function appendRenderedActivityLine(history, entry) {
  const line = formatActivityLine({
    at: String(entry.at || new Date().toISOString()),
    actor: String(entry.actor || "").trim() || "Utilisateur",
    kind: String(entry.kind || ""),
    text: String(entry.text || "").trim()
  });
  if (!String(entry.text || "").trim() || !line.trim()) return String(history || "").trim();
  const base = String(history || "").trim();
  return base ? `${base}\n---\n${line}` : line;
}

/**
 * Empreinte de la planification gardiennage, hors journal et hors client.
 *
 * @param {object|null|undefined} snapshot
 * @returns {string}
 */
function gardiennagePlanningSignature(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  return JSON.stringify({
    validFromDate: String(snapshot.validFromDate || ""),
    validFromTime: String(snapshot.validFromTime || ""),
    validToDate: String(snapshot.validToDate || ""),
    validToTime: String(snapshot.validToTime || ""),
    userValidToDate: String(snapshot.userValidToDate || ""),
    isContinuous: Boolean(snapshot.isContinuous),
    isOpenEnded: Boolean(snapshot.isOpenEnded),
    lines: (Array.isArray(snapshot.lines) ? snapshot.lines : []).map((line) => ({
      anchorDate: String(line.anchorDate || ""),
      startTime: String(line.startTime || ""),
      endTime: String(line.endTime || ""),
      weekdaysMask: Number(line.weekdaysMask) || 0,
      includeHolidays: Boolean(line.includeHolidays),
      includeHolidayEves: Boolean(line.includeHolidayEves)
    }))
  });
}

/**
 * Complète un journal vide avec la consigne et le client déjà enregistrés.
 *
 * @param {unknown} journal
 * @param {{ notes?: string, clientName?: string, at: string, actor: string }} seed
 * @returns {Array<{ at: string, actor: string, kind: string, text: string }>}
 */
function seedActivityJournal(journal, seed) {
  let next = normalizeActivityJournal(journal);
  if (next.length) return next;
  next = appendActivityEntry(next, {
    at: seed.at,
    actor: seed.actor,
    kind: "CONSIGNE_INITIALE",
    text: seed.notes
  });
  next = appendActivityEntry(next, {
    at: seed.at,
    actor: seed.actor,
    kind: "CLIENT_INITIAL",
    text: seed.clientName
  });
  return next;
}

/**
 * Complète le journal d'un gardiennage à la création ou à la mise à jour.
 * La planification ne change pas sans un texte d'au moins 5 caractères.
 *
 * @param {object} input
 * @returns {{ journal: Array<{at:string,actor:string,kind:string,text:string}>|null, notes: string|null, error: {message:string,code:string}|null }}
 */
function evolveGardiennageJournal(input) {
  const text = String(input.addition || "").trim();
  const at = String(input.at || new Date().toISOString());
  const actor = String(input.actor || "").trim() || "Utilisateur";
  const nextClient = String(input.nextSnapshot?.clientName || "").trim();
  if (input.isCreate) {
    let journal = appendActivityEntry([], { at, actor, kind: "CONSIGNE_INITIALE", text });
    journal = appendActivityEntry(journal, {
      at,
      actor,
      kind: "CLIENT_INITIAL",
      text: nextClient || "Télésurveillance"
    });
    return { journal, notes: text, error: null };
  }
  const previousClient = String(input.previousSnapshot?.clientName || "").trim();
  const planningChanged = Boolean(input.previousSnapshot)
    && gardiennagePlanningSignature(input.previousSnapshot) !== gardiennagePlanningSignature(input.nextSnapshot);
  if (planningChanged && text.length < 5) {
    return {
      journal: null,
      notes: null,
      error: {
        message: "Indiquez pourquoi la planification change (5 caractères minimum).",
        code: "GARDIENNAGE_PLANNING_REASON_REQUIRED"
      }
    };
  }
  let journal = seedActivityJournal(input.previousSnapshot?.activityJournal, {
    notes: input.previousNotes,
    clientName: previousClient || "Télésurveillance",
    at: String(input.previousCreatedAt || at),
    actor: "Création"
  });
  if (planningChanged) {
    const fluxChange = String(input.planningFluxChange || "").trim();
    const planningText = fluxChange && text ? `${fluxChange} — ${text}` : (fluxChange || text);
    journal = appendActivityEntry(journal, { at, actor, kind: "PLANNING_UPDATE", text: planningText });
  } else if (text) {
    journal = appendActivityEntry(journal, { at, actor, kind: "CONSIGNE_UPDATE", text });
  }
  if (previousClient !== nextClient) {
    const from = previousClient || "Télésurveillance";
    const to = nextClient || "Télésurveillance";
    journal = appendActivityEntry(journal, { at, actor, kind: "CLIENT_UPDATE", text: `${from} → ${to}` });
  }
  const notes = planningChanged
    ? String(input.previousNotes || "").trim()
    : (text || String(input.previousNotes || "").trim());
  return { journal, notes, error: null };
}

module.exports = {
  KIND_LABELS,
  appendActivityEntry,
  appendRenderedActivityLine,
  formatActivityLine,
  formatActivityStamp,
  gardiennagePlanningSignature,
  evolveGardiennageJournal,
  normalizeActivityJournal,
  renderActivityJournal,
  seedActivityJournal
};
