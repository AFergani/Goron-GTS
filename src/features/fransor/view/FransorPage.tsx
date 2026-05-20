import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CircleHelp, FileDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useFransorPresenter } from "../presenter/useFransorPresenter";
import type { Role } from "../../../types";
import { exportFransorMonthlyRecapToWord } from "../export/fransorRecapWordExport";

function getDaysInMonth(month: string) {
  const [year, monthPart] = month.split("-").map((v) => Number(v));
  if (!year || !monthPart) return [];
  const total = new Date(year, monthPart, 0).getDate();
  const days: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    const iso = `${year}-${String(monthPart).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push(iso);
  }
  return days;
}

function isWeekend(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getWeekendDayLabel(isoDate: string): "samedi" | "dimanche" | null {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.getDay();
  if (day === 6) return "samedi";
  if (day === 0) return "dimanche";
  return null;
}

function getWeekdayOffsetFromMonday(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return (date.getDay() + 6) % 7;
}

function formatDateFr(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMonthFr(month: string) {
  const [year, monthPart] = month.split("-").map((v) => Number(v));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1, 1);
  const text = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shiftMonth(month: string, delta: number) {
  const [year, monthPart] = month.split("-").map((v) => Number(v));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function FransorPage({
  requesterRole,
  requesterUsername,
  onToast,
  refreshToken = 0
}: {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
  refreshToken?: number;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryDate, setEntryDate] = useState(getLocalIsoDate);
  const [entryOuvertureResponsableId, setEntryOuvertureResponsableId] = useState("");
  const [entryFermetureResponsableId, setEntryFermetureResponsableId] = useState("");
  const [entryOuvertureDone, setEntryOuvertureDone] = useState(false);
  const [entryFermetureDone, setEntryFermetureDone] = useState(false);
  const [closureStartDate, setClosureStartDate] = useState("");
  const [closureEndDate, setClosureEndDate] = useState("");
  const [closureLabel, setClosureLabel] = useState("");
  const [closureMode, setClosureMode] = useState<"CLOSED" | "OPEN">("CLOSED");
  const [editingClosureId, setEditingClosureId] = useState<string | null>(null);
  const [deleteClosureId, setDeleteClosureId] = useState<string | null>(null);
  const [deleteClosureReason, setDeleteClosureReason] = useState("");
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [exportRecapLoading, setExportRecapLoading] = useState(false);
  const [dayViewMode, setDayViewMode] = useState<"missing" | "filled">("missing");
  const presenter = useFransorPresenter({ requesterRole, requesterUsername, onToast });

  const todayIso = getLocalIsoDate();
  const days = useMemo(() => getDaysInMonth(presenter.month), [presenter.month]);
  const exceptionByDate = useMemo(() => {
    const map = new Map<string, { id: string; label: string; mode: "CLOSED" | "OPEN"; updatedAt: string }>();
    const sorted = presenter.closures.slice();
    for (const dayIso of days) {
      let lastMatch: { id: string; label: string; mode: "CLOSED" | "OPEN"; updatedAt: string } | null = null;
      for (const closure of sorted) {
        if (dayIso >= closure.startDate && dayIso <= closure.endDate) {
          const candidate = {
            id: closure.id,
            label: closure.label,
            mode: closure.mode,
            updatedAt: closure.updatedAt || closure.createdAt
          };
          if (!lastMatch) {
            lastMatch = candidate;
            continue;
          }
          if (candidate.updatedAt > lastMatch.updatedAt) {
            lastMatch = candidate;
            continue;
          }
          if (candidate.updatedAt === lastMatch.updatedAt && candidate.mode === "OPEN" && lastMatch.mode === "CLOSED") {
            lastMatch = candidate;
          }
        }
      }
      if (lastMatch) {
        map.set(dayIso, lastMatch);
      }
    }
    return map;
  }, [days, presenter.closures]);
  const holidayDateSet = useMemo(
    () => new Set(presenter.holidays.map((holiday) => String(holiday.dateIso || "").trim()).filter(Boolean)),
    [presenter.holidays]
  );
  const todayIsPlannedDay = useMemo(() => {
    const exception = exceptionByDate.get(todayIso);
    if (exception?.mode === "OPEN") return true;
    if (exception?.mode === "CLOSED") return false;
    if (holidayDateSet.has(todayIso)) return false;
    return !isWeekend(todayIso);
  }, [exceptionByDate, holidayDateSet, todayIso]);
  const todayNonPlannedReason = useMemo(() => {
    if (todayIsPlannedDay) return "";
    const exception = exceptionByDate.get(todayIso);
    if (exception?.mode === "CLOSED") {
      const detail = (exception.label || "").trim();
      return detail ? `Fermée pour "${detail}"` : "Fermée (période exceptionnelle)";
    }
    if (holidayDateSet.has(todayIso)) return "Fériée";
    const weekendLabel = getWeekendDayLabel(todayIso);
    if (weekendLabel) return weekendLabel;
    return "Non prévue";
  }, [exceptionByDate, holidayDateSet, todayIso, todayIsPlannedDay]);
  const todayStatus = useMemo(() => {
    const todayEntries = presenter.entries.filter((entry) => entry.date === todayIso);
    const openingEntry = todayEntries.find((entry) => entry.ouvertureDone);
    const closingEntry = todayEntries.find((entry) => entry.fermetureDone);
    return {
      hasOpening: Boolean(openingEntry),
      hasClosing: Boolean(closingEntry),
      openingResponsableId: openingEntry?.responsableId || "",
      closingResponsableId: closingEntry?.responsableId || ""
    };
  }, [presenter.entries, todayIso]);

  const dayStatuses = useMemo(() => {
    const list: Array<{ date: string; missingOpening: boolean; missingClosing: boolean; openingResponsableId?: string; closingResponsableId?: string }> = [];
    for (const dayIso of days) {
      const exception = exceptionByDate.get(dayIso);
      if (dayIso >= todayIso) continue;
      const isPlannedDay = exception?.mode === "OPEN"
        ? true
        : exception?.mode === "CLOSED"
          ? false
          : holidayDateSet.has(dayIso)
            ? false
            : !isWeekend(dayIso);
      if (!isPlannedDay) continue;
      const dayEntries = presenter.entries.filter((entry) => entry.date === dayIso);
      const hasOpening = dayEntries.some((entry) => entry.ouvertureDone);
      const hasClosing = dayEntries.some((entry) => entry.fermetureDone);
      list.push({
        date: dayIso,
        missingOpening: !hasOpening,
        missingClosing: !hasClosing,
        openingResponsableId: dayEntries.find((entry) => entry.ouvertureDone)?.responsableId,
        closingResponsableId: dayEntries.find((entry) => entry.fermetureDone)?.responsableId
      });
    }
    return list;
  }, [days, exceptionByDate, holidayDateSet, presenter.entries, todayIso]);
  const missingDays = useMemo(() => dayStatuses.filter((item) => item.missingOpening || item.missingClosing), [dayStatuses]);
  const filledDays = useMemo(() => dayStatuses.filter((item) => !item.missingOpening && !item.missingClosing), [dayStatuses]);
  const displayedDays = useMemo(() => (dayViewMode === "missing" ? missingDays : filledDays), [dayViewMode, filledDays, missingDays]);
  const displayedDaysByDate = useMemo(() => {
    const map = new Map<
      string,
      { date: string; missingOpening: boolean; missingClosing: boolean; openingResponsableId?: string; closingResponsableId?: string }
    >();
    for (const item of displayedDays) {
      map.set(item.date, item);
    }
    return map;
  }, [displayedDays]);
  const monthCalendarWeeks = useMemo(() => {
    if (!days.length) return [];
    const firstDayOffset = getWeekdayOffsetFromMonday(days[0]);
    const cells: Array<string | null> = [...Array(firstDayOffset).fill(null), ...days];
    while (cells.length < 42) {
      cells.push(null);
    }
    cells.length = 42;
    const weeks: Array<Array<string | null>> = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }
    return weeks;
  }, [days]);

  const recapTotals = useMemo(() => {
    const totalOuvertures = presenter.recap.reduce((sum, row) => sum + row.ouvertures, 0);
    const totalFermetures = presenter.recap.reduce((sum, row) => sum + row.fermetures, 0);
    return {
      totalOuvertures,
      totalFermetures,
      totalActions: totalOuvertures + totalFermetures
    };
  }, [presenter.recap]);

  const recapPlainText = useMemo(() => {
    const lines = [
      `Mois en cours : ${formatMonthFr(presenter.month)}`,
      ...presenter.recap.map(
        (row) => `${row.responsableName} : Ouverture ${row.ouvertures}, Fermeture ${row.fermetures}`
      ),
      `Ouverture Total : ${recapTotals.totalOuvertures}`,
      `Fermeture Total : ${recapTotals.totalFermetures}`
    ];
    return lines.join("\n");
  }, [presenter.month, presenter.recap, recapTotals.totalFermetures, recapTotals.totalOuvertures]);
  const isClosureFormValid = useMemo(() => {
    if (!closureStartDate || !closureLabel.trim()) return false;
    if (closureEndDate && closureEndDate < closureStartDate) return false;
    return true;
  }, [closureEndDate, closureLabel, closureStartDate]);

  useEffect(() => {
    const hasOpenModal = showAddModal || showClosureModal || showHelpModal || Boolean(deleteClosureId);
    if (!hasOpenModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteClosureId) {
        setDeleteClosureId(null);
        setDeleteClosureReason("");
        return;
      }
      if (showAddModal) {
        setShowAddModal(false);
        return;
      }
      if (showClosureModal) {
        setShowClosureModal(false);
        return;
      }
      if (showHelpModal) {
        setShowHelpModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteClosureId, showAddModal, showClosureModal, showHelpModal]);

  const openEntryModal = (
    prefilledDate?: string,
    defaultOuverture = false,
    defaultFermeture = false,
    prefilledOpeningResponsableId = "",
    prefilledClosingResponsableId = ""
  ) => {
    setEntryDate(prefilledDate || getLocalIsoDate());
    setEntryOuvertureResponsableId(prefilledOpeningResponsableId);
    setEntryFermetureResponsableId(prefilledClosingResponsableId);
    setEntryOuvertureDone(defaultOuverture);
    setEntryFermetureDone(defaultFermeture);
    setShowAddModal(true);
  };

  const submitQuickEntry = async () => {
    if (!entryDate) {
      onToast?.("Date obligatoire.");
      return;
    }
    if (!entryOuvertureDone && !entryFermetureDone) {
      onToast?.("Sélectionner au moins une action.");
      return;
    }
    const dayEntries = presenter.entries.filter((entry) => entry.date === entryDate);
    const currentStates = new Map<string, { ouvertureDone: boolean; fermetureDone: boolean }>();
    const targetStates = new Map<string, { ouvertureDone: boolean; fermetureDone: boolean }>();
    for (const entry of dayEntries) {
      const state = {
        ouvertureDone: Boolean(entry.ouvertureDone),
        fermetureDone: Boolean(entry.fermetureDone)
      };
      currentStates.set(entry.responsableId, state);
      targetStates.set(entry.responsableId, { ...state });
    }

    if (entryOuvertureDone && !entryOuvertureResponsableId) {
      onToast?.("Responsable obligatoire pour l'ouverture.");
      return;
    }
    if (entryFermetureDone && !entryFermetureResponsableId) {
      onToast?.("Responsable obligatoire pour la fermeture.");
      return;
    }

    if (entryOuvertureDone && !targetStates.has(entryOuvertureResponsableId)) {
      targetStates.set(entryOuvertureResponsableId, { ouvertureDone: false, fermetureDone: false });
    }
    if (entryFermetureDone && !targetStates.has(entryFermetureResponsableId)) {
      targetStates.set(entryFermetureResponsableId, { ouvertureDone: false, fermetureDone: false });
    }

    for (const [responsableId, state] of targetStates) {
      state.ouvertureDone = entryOuvertureDone ? responsableId === entryOuvertureResponsableId : false;
      state.fermetureDone = entryFermetureDone ? responsableId === entryFermetureResponsableId : false;
    }

    const updates: Array<{ responsableId: string; ouvertureDone: boolean; fermetureDone: boolean }> = [];
    for (const [responsableId, next] of targetStates) {
      const prev = currentStates.get(responsableId) || { ouvertureDone: false, fermetureDone: false };
      const hasChange = prev.ouvertureDone !== next.ouvertureDone || prev.fermetureDone !== next.fermetureDone;
      const isUseful = next.ouvertureDone || next.fermetureDone || currentStates.has(responsableId);
      if (hasChange && isUseful) {
        updates.push({
          responsableId,
          ouvertureDone: next.ouvertureDone,
          fermetureDone: next.fermetureDone
        });
      }
    }
    try {
      for (const value of updates) {
        await presenter.upsertEntry({
          date: entryDate,
          responsableId: value.responsableId,
          ouvertureDone: value.ouvertureDone,
          fermetureDone: value.fermetureDone
        });
      }
      onToast?.("Saisie Fransor enregistrée.");
      setShowAddModal(false);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  };

  const copyRecapText = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(recapPlainText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = recapPlainText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      onToast?.("Récap copié.");
    } catch {
      onToast?.("Impossible de copier le récap.");
    }
  };

  const exportRecapWord = async () => {
    setExportRecapLoading(true);
    try {
      await exportFransorMonthlyRecapToWord(presenter.month, formatMonthFr(presenter.month), presenter.recap);
      onToast?.("Document Word exporté.");
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Export Word impossible.");
    } finally {
      setExportRecapLoading(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="fransor-help-row">
          <h3>Suivi quotidien</h3>
          <button
            type="button"
            className="btn-light action-icon-btn"
            title="Comment ça marche"
            aria-label="Comment ça marche"
            onClick={() => setShowHelpModal(true)}
          >
            <CircleHelp size={14} />
          </button>
        </div>
        <div className="row fransor-main-row">
          <label className="fransor-month-filter">
            <span>Mois :</span>
            <div className="fransor-month-input-row">
              <button
                type="button"
                className="btn-light action-icon-btn"
                title="Mois précédent"
                aria-label="Mois précédent"
                onClick={() => presenter.setMonth(shiftMonth(presenter.month, -1))}
              >
                <ChevronDown size={14} />
              </button>
              <input type="month" value={presenter.month} onChange={(e) => presenter.setMonth(e.target.value)} />
              <button
                type="button"
                className="btn-light action-icon-btn"
                title="Mois suivant"
                aria-label="Mois suivant"
                onClick={() => presenter.setMonth(shiftMonth(presenter.month, 1))}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="btn-light action-icon-btn"
                title="Revenir au mois en cours"
                aria-label="Revenir au mois en cours"
                onClick={() => presenter.setMonth(getLocalIsoDate().slice(0, 7))}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </label>
          <div className="fransor-type-switch fransor-switch-right">
            <button
              type="button"
              className={dayViewMode === "missing" ? "tab active" : "tab"}
              onClick={() => setDayViewMode("missing")}
            >
              À compléter
            </button>
            <button
              type="button"
              className={dayViewMode === "filled" ? "tab active" : "tab"}
              onClick={() => setDayViewMode("filled")}
            >
              Renseignées
            </button>
          </div>
          {presenter.loading ? <span className="muted">Chargement…</span> : null}
        </div>
        <div className="fransor-today-row">
          <div className="fransor-today-entry-row">
            <span>Journée :</span>
            {todayIsPlannedDay ? (
              <button
                type="button"
                className="btn-light fransor-missing-day-btn fransor-today-day-btn"
                onClick={() =>
                  openEntryModal(
                    todayIso,
                    todayStatus.hasOpening,
                    todayStatus.hasClosing,
                    todayStatus.openingResponsableId,
                    todayStatus.closingResponsableId
                  )
                }
              >
                {formatDateFr(todayIso)}
                <span className="fransor-day-badges" aria-hidden="true">
                  <span className={`fransor-day-badge ${todayStatus.hasOpening ? "ok" : "missing"}`}>O</span>
                  <span className={`fransor-day-badge ${todayStatus.hasClosing ? "ok" : "missing"}`}>F</span>
                </span>
              </button>
            ) : (
              <span className="muted">Non prévue ({todayNonPlannedReason})</span>
            )}
          </div>
          <button type="button" className="btn-light" onClick={() => setShowClosureModal(true)}>
            Périodes exceptionnelles
          </button>
        </div>
        <div className="fransor-missing-days-list">
          <div className="fransor-calendar-grid" aria-label="Journées du mois">
            {monthCalendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="fransor-calendar-week">
                {week.map((dayIso, dayIndex) => {
                  if (!dayIso) return <div key={`empty-${weekIndex}-${dayIndex}`} className="fransor-calendar-cell empty" aria-hidden="true" />;
                  const item = displayedDaysByDate.get(dayIso);
                  if (!item) return <div key={dayIso} className="fransor-calendar-cell empty" aria-hidden="true" />;
                  return (
                    <div key={dayIso} className="fransor-calendar-cell">
                      <button
                        type="button"
                        className="btn-light fransor-missing-day-btn fransor-calendar-day-btn"
                        onClick={() =>
                          openEntryModal(
                            item.date,
                            dayViewMode === "missing" ? item.missingOpening : true,
                            dayViewMode === "missing" ? item.missingClosing : true,
                            item.openingResponsableId || "",
                            item.closingResponsableId || ""
                          )
                        }
                        title={
                          item.missingOpening && item.missingClosing
                            ? "Ouverture et fermeture à saisir"
                            : item.missingOpening
                              ? "Ouverture à saisir"
                              : "Fermeture à saisir"
                        }
                      >
                        {formatDateFr(item.date)}
                        <span className="fransor-day-badges" aria-hidden="true">
                          <span className={`fransor-day-badge ${item.missingOpening ? "missing" : "ok"}`}>O</span>
                          <span className={`fransor-day-badge ${item.missingClosing ? "missing" : "ok"}`}>F</span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {!displayedDays.length && (
              <div className="fransor-calendar-empty" role="status" aria-live="polite">
                {dayViewMode === "missing" ? "Aucune journée manquante sur le mois." : "Aucune journée renseignée sur le mois."}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <h3>Récap mensuel</h3>
          <div className="row-actions">
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Exporter le récap au format Word (modèle fransor-recap-template.docx)"
              aria-label="Exporter le récap mensuel en Word"
              disabled={exportRecapLoading}
              onClick={() => void exportRecapWord()}
            >
              <FileDown size={16} aria-hidden />
            </button>
            <button type="button" className="btn-light" onClick={() => void copyRecapText()}>
              Copier le récap
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Responsable</th>
              <th>Ouvertures</th>
              <th>Fermetures</th>
              <th>Total actions</th>
            </tr>
          </thead>
          <tbody>
            {presenter.recap.map((row) => (
              <tr key={row.responsableId}>
                <td>{row.responsableName}</td>
                <td>{row.ouvertures}</td>
                <td>{row.fermetures}</td>
                <td>{row.totalActions}</td>
              </tr>
            ))}
            {!!presenter.recap.length && (
              <tr>
                <td>
                  <strong>Total global</strong>
                </td>
                <td>
                  <strong>{recapTotals.totalOuvertures}</strong>
                </td>
                <td>
                  <strong>{recapTotals.totalFermetures}</strong>
                </td>
                <td>
                  <strong>{recapTotals.totalActions}</strong>
                </td>
              </tr>
            )}
            {!presenter.recap.length && (
              <tr>
                <td colSpan={4} className="muted">
                  Aucun responsable actif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Ajouter une saisie Fransor</h3>
            <div className="form">
              <label>
                Date
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </label>
              <label>
                Action : Ouverture
                <div className="fransor-entry-row">
                  <button
                    type="button"
                    className={
                      entryOuvertureDone
                        ? "mc-btn-primary fransor-entry-action-btn"
                        : "btn-light fransor-entry-action-btn"
                    }
                    onClick={() => setEntryOuvertureDone((prev) => !prev)}
                    title="Activer ou désactiver la saisie d’ouverture"
                    aria-pressed={entryOuvertureDone}
                  >
                    Ouverture
                  </button>
                  <select
                    value={entryOuvertureResponsableId}
                    onChange={(e) => setEntryOuvertureResponsableId(e.target.value)}
                    disabled={!entryOuvertureDone}
                  >
                    <option value="">Responsable ouverture</option>
                    {presenter.responsables.map((resp) => (
                      <option key={resp.id} value={resp.id}>
                        {resp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                Action : Fermeture
                <div className="fransor-entry-row">
                  <button
                    type="button"
                    className={
                      entryFermetureDone
                        ? "mc-btn-primary fransor-entry-action-btn"
                        : "btn-light fransor-entry-action-btn"
                    }
                    onClick={() => setEntryFermetureDone((prev) => !prev)}
                    title="Activer ou désactiver la saisie de fermeture"
                    aria-pressed={entryFermetureDone}
                  >
                    Fermeture
                  </button>
                  <select
                    value={entryFermetureResponsableId}
                    onChange={(e) => setEntryFermetureResponsableId(e.target.value)}
                    disabled={!entryFermetureDone}
                  >
                    <option value="">Responsable fermeture</option>
                    {presenter.responsables.map((resp) => (
                      <option key={resp.id} value={resp.id}>
                        {resp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={() => setShowAddModal(false)}>
                Annuler
              </button>
              <button type="button" onClick={() => void submitQuickEntry()}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
      {showClosureModal && (
        <div className="modal-overlay">
          <div className="modal fransor-help-modal">
            <div className="row">
              <h3>Périodes exceptionnelles (ouvertures et fermetures)</h3>
              <button type="button" className="btn-light" onClick={() => setShowClosureModal(false)}>
                Fermer
              </button>
            </div>
            <div className="fransor-closure-help">
              <h4>Aide rapide</h4>
              <ol>
                <li>
                  <strong>Créer une période :</strong> renseigner la date de début, la date de fin (optionnelle), le type
                  (Ouverture/Fermeture), puis un motif clair.
                </li>
                <li>
                  <strong>Enregistrer :</strong> cliquer sur <strong>Enregistrer exception</strong> pour appliquer la période
                  au calendrier.
                </li>
                <li>
                  <strong>Modifier :</strong> utiliser l'icône crayon dans le tableau, ajuster les valeurs, puis
                  réenregistrer.
                </li>
                <li>
                  <strong>Supprimer :</strong> utiliser l'icône suppression, puis saisir un motif de suppression
                  obligatoire.
                </li>
              </ol>
            </div>
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
              <select value={closureMode} onChange={(e) => setClosureMode(e.target.value === "OPEN" ? "OPEN" : "CLOSED")}>
                <option value="CLOSED">Fermeture</option>
                <option value="OPEN">Ouverture</option>
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
              <button
                type="button"
                disabled={!isClosureFormValid}
                onClick={async () => {
                  if (!isClosureFormValid) return;
                  try {
                    await presenter.upsertClosure({
                      id: editingClosureId || undefined,
                      startDate: closureStartDate,
                      endDate: closureEndDate || undefined,
                      label: closureLabel,
                      mode: closureMode
                    });
                    setClosureStartDate("");
                    setClosureEndDate("");
                    setClosureLabel("");
                    setClosureMode("CLOSED");
                    setEditingClosureId(null);
                    onToast?.("Exception calendrier enregistrée.");
                  } catch (error) {
                    onToast?.(error instanceof Error ? error.message : "Ajout impossible.");
                  }
                }}
              >
                {editingClosureId ? "Mettre à jour exception" : "Enregistrer exception"}
              </button>
            </div>
            {presenter.closures.length > 0 && (
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
                  {presenter.closures.map((closure) => (
                    <tr key={closure.id}>
                      <td>{formatDateFr(closure.startDate)}</td>
                      <td>{formatDateFr(closure.endDate)}</td>
                      <td>{closure.mode === "OPEN" ? "Ouverture" : "Fermeture"}</td>
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
          </div>
        </div>
      )}
      {showHelpModal && (
        <div className="modal-overlay">
          <div className="modal fransor-help-modal">
            <div className="row">
              <h3>Comment utiliser l'accompagnement Fransor</h3>
            </div>
            <p>
              Cette page permet de suivre les ouvertures et fermetures quotidiennes du client <strong>Fransor</strong>, puis de
              visualiser le récapitulatif mensuel par responsable.
            </p>
            <h4>1. Choisir la période</h4>
            <ul>
              <li>
                <strong>Sélection du mois :</strong> Utilisez les chevrons (<code>^</code>) pour naviguer entre les mois.
              </li>
              <li>
                <strong>Réinitialisation :</strong> Cliquez sur l'icône de flèche circulaire (reset) pour revenir
                instantanément au mois en cours.
              </li>
            </ul>
            <div className="fransor-help-fake-row">
              <button type="button" className="btn-light" disabled>
                Mois :
              </button>
              <button type="button" className="btn-light" disabled>
                <ChevronDown size={14} />
              </button>
              <button type="button" className="btn-light" disabled>
                avril 2026
              </button>
              <button type="button" className="btn-light" disabled>
                <ChevronUp size={14} />
              </button>
              <button type="button" className="btn-light" disabled>
                <RotateCcw size={14} />
              </button>
            </div>
            <h4>2. Saisir ou modifier une journée</h4>
            <ul>
              <li>
                <strong>Accès :</strong> Cliquez directement sur le bouton d'une date (ex: <code>lun. 06/04/2026</code>)
                pour ouvrir le formulaire de saisie.
              </li>
              <li>
                <strong>Modification :</strong> Si une entrée existe déjà, la modale s'ouvrira avec les informations
                pré-remplies pour vous permettre de les corriger.
              </li>
              <li>
                <strong>Statut :</strong> Les boutons en haut à droite (<strong>À compléter</strong> / <strong>Renseignées</strong>)
                servent de légende ou de filtre pour identifier rapidement l'état d'avancement du mois.
              </li>
            </ul>
            <div className="fransor-help-fake-row">
              <button type="button" className="tab active" disabled>
                À compléter
              </button>
              <button type="button" className="tab" disabled>
                Renseignées
              </button>
              <button type="button" className="btn-light" disabled>
                Journée : lun. 27/04/2026
              </button>
            </div>
            <h4>3. Gérer les périodes exceptionnelles</h4>
            <p>
              Cliquez sur le bouton <strong>Périodes exceptionnelles</strong> pour déclarer des journées ou des événements
              inhabituels (jours fériés, fermetures spéciales, etc.) via une interface dédiée.
            </p>
            <h4>4. Consulter le Récap mensuel</h4>
            <ul>
              <li>Le tableau en bas de page compile automatiquement les données saisies.</li>
              <li>
                <strong>Action :</strong> Utilisez le bouton <strong>Copier le récap</strong> pour placer les données dans
                votre presse-papier et les coller facilement dans un rapport externe.
              </li>
            </ul>
            <p>
              Le calendrier reste aligné en 6 lignes pour un affichage stable d'un mois à l'autre, même quand peu de
              journées sont renseignées.
            </p>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={() => setShowHelpModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteClosureId && (
        <div className="modal-overlay">
          <div className="modal">
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
                onClick={() => {
                  if (!deleteClosureId || !deleteClosureReason.trim()) return;
                  void presenter.deleteClosure(deleteClosureId, deleteClosureReason.trim());
                  setDeleteClosureId(null);
                  setDeleteClosureReason("");
                }}
              >
                Confirmer suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
