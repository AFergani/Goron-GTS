/**
 * Onglet jours fériés (calendrier, fériés fixes France fusionnés).
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { HolidayRef } from "../../../../types";
import { useTableSort } from "../../../common/hooks/useTableSort";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal, type SyncOrAsync } from "./common";

type HolidaysDataTabProps = {
  canDeleteData: boolean;
  editingHolidayId: string | null;
  editingHolidayDateIso: string;
  editingHolidayLabel: string;
  filteredHolidays: HolidayRef[];
  pageStart: number;
  pageEnd: number;
  setEditingHolidayId: (value: string | null) => void;
  setEditingHolidayDateIso: (value: string) => void;
  setEditingHolidayLabel: (value: string) => void;
  onUpdateHoliday: (id: string, dateIso: string, label: string) => SyncOrAsync;
  onDeleteHoliday: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
  onNotify?: (message: string) => void;
};

type HolidaySortKey = "date" | "label";

export function HolidaysDataTab(props: HolidaysDataTabProps) {
  const formatDateFr = (dateIso: string) => {
    if (!dateIso) return "";
    const d = new Date(`${dateIso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateIso;
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const isFixedHoliday = (item: HolidayRef) => String(item.id || "").startsWith("fr-fixed-");

  const comparators: Record<HolidaySortKey, (a: HolidayRef, b: HolidayRef) => number> = {
    date: (a, b) => compareTextFr(a.dateIso, b.dateIso),
    label: (a, b) => compareTextFr(a.label, b.label)
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<HolidayRef, HolidaySortKey>(
    props.filteredHolidays,
    comparators,
    { key: "date", direction: "asc" }
  );
  const pagedHolidays = sortedEntries.slice(props.pageStart, props.pageEnd);
  const sortLabel = (key: HolidaySortKey) => tableSortArrow(sortKey, key, sortDirection);

  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-intervenants">
        <colgroup>
          <col />
          <col />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("date")}>
                Date {sortLabel("date")}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("label")}>
                Libellé {sortLabel("label")}
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pagedHolidays.map((item) => (
            <tr key={item.id}>
              <td>
                {props.editingHolidayId === item.id ? (
                  <input
                    type="date"
                    value={props.editingHolidayDateIso}
                    onChange={(e) => props.setEditingHolidayDateIso(e.target.value)}
                  />
                ) : (
                  formatDateFr(item.dateIso)
                )}
              </td>
              <td>
                {props.editingHolidayId === item.id ? (
                  <input value={props.editingHolidayLabel} onChange={(e) => props.setEditingHolidayLabel(e.target.value)} />
                ) : (
                  item.label
                )}
              </td>
              <td>
                <div className="table-actions">
                  {isFixedHoliday(item) ? (
                    <span className="muted">Automatique</span>
                  ) : props.editingHolidayId === item.id ? (
                    <>
                      <button
                        className="btn-light action-icon-btn"
                        title="Sauvegarder"
                        aria-label="Sauvegarder"
                        onClick={() => {
                          void props.onUpdateHoliday(item.id, props.editingHolidayDateIso, props.editingHolidayLabel);
                          props.setEditingHolidayId(null);
                        }}
                      >
                        <Save size={14} />
                      </button>
                      <button
                        className="btn-light action-icon-btn"
                        title="Annuler"
                        aria-label="Annuler"
                        onClick={() => props.setEditingHolidayId(null)}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn-light action-icon-btn"
                      title="Modifier"
                      aria-label="Modifier"
                      onClick={() => {
                        props.setEditingHolidayId(item.id);
                        props.setEditingHolidayDateIso(item.dateIso);
                        props.setEditingHolidayLabel(item.label);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {props.canDeleteData && !isFixedHoliday(item) && (
                    <button
                      className="btn-danger action-icon-btn"
                      title="Supprimer"
                      aria-label="Supprimer"
                      onClick={() => {
                        if (isFixedHoliday(item)) {
                          props.onNotify?.("Ce jour férié est injecté automatiquement et ne peut pas être supprimé.");
                          return;
                        }
                        props.openDeleteReasonModal(`jour férié ${formatDateFr(item.dateIso)}`, (reason) => props.onDeleteHoliday(item.id, reason));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!props.filteredHolidays.length && (
            <tr>
              <td colSpan={3} className="muted">
                Aucun jour férié configuré.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
