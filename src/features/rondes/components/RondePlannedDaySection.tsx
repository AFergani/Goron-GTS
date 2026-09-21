/**
 * Vue journée : uniquement les passages encore « En cours » (exploitation du jour).
 * La vue liste conserve filtres, clôturées / annulées et actions avancées.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { RondeMotifTypeRef, RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { HolidayRef, IntervenantRef } from "../../../types";
import {
  ApplicablePlannedSlot,
  buildApplicablePlannedSlots,
  formatPlannedRoundKindLabel,
  groupSlotsBySite
} from "../model/plannedSlots";
import type { NotifyToast } from "../../common/model/toast.types";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { DateInput } from "../../common/components/DateInput";
import { addDaysLocalIso, formatLongDateFr, getLocalDateIso } from "../../common/utils/localDateIso";
import { findPlannedEntryForSlot, hhmmToMinutes } from "../utils/rondeDateTime";
import { extractRondeRequestedTimeHm } from "../utils/rondePassageRules";
import { rondePassageKindLabel } from "../utils/rondePassageKindLabel";

function compareEntriesByRequestedTime(a: RondeEntry, b: RondeEntry): number {
  const am = hhmmToMinutes(extractRondeRequestedTimeHm(a));
  const bm = hhmmToMinutes(extractRondeRequestedTimeHm(b));
  if (am !== bm) return am - bm;
  return a.id.localeCompare(b.id);
}

/**
 * Numérote les libellés d'un même type sur la journée / le site (ex. Aléatoire N°1, Aléatoire N°2).
 * Un type unique sur le site reste sans numéro (ex. « Ouverture »).
 */
function numberPassageLabels(items: Array<{ id: string; kind: string }>): Map<string, string> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.kind, (totals.get(item.kind) || 0) + 1);
  }
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const item of items) {
    const n = (seen.get(item.kind) || 0) + 1;
    seen.set(item.kind, n);
    const total = totals.get(item.kind) || 1;
    labels.set(item.id, total > 1 ? `${item.kind} N°${n}` : item.kind);
  }
  return labels;
}

type RondePlannedDaySectionProps = {
  entries: RondeEntry[];
  profiles: RondePlannedProfileRef[];
  intervenants: IntervenantRef[];
  rondeMotifs: RondeMotifTypeRef[];
  holidays: HolidayRef[];
  mode?: "planned" | "entries";
  onNotify?: NotifyToast;
  onOpenCreatePlanned: (slot: ApplicablePlannedSlot, dayIso: string) => void;
  onOpenEntry: (entry: RondeEntry) => void;
};

export function RondePlannedDaySection({
  entries,
  profiles,
  holidays,
  mode = "planned",
  onNotify,
  onOpenCreatePlanned,
  onOpenEntry
}: RondePlannedDaySectionProps) {
  const [dayIso, setDayIso] = useState(getLocalDateIso);

  const holidayDateIsos = useMemo(() => holidays.map((item) => item.dateIso), [holidays]);
  const slots = useMemo(
    () => buildApplicablePlannedSlots(profiles, dayIso, holidayDateIsos),
    [profiles, dayIso, holidayDateIsos]
  );

  /** Créneaux encore à traiter : pas de fiche, ou fiche encore EN_COURS. */
  const openPlannedSlots = useMemo(() => {
    return slots.filter((slot) => {
      const existing = findPlannedEntryForSlot(entries, dayIso, slot);
      if (!existing) return true;
      return existing.status === "EN_COURS";
    });
  }, [slots, entries, dayIso]);

  const rows = useMemo(() => groupSlotsBySite(openPlannedSlots), [openPlannedSlots]);

  const entryRows = useMemo(() => {
    const dayEntries = entries.filter((entry) => {
      if (entry.status !== "EN_COURS") return false;
      return entry.requestDate === dayIso;
    });
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
    return Array.from(grouped.values()).map((row) => {
      const items = [...row.items].sort(compareEntriesByRequestedTime);
      const labels = numberPassageLabels(
        items.map((entry) => ({ id: entry.id, kind: rondePassageKindLabel(entry) }))
      );
      return { ...row, items, labels };
    });
  }, [entries, dayIso]);

  const today = getLocalDateIso();
  const isToday = dayIso === today;
  const openCount =
    mode === "planned"
      ? openPlannedSlots.length
      : entryRows.reduce((acc, row) => acc + row.items.length, 0);

  return (
    <>
      <div className="ronde-planned-day-toolbar">
        <div className="gard-date-nav">
          <button
            type="button"
            className="action-icon-btn"
            title="Jour précédent"
            aria-label="Jour précédent"
            onClick={() => setDayIso((d) => addDaysLocalIso(d, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <DateInput
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
            onClick={() => setDayIso((d) => addDaysLocalIso(d, 1))}
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
          <span className="gard-date-nav-label">{formatLongDateFr(dayIso)}</span>
          {isToday && <span className="gard-today-badge">Aujourd&apos;hui</span>}
        </div>
        <span className="muted" style={{ marginTop: 4 }}>
          {openCount
            ? `${openCount} passage${openCount > 1 ? "s" : ""} en cours pour cette date.`
            : "Aucun passage en cours pour cette date (voir la vue liste pour l'historique)."}
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
              ? rows.map((row) => {
                  const slotLabels = numberPassageLabels(
                    row.slots.map((slot) => ({
                      id: `${slot.slotKey}-${slot.roundKind}`,
                      kind: formatPlannedRoundKindLabel(slot.roundKind)
                    }))
                  );
                  return (
                  <tr key={row.siteId}>
                    <td className="mc-site-wrap">
                      <SiteDisplayCopyButton variant="table" siteLabel={row.siteDisplay || ""} onNotify={onNotify} />
                    </td>
                    <td>
                      <div className="ronde-planned-day-passages-grid">
                        {row.slots.map((slot) => {
                          const existing = findPlannedEntryForSlot(entries, dayIso, slot);
                          const label =
                            slotLabels.get(`${slot.slotKey}-${slot.roundKind}`) ||
                            formatPlannedRoundKindLabel(slot.roundKind);
                          return (
                            <div
                              key={`${row.siteId}-${slot.slotKey}-${slot.roundKind}`}
                              className="ronde-planned-day-passage-item"
                            >
                              {existing ? (
                                <button
                                  type="button"
                                  className="btn-light"
                                  title="Ouvrir la fiche ronde"
                                  onClick={() => onOpenEntry(existing)}
                                >
                                  {label}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-light"
                                  onClick={() => onOpenCreatePlanned(slot, dayIso)}
                                >
                                  {label}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                  );
                })
              : entryRows.map((row) => (
                  <tr key={row.siteId}>
                    <td className="mc-site-wrap">
                      <SiteDisplayCopyButton variant="table" siteLabel={row.siteDisplay || ""} onNotify={onNotify} />
                    </td>
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
                              {row.labels.get(entry.id) || rondePassageKindLabel(entry)}
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
            {mode === "planned" && !rows.length ? (
              <tr>
                <td colSpan={2} className="muted">
                  Aucun site avec passage en cours pour cette journée.
                </td>
              </tr>
            ) : null}
            {mode === "entries" && !entryRows.length ? (
              <tr>
                <td colSpan={2} className="muted">
                  Aucun passage en cours pour cette date.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
