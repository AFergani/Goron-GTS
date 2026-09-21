/**
 * Modale des périodes exceptionnelles Fransor (navigation année/mois, CRUD, suppression).
 *
 * La garde Échap / abandon de la modale principale reste dans `FransorPage`.
 * Échap sur la confirmation de suppression est géré ici via `useModalEscape`.
 */

import { ChevronDown, ChevronUp, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useModalEscape } from "../../common/hooks/useModalEscape";
import type { FransorClosure } from "../../../types";
import {
  formatClosureModeLabel,
  formatDateFr,
  formatMonthFr,
  formatMonthShortFr
} from "../model/fransorCalendar";

type FransorClosureExceptionsModalProps = {
  isOpen: boolean;
  pageMonth: string;
  closureModalYear: number;
  closureModalYearMonths: string[];
  closureModalSelectedMonth: string;
  closuresByMonth: Record<string, FransorClosure[]>;
  closureYearLoading: boolean;
  selectedMonthClosures: FransorClosure[];
  closureStartDate: string;
  closureEndDate: string;
  closureLabel: string;
  closureMode: "CLOSED" | "OPEN";
  editingClosureId: string | null;
  deleteClosureId: string | null;
  deleteClosureReason: string;
  onRequestClose: () => void;
  changeClosureModalYear: (year: number) => void;
  resetClosureModalToCurrentMonth: () => void;
  setClosureModalSelectedMonth: Dispatch<SetStateAction<string>>;
  setClosureStartDate: Dispatch<SetStateAction<string>>;
  setClosureEndDate: Dispatch<SetStateAction<string>>;
  setClosureLabel: Dispatch<SetStateAction<string>>;
  setClosureMode: Dispatch<SetStateAction<"CLOSED" | "OPEN">>;
  setEditingClosureId: Dispatch<SetStateAction<string | null>>;
  setDeleteClosureId: Dispatch<SetStateAction<string | null>>;
  setDeleteClosureReason: Dispatch<SetStateAction<string>>;
  onSubmitException: () => void;
  onConfirmDelete: () => void;
};

/**
 * @param props.isOpen - Affichage de la modale d’exceptions
 * @param props.onRequestClose - Fermeture demandée (overlay, Fermer, Échap)
 */
export function FransorClosureExceptionsModal({
  isOpen,
  pageMonth,
  closureModalYear,
  closureModalYearMonths,
  closureModalSelectedMonth,
  closuresByMonth,
  closureYearLoading,
  selectedMonthClosures,
  closureStartDate,
  closureEndDate,
  closureLabel,
  closureMode,
  editingClosureId,
  deleteClosureId,
  deleteClosureReason,
  onRequestClose,
  changeClosureModalYear,
  resetClosureModalToCurrentMonth,
  setClosureModalSelectedMonth,
  setClosureStartDate,
  setClosureEndDate,
  setClosureLabel,
  setClosureMode,
  setEditingClosureId,
  setDeleteClosureId,
  setDeleteClosureReason,
  onSubmitException,
  onConfirmDelete
}: FransorClosureExceptionsModalProps) {
  useModalEscape(Boolean(deleteClosureId), () => {
    setDeleteClosureId(null);
    setDeleteClosureReason("");
  });

  if (!isOpen && !deleteClosureId) return null;

  return (
    <>
      {isOpen ? (
        <div className="modal-overlay" onClick={onRequestClose}>
          <div className="modal fransor-help-modal fransor-closure-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="fransor-closure-modal-title">Périodes exceptionnelles (ouvertures et fermetures)</h3>

            <div className="fransor-closure-modal-sections">
              <section className="fransor-closure-help" aria-labelledby="fransor-closure-help-title">
                <h4 id="fransor-closure-help-title">Aide rapide</h4>
                <ol>
                  <li>
                    <strong>Parcourir :</strong> choisir l&apos;année, puis cliquer sur un mois — le chiffre sur la carte
                    indique le nombre de périodes enregistrées pour ce mois.
                  </li>
                  <li>
                    <strong>Consulter :</strong> le tableau en bas liste les périodes du mois sélectionné.
                  </li>
                  <li>
                    <strong>Créer :</strong> renseigner la date de début, la date de fin (optionnelle), le type (Ouvert/Fermer)
                    et un motif, puis cliquer sur <strong>Enregistrer exception</strong>.
                  </li>
                  <li>
                    <strong>Modifier :</strong> utiliser l&apos;icône crayon dans le tableau, ajuster les valeurs, puis
                    réenregistrer.
                  </li>
                  <li>
                    <strong>Supprimer :</strong> utiliser l&apos;icône suppression, puis saisir un motif obligatoire.
                  </li>
                </ol>
              </section>

              <section className="fransor-closure-nav-section" aria-label="Navigation par année et par mois">
                <div className="fransor-closure-year-row">
                  <span className="fransor-closure-year-label">Année :</span>
                  <div className="fransor-month-input-row fransor-closure-year-input-row">
                    <button
                      type="button"
                      className="btn-light action-icon-btn"
                      title="Année précédente"
                      aria-label="Année précédente"
                      onClick={() => changeClosureModalYear(closureModalYear - 1)}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <input
                      type="number"
                      className="fransor-closure-year-input"
                      value={closureModalYear}
                      min={2000}
                      max={2100}
                      step={1}
                      aria-label="Année des périodes exceptionnelles"
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (Number.isFinite(parsed)) changeClosureModalYear(parsed);
                      }}
                    />
                    <button
                      type="button"
                      className="btn-light action-icon-btn"
                      title="Année suivante"
                      aria-label="Année suivante"
                      onClick={() => changeClosureModalYear(closureModalYear + 1)}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-light action-icon-btn"
                      title="Revenir au mois en cours"
                      aria-label="Revenir au mois en cours"
                      onClick={resetClosureModalToCurrentMonth}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </div>
                <div
                  className="fransor-closure-month-window"
                  role="group"
                  aria-label={`Mois de l'année ${closureModalYear}, sélectionner un mois pour afficher ses périodes`}
                >
                  {closureModalYearMonths.map((month) => {
                    const monthLoaded = Object.prototype.hasOwnProperty.call(closuresByMonth, month);
                    const count = closuresByMonth[month]?.length ?? 0;
                    const isSelected = closureModalSelectedMonth === month;
                    const isPageMonth = pageMonth === month;
                    return (
                      <button
                        key={month}
                        type="button"
                        className={`fransor-closure-month-chip${isSelected ? " fransor-closure-month-chip--selected" : ""}${isPageMonth ? " fransor-closure-month-chip--page-month" : ""}`}
                        onClick={() => setClosureModalSelectedMonth(month)}
                        aria-pressed={isSelected}
                        title={`${formatMonthFr(month)} : ${count} période${count > 1 ? "s" : ""}`}
                        aria-label={`${formatMonthFr(month)}, ${count} période${count > 1 ? "s" : ""}`}
                      >
                        <span className="fransor-closure-month-chip-name">{formatMonthShortFr(month)}</span>
                        <span
                          className={`fransor-closures-count-badge fransor-closures-count-badge--chip${count === 0 ? " fransor-closures-count-badge--empty" : ""}`}
                          aria-hidden="true"
                        >
                          {closureYearLoading && !monthLoaded ? "…" : count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="fransor-closure-form-section" aria-label="Ajout ou modification d'une période">
                <div className="row fransor-closure-create">
                  <label>
                    Date début
                    <input type="date" value={closureStartDate} onChange={(e) => setClosureStartDate(e.target.value)} />
                  </label>
                  <label>
                    Date fin (optionnelle)
                    <input
                      type="date"
                      value={closureEndDate}
                      onChange={(e) => setClosureEndDate(e.target.value)}
                      title="Optionnel: remplir seulement pour une période"
                    />
                  </label>
                  <select
                    value={closureMode}
                    onChange={(e) => setClosureMode(e.target.value === "OPEN" ? "OPEN" : "CLOSED")}
                    aria-label="Type d'exception calendrier"
                  >
                    <option value="CLOSED">Fermer</option>
                    <option value="OPEN">Ouvert</option>
                  </select>
                  <input value={closureLabel} onChange={(e) => setClosureLabel(e.target.value)} placeholder="Motif (ex: Férié)" />
                </div>
                <div className="fransor-closure-actions">
                  {editingClosureId && (
                    <button
                      type="button"
                      className="btn-light action-icon-btn"
                      title="Annuler la modification"
                      aria-label="Annuler la modification"
                      onClick={() => {
                        setEditingClosureId(null);
                        setClosureStartDate("");
                        setClosureEndDate("");
                        setClosureLabel("");
                        setClosureMode("CLOSED");
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                  <button type="button" onClick={onSubmitException}>
                    {editingClosureId ? "Mettre à jour exception" : "Enregistrer exception"}
                  </button>
                </div>
              </section>

              <section className="fransor-closure-list-section" aria-label="Liste des périodes du mois sélectionné">
                {closureModalSelectedMonth ? (
                  <h4 className="fransor-closure-list-title">{formatMonthFr(closureModalSelectedMonth)}</h4>
                ) : null}
                {selectedMonthClosures.length > 0 && (
                  <table className="fransor-closure-table">
                    <thead>
                      <tr>
                        <th>Du</th>
                        <th>Au</th>
                        <th>Type</th>
                        <th>Motif</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMonthClosures.map((closure) => (
                        <tr key={closure.id}>
                          <td>{formatDateFr(closure.startDate)}</td>
                          <td>{formatDateFr(closure.endDate)}</td>
                          <td>{formatClosureModeLabel(closure.mode)}</td>
                          <td>{closure.label}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-light action-icon-btn"
                              title="Modifier l'exception"
                              aria-label="Modifier l'exception"
                              onClick={() => {
                                setEditingClosureId(closure.id);
                                setClosureStartDate(closure.startDate);
                                setClosureEndDate(closure.endDate);
                                setClosureLabel(closure.label);
                                setClosureMode(closure.mode);
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-danger action-icon-btn"
                              title="Supprimer l'exception"
                              aria-label="Supprimer l'exception"
                              onClick={() => {
                                setDeleteClosureId(closure.id);
                                setDeleteClosureReason("");
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {closureModalSelectedMonth &&
                Object.prototype.hasOwnProperty.call(closuresByMonth, closureModalSelectedMonth) &&
                selectedMonthClosures.length === 0 ? (
                  <p className="muted fransor-closure-empty">
                    Aucune période enregistrée pour {formatMonthFr(closureModalSelectedMonth)}.
                  </p>
                ) : null}
              </section>
            </div>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={onRequestClose}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteClosureId ? (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer l'exception</h3>
            <div className="form">
              <label>
                Motif de suppression (obligatoire)
                <input
                  value={deleteClosureReason}
                  onChange={(e) => setDeleteClosureReason(e.target.value)}
                  placeholder="Ex: saisie erronée / période annulée"
                />
              </label>
            </div>
            <div className="row-actions modal-actions">
              <button
                type="button"
                className="btn-light"
                onClick={() => {
                  setDeleteClosureId(null);
                  setDeleteClosureReason("");
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={!deleteClosureReason.trim()}
                onClick={onConfirmDelete}
              >
                Confirmer suppression
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
