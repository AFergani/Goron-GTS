/**
 * Onglet jour planifié : navigation calendrier, créneaux, demandes et exports du jour.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, RotateCcw } from "lucide-react";
import type { RondeMotifTypeRef, RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { HolidayRef, IntervenantRef } from "../../../types";
import {
  ApplicablePlannedSlot,
  buildApplicablePlannedSlots,
  formatPlannedRoundKindLabel,
  groupSlotsBySite
} from "../model/plannedSlots";
import { exportRondeEntryToWord } from "../export/rondeWordExport";

function formatTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDateRonde(iso: string, delta: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLongRonde(iso: string): string {
  if (!iso) return "";
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

function findPlannedEntryForSlot(
  entries: RondeEntry[],
  dateIso: string,
  slot: ApplicablePlannedSlot
): RondeEntry | undefined {
  return entries.find((e) => {
    if (e.source !== "PLANIFIE" || e.requestDate !== dateIso || e.siteId !== slot.siteId) return false;
    if (e.plannedProfileId !== slot.profileId || e.plannedRoundKind !== slot.roundKind) return false;
    if (slot.slotKey) {
      if (!e.plannedSlotKey) return false;
      return e.plannedSlotKey === slot.slotKey;
    }
    return !e.plannedSlotKey;
  });
}

function statusShort(entry: RondeEntry): string {
  if (entry.status === "CLOTURE") return "Clôturée";
  if (entry.status === "ANNULE") return "Annulée";
  return "En cours";
}

function hhmmToMinutes(value: string): number | null {
  const trimmed = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  const [hh, mm] = trimmed.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function extractRequestedTimeFromObs(obs: string): string | null {
  const match = String(obs || "").match(/Heure demandée:\s*([0-2]\d:[0-5]\d)/i);
  return match?.[1] ?? null;
}

function enumerateDatesInclusive(fromIso: string, toIso: string): string[] {
  if (!fromIso || !toIso || toIso < fromIso) return [];
  const out: string[] = [];
  const current = new Date(`${fromIso}T12:00:00`);
  const end = new Date(`${toIso}T12:00:00`);
  while (current.getTime() <= end.getTime()) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return out;
}

function logicalRoundTypeLabel(entry: RondeEntry): string {
  const snapshotLines = entry.requestPlanningSnapshot?.lines ?? [];
  const requestedTime = extractRequestedTimeFromObs(entry.horairesDemandeObs || "");

  if (requestedTime) {
    const opening = snapshotLines.some(
      (line) => line.roundKind === "OPENING" && String(line.requestedTime || "").trim() === requestedTime
    );
    if (opening) return "Ouverture";

    const closing = snapshotLines.some(
      (line) => line.roundKind === "CLOSING" && String(line.requestedTime || "").trim() === requestedTime
    );
    if (closing) return "Fermeture";

    const accompagnement = snapshotLines.some(
      (line) => line.roundKind === "ACCOMPAGNEMENT" && String(line.requestedTime || "").trim() === requestedTime
    );
    if (accompagnement) return "Accompagnement";
  }

  const randomLine = snapshotLines.find((line) => line.roundKind === "RANDOM");
  if (randomLine) {
    const start = hhmmToMinutes(randomLine.randomWindowStart || "");
    const end = hhmmToMinutes(randomLine.randomWindowEnd || "");
    if (start != null && end != null) {
      if (start < end) return "Aléatoire (jour)";
      if (start > end) return "Aléatoire (nuit)";
    }
    return "Aléatoire";
  }

  const obs = String(entry.horairesDemandeObs || "").toLowerCase();
  if (obs.includes("ouverture")) return "Ouverture";
  if (obs.includes("fermeture")) return "Fermeture";
  if (obs.includes("accompagnement")) return "Accompagnement";
  if (obs.includes("aléatoire") || obs.includes("aleatoire")) return "Aléatoire";
  return "Passage";
}

type RondePlannedDaySectionProps = {
  entries: RondeEntry[];
  profiles: RondePlannedProfileRef[];
  intervenants: IntervenantRef[];
  rondeMotifs: RondeMotifTypeRef[];
  holidays: HolidayRef[];
  mode?: "planned" | "entries";
  onNotify?: (message: string) => void;
  onOpenCreatePlanned: (slot: ApplicablePlannedSlot, dayIso: string) => void;
  onOpenEntry: (entry: RondeEntry) => void;
};

export function RondePlannedDaySection({
  entries,
  profiles,
  intervenants,
  rondeMotifs,
  holidays,
  mode = "planned",
  onNotify,
  onOpenCreatePlanned,
  onOpenEntry
}: RondePlannedDaySectionProps) {
  const [dayIso, setDayIso] = useState(formatTodayIso);
  const [exportingEntryId, setExportingEntryId] = useState<string | null>(null);

  const holidayDateIsos = useMemo(() => holidays.map((item) => item.dateIso), [holidays]);
  const slots = useMemo(() => buildApplicablePlannedSlots(profiles, dayIso, holidayDateIsos), [profiles, dayIso, holidayDateIsos]);
  const rows = useMemo(() => groupSlotsBySite(slots), [slots]);
  const displayDateByEntryId = useMemo(() => {
    const assignments = new Map<string, string>();
    const byBatch = new Map<string, RondeEntry[]>();

    for (const entry of entries) {
      if (!entry.requestBatchId) continue;
      const list = byBatch.get(entry.requestBatchId);
      if (list) list.push(entry);
      else byBatch.set(entry.requestBatchId, [entry]);
    }

    for (const batchEntries of byBatch.values()) {
      const snapshot = batchEntries[0]?.requestPlanningSnapshot;
      if (!snapshot || snapshot.validTo < snapshot.validFrom) continue;
      const allSameDate = batchEntries.every((entry) => entry.requestDate === batchEntries[0].requestDate);
      if (!allSameDate) continue;

      const slots: Array<{ dayIso: string; minute: number }> = [];
      const days = enumerateDatesInclusive(snapshot.validFrom, snapshot.validTo);
      for (const dayIso of days) {
        for (const line of snapshot.lines) {
          if (line.roundKind !== "OPENING" && line.roundKind !== "CLOSING" && line.roundKind !== "ACCOMPAGNEMENT") continue;
          const minute = hhmmToMinutes(line.requestedTime || "");
          slots.push({ dayIso, minute: minute ?? 0 });
        }
      }
      if (!slots.length) continue;

      const sortedSlots = slots.sort((a, b) => (a.dayIso === b.dayIso ? a.minute - b.minute : a.dayIso.localeCompare(b.dayIso)));
      const sortedEntries = [...batchEntries].sort((a, b) => {
        const am = hhmmToMinutes(extractRequestedTimeFromObs(a.horairesDemandeObs || "") || "") ?? 0;
        const bm = hhmmToMinutes(extractRequestedTimeFromObs(b.horairesDemandeObs || "") || "") ?? 0;
        if (am !== bm) return am - bm;
        return a.createdAt.localeCompare(b.createdAt);
      });

      for (let i = 0; i < sortedEntries.length && i < sortedSlots.length; i += 1) {
        assignments.set(sortedEntries[i].id, sortedSlots[i].dayIso);
      }
    }

    return assignments;
  }, [entries]);
  const entryRows = useMemo(() => {
    const dayEntries = entries.filter((entry) => (displayDateByEntryId.get(entry.id) ?? entry.requestDate) === dayIso);
    const grouped = new Map<string, { siteId: string; siteDisplay: string; items: RondeEntry[] }>();
    for (const entry of dayEntries) {
      const key = entry.siteId || entry.siteDisplay || entry.id;
      const current = grouped.get(key);
      if (current) {
        current.items.push(entry);
        continue;
      }
      grouped.set(key, {
        siteId: entry.siteId || key,
        siteDisplay: entry.siteDisplay,
        items: [entry]
      });
    }
    return Array.from(grouped.values());
  }, [entries, dayIso, displayDateByEntryId]);

  const today = formatTodayIso();
  const isToday = dayIso === today;

  return (
    <>
      <div className="ronde-planned-day-toolbar">
        {/* Navigateur de date [<] [date] [>] [reset] label */}
        <div className="gard-date-nav">
          <button
            type="button"
            className="action-icon-btn"
            title="Jour précédent"
            aria-label="Jour précédent"
            onClick={() => setDayIso((d) => shiftDateRonde(d, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            className="gard-date-nav-input"
            value={dayIso}
            onChange={(e) => e.target.value && setDayIso(e.target.value)}
            aria-label="Date sélectionnée"
          />
          <button
            type="button"
            className="action-icon-btn"
            title="Jour suivant"
            aria-label="Jour suivant"
            onClick={() => setDayIso((d) => shiftDateRonde(d, 1))}
          >
            <ChevronRight size={18} />
          </button>
          {!isToday && (
            <button
              type="button"
              className="action-icon-btn"
              title="Revenir à aujourd'hui"
              aria-label="Aujourd'hui"
              onClick={() => setDayIso(today)}
            >
              <RotateCcw size={15} />
            </button>
          )}
          <span className="gard-date-nav-label">{formatDateLongRonde(dayIso)}</span>
          {isToday && <span className="gard-today-badge">Aujourd'hui</span>}
        </div>
        <span className="muted" style={{ marginTop: 4 }}>
          {mode === "planned"
            ? (
              slots.length
                ? `${slots.length} passage${slots.length > 1 ? "s" : ""} prévu${slots.length > 1 ? "s" : ""} selon les profils actifs.`
                : "Aucun passage prévu pour cette date (vérifiez les profils et les jours / récurrences)."
            )
            : (
              entryRows.length
                ? `${entryRows.reduce((acc, row) => acc + row.items.length, 0)} passage${entryRows.reduce((acc, row) => acc + row.items.length, 0) > 1 ? "s" : ""} prévu${entryRows.reduce((acc, row) => acc + row.items.length, 0) > 1 ? "s" : ""} pour cette date.`
                : "Aucun passage prévu pour cette date."
            )}
        </span>
      </div>

      <div className="table-scroll-x">
        <table className="data-table-fixed ronde-planned-day-table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Passages</th>
            </tr>
          </thead>
          <tbody>
            {mode === "planned"
              ? rows.map((row) => (
                <tr key={row.siteId}>
                  <td>{row.siteDisplay}</td>
                  <td>
                    <div className="ronde-planned-day-passages-grid">
                      {row.slots.map((slot) => {
                        const existing = findPlannedEntryForSlot(entries, dayIso, slot);
                        return (
                          <div key={`${row.siteId}-${slot.slotKey}-${slot.roundKind}`} className="ronde-planned-day-passage-item">
                            {existing ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-light"
                                  title="Ouvrir la fiche ronde"
                                  onClick={() => onOpenEntry(existing)}
                                >
                                  {formatPlannedRoundKindLabel(slot.roundKind)}
                                </button>
                                <span className="muted ronde-planned-day-status">{statusShort(existing)}</span>
                                <button
                                  type="button"
                                  className="action-icon-btn btn-light"
                                  disabled={exportingEntryId === existing.id}
                                  title="Exporter Word (modèle du profil)"
                                  aria-label="Exporter Word (modèle du profil)"
                                  onClick={async () => {
                                    setExportingEntryId(existing.id);
                                    try {
                                      await exportRondeEntryToWord(existing, { profileLabel: slot.profileLabel, profiles });
                                      onNotify?.("Document Word exporté.");
                                    } catch (err) {
                                      onNotify?.(err instanceof Error ? err.message : "Export Word impossible.");
                                    } finally {
                                      setExportingEntryId(null);
                                    }
                                  }}
                                >
                                  <FileDown size={16} aria-hidden />
                                </button>
                              </>
                            ) : (
                              <button type="button" className="btn-light" onClick={() => onOpenCreatePlanned(slot, dayIso)}>
                                {formatPlannedRoundKindLabel(slot.roundKind)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))
              : entryRows.map((row) => (
                <tr key={row.siteId}>
                  <td>{row.siteDisplay}</td>
                  <td>
                    <div className="ronde-planned-day-passages-grid">
                      {row.items.map((entry) => (
                        <div key={entry.id} className="ronde-planned-day-passage-item">
                          <button
                            type="button"
                            className="btn-light"
                            title="Ouvrir la fiche ronde"
                            onClick={() => onOpenEntry(entry)}
                          >
                            {logicalRoundTypeLabel(entry)}
                          </button>
                          <span className="muted ronde-planned-day-status">{statusShort(entry)}</span>
                          {entry.status === "CLOTURE" ? (
                            <button
                              type="button"
                              className="action-icon-btn btn-light"
                              disabled={exportingEntryId === entry.id}
                              title="Exporter Word"
                              aria-label="Exporter Word"
                              onClick={async () => {
                                setExportingEntryId(entry.id);
                                try {
                                  await exportRondeEntryToWord(entry, { profiles });
                                  onNotify?.("Document Word exporté.");
                                } catch (err) {
                                  onNotify?.(err instanceof Error ? err.message : "Export Word impossible.");
                                } finally {
                                  setExportingEntryId(null);
                                }
                              }}
                            >
                              <FileDown size={16} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            {mode === "planned" && !rows.length ? (
              <tr>
                <td colSpan={2} className="muted">
                  Aucun site avec planification pour cette journée.
                </td>
              </tr>
            ) : null}
            {mode === "entries" && !entryRows.length ? (
              <tr>
                <td colSpan={2} className="muted">
                  Aucun passage prévu pour cette date.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
