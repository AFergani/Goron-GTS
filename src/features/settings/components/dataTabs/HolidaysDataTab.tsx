import { ChevronLeft, ChevronRight, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { HolidayRef } from "../../../../types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

type HolidaysDataTabProps = {
  canDeleteData: boolean;
  allHolidays: HolidayRef[];
  holidayDateIso: string;
  holidayLabel: string;
  holidayYear: string;
  editingHolidayId: string | null;
  editingHolidayDateIso: string;
  editingHolidayLabel: string;
  pagedHolidays: HolidayRef[];
  filteredHolidays: HolidayRef[];
  setHolidayDateIso: (value: string) => void;
  setHolidayLabel: (value: string) => void;
  setHolidayYear: (value: string) => void;
  setEditingHolidayId: (value: string | null) => void;
  setEditingHolidayDateIso: (value: string) => void;
  setEditingHolidayLabel: (value: string) => void;
  onCreateHoliday: (dateIso: string, label: string) => SyncOrAsync;
  onUpdateHoliday: (id: string, dateIso: string, label: string) => SyncOrAsync;
  onDeleteHoliday: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
  onNotify?: (message: string) => void;
};

export function HolidaysDataTab(props: HolidaysDataTabProps) {
  const formatDateFr = (dateIso: string) => {
    if (!dateIso) return "";
    const d = new Date(`${dateIso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateIso;
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const isFixedHoliday = (item: HolidayRef) => String(item.id || "").startsWith("fr-fixed-");

  return (
    <div className="table-scroll-x">
      <div className="main-courante-table-toolbar" style={{ marginBottom: 10 }}>
        <p className="muted">
          Les jours fériés fixes français sont gérés automatiquement. Ajoutez ici uniquement les jours non fixes ou spécifiques.
        </p>
        <div className="row-actions" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="btn-light action-icon-btn"
            title="Année précédente"
            aria-label="Année précédente"
            onClick={() => {
              const y = Number(props.holidayYear);
              if (!Number.isFinite(y)) return;
              props.setHolidayYear(String(y - 1));
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="number"
            min={1900}
            max={2200}
            step={1}
            value={props.holidayYear}
            onChange={(e) => props.setHolidayYear(e.target.value)}
            aria-label="Année affichée"
            style={{ width: 92 }}
          />
          <button
            type="button"
            className="btn-light action-icon-btn"
            title="Année suivante"
            aria-label="Année suivante"
            onClick={() => {
              const y = Number(props.holidayYear);
              if (!Number.isFinite(y)) return;
              props.setHolidayYear(String(y + 1));
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <table className="data-table-fixed data-table-intervenants">
        <colgroup>
          <col />
          <col />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Libellé</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <input type="date" value={props.holidayDateIso} onChange={(e) => props.setHolidayDateIso(e.target.value)} />
            </td>
            <td>
              <input
                value={props.holidayLabel}
                onChange={(e) => props.setHolidayLabel(e.target.value)}
                placeholder="Ex: Fête nationale"
              />
            </td>
            <td>
              <button
                className="btn-light action-icon-btn"
                title="Ajouter"
                aria-label="Ajouter"
                onClick={() => {
                  const date = props.holidayDateIso.trim();
                  if (date && props.allHolidays.some((h) => h.dateIso === date)) {
                    props.onNotify?.("Cette date fériée existe déjà.");
                    return;
                  }
                  void props.onCreateHoliday(props.holidayDateIso, props.holidayLabel);
                  props.setHolidayDateIso("");
                  props.setHolidayLabel("");
                }}
              >
                <Save size={14} />
              </button>
            </td>
          </tr>
          {props.pagedHolidays.map((item) => (
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
