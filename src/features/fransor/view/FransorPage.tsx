/**
 * Page Fransor : suivi quotidien ouvertures/fermetures client, calendrier et récap mensuel.
 *
 * Règles d’affichage : jours ouvrés (hors week-end et fériés) sauf exception calendrier
 * (mode OPEN force ouvert, CLOSED force fermé). Saisie par responsable, récap par mois,
 * copie du récap mensuel, gestion des périodes exceptionnelles.
 *
 * Montée depuis `AppShell` si la permission page `fransor` est active.
 * Calendrier : `fransorCalendar.ts`. Modales : `FransorEntryModal`, `FransorClosureExceptionsModal`.
 * Responsables : référentiel géré dans Paramètres ; ici lecture + saisie uniquement.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { useFransorPresenter } from "../presenter/useFransorPresenter";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import type { FransorClosure, Role } from "../../../types";
import {
  formatDayCardAriaLabel,
  formatDayCardLabel,
  formatMonthFr,
  getDaysInMonth,
  getWeekendDayLabel,
  getWeekdayOffsetFromMonday,
  getYearMonthKeys,
  isWeekend,
  shiftMonth,
  type FransorDisplayedDay
} from "../model/fransorCalendar";
import { FransorEntryModal } from "../components/FransorEntryModal";
import { FransorClosureExceptionsModal } from "../components/FransorClosureExceptionsModal";
import { getLocalDateIso } from "../../common/utils/localDateIso";

/** Libellé fixe du bouton de copie site (code métier entre parenthèses, hors référentiel). */
const FRANSOR_SITE_COPY_LABEL = "FRANSOR INDUSTRIE (FRANSOR)";


export function FransorPage({
  requesterRole,
  requesterUsername,
  onToast
}: {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string, variant?: "success" | "warning" | "error") => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryDate, setEntryDate] = useState(getLocalDateIso);
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
  const [closureModalYear, setClosureModalYear] = useState(() => new Date().getFullYear());
  const [closureModalSelectedMonth, setClosureModalSelectedMonth] = useState("");
  const [closuresByMonth, setClosuresByMonth] = useState<Record<string, FransorClosure[]>>({});
  const [closureYearLoading, setClosureYearLoading] = useState(false);
  const closureYearLoadGen = useRef(0);
  const addBaselineRef = useRef("");

  const [compactDayLabels, setCompactDayLabels] = useState(false);
  const presenter = useFransorPresenter({ requesterRole, requesterUsername, onToast });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 680px)");
    const sync = () => setCompactDayLabels(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* --- Dérivés calendrier : exceptions, fériés, jour courant, jours à compléter --- */
  const todayIso = getLocalDateIso();
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
      /* Jours futurs exclus ; le jour J est inclus (comme la ligne « Journée »). */
      if (dayIso > todayIso) continue;
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
  const displayedDaysByDate = useMemo(() => {
    const map = new Map<string, FransorDisplayedDay>();
    for (const item of dayStatuses) {
      map.set(item.date, item);
    }
    return map;
  }, [dayStatuses]);
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
    while (weeks.length > 0 && weeks[weeks.length - 1].every((cell) => !cell)) {
      weeks.pop();
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

  const monthClosuresCount = presenter.closures.length;
  const monthClosuresAriaSummary =
    monthClosuresCount === 0
      ? "Aucune période exceptionnelle sur ce mois"
      : monthClosuresCount === 1
        ? "1 période exceptionnelle sur ce mois"
        : `${monthClosuresCount} périodes exceptionnelles sur ce mois`;

  const closureModalYearMonths = useMemo(() => getYearMonthKeys(closureModalYear), [closureModalYear]);

  const refreshClosureYear = useCallback(
    async (year: number) => {
      if (!Number.isFinite(year)) return;
      const months = getYearMonthKeys(year);
      const gen = ++closureYearLoadGen.current;
      setClosureYearLoading(true);
      try {
        const results = await Promise.all(
          months.map((month) => gtsApiClient.listFransorClosures({ requesterRole, month }))
        );
        if (gen !== closureYearLoadGen.current) return;
        const byMonth: Record<string, FransorClosure[]> = {};
        months.forEach((month, index) => {
          byMonth[month] = results[index];
        });
        setClosuresByMonth((previous) => ({ ...previous, ...byMonth }));
      } catch (error) {
        if (gen !== closureYearLoadGen.current) return;
        onToast?.(error instanceof Error ? error.message : "Erreur de chargement des périodes.", "error");
      } finally {
        if (gen === closureYearLoadGen.current) setClosureYearLoading(false);
      }
    },
    [onToast, requesterRole]
  );

  useEffect(() => {
    if (!showClosureModal) return;
    void refreshClosureYear(closureModalYear);
  }, [showClosureModal, closureModalYear, refreshClosureYear]);

  const selectedMonthClosures = useMemo(() => {
    if (!closureModalSelectedMonth) return [];
    return (closuresByMonth[closureModalSelectedMonth] ?? []).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [closureModalSelectedMonth, closuresByMonth]);

  const openClosureModal = () => {
    const pageYear = Number(presenter.month.slice(0, 4));
    const year = Number.isFinite(pageYear) ? pageYear : new Date().getFullYear();
    setClosureModalYear(year);
    setClosureModalSelectedMonth(presenter.month);
    setClosuresByMonth((previous) => ({
      ...previous,
      [presenter.month]: presenter.closures
    }));
    setShowClosureModal(true);
  };

  const changeClosureModalYear = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < 2000 || nextYear > 2100) return;
    setClosureModalYear(nextYear);
    setClosureModalSelectedMonth((previous) => {
      const monthPart = (previous || presenter.month).slice(5, 7);
      return `${nextYear}-${monthPart}`;
    });
  };

  const resetClosureModalToCurrentMonth = () => {
    const currentMonth = getLocalDateIso().slice(0, 7);
    const currentYear = Number(currentMonth.slice(0, 4));
    setClosureModalYear(Number.isFinite(currentYear) ? currentYear : new Date().getFullYear());
    setClosureModalSelectedMonth(currentMonth);
  };

  /* --- Récap texte (copie presse-papiers) --- */
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
  const submitClosureException = async () => {
    const startDate = closureStartDate.trim();
    const label = closureLabel.trim();
    if (!startDate) {
      onToast?.("La date de début est obligatoire.", "error");
      return;
    }
    if (!label) {
      onToast?.("Le motif est obligatoire.", "error");
      return;
    }
    if (closureEndDate.trim() && closureEndDate < startDate) {
      onToast?.("La date de fin ne peut pas être antérieure à la date de début.", "error");
      return;
    }
    try {
      await presenter.upsertClosure({
        id: editingClosureId || undefined,
        startDate,
        endDate: closureEndDate.trim() || undefined,
        label,
        mode: closureMode
      });
      setClosureStartDate("");
      setClosureEndDate("");
      setClosureLabel("");
      setClosureMode("CLOSED");
      setEditingClosureId(null);
      if (showClosureModal) {
        const savedMonth = startDate.slice(0, 7);
        const savedYear = Number(savedMonth.slice(0, 4));
        setClosureModalSelectedMonth(savedMonth);
        setClosureModalYear(savedYear);
        if (savedYear === closureModalYear) {
          await refreshClosureYear(savedYear);
        }
      }
      onToast?.("Exception calendrier enregistrée.");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Ajout impossible.", "error");
    }
  };

  /* --- Échap : fermer la modale du dessus ; confirmation si saisie commencée --- */
  const closeAddModal = useCallback(() => setShowAddModal(false), []);
  const addDirty =
    JSON.stringify({
      date: entryDate,
      ouv: entryOuvertureDone,
      ferm: entryFermetureDone,
      ouvId: entryOuvertureResponsableId,
      fermId: entryFermetureResponsableId
    }) !== addBaselineRef.current;
  const addCloseGuard = useCreateModalCloseGuard({
    enabled: showAddModal,
    isDirty: addDirty,
    onClose: closeAddModal
  });
  const closeClosureModal = useCallback(() => setShowClosureModal(false), []);
  const closureDirty = Boolean(closureStartDate || closureEndDate || closureLabel.trim() || editingClosureId);
  const closureCloseGuard = useCreateModalCloseGuard({
    enabled: showClosureModal && !deleteClosureId,
    isDirty: closureDirty,
    onClose: closeClosureModal
  });

  /** Ouvre la modale de saisie (jour courant ou date calendrier, états préremplis) */
  const openEntryModal = (
    prefilledDate?: string,
    defaultOuverture = false,
    defaultFermeture = false,
    prefilledOpeningResponsableId = "",
    prefilledClosingResponsableId = ""
  ) => {
    setEntryDate(prefilledDate || getLocalDateIso());
    setEntryOuvertureResponsableId(prefilledOpeningResponsableId);
    setEntryFermetureResponsableId(prefilledClosingResponsableId);
    setEntryOuvertureDone(defaultOuverture);
    setEntryFermetureDone(defaultFermeture);
    addBaselineRef.current = JSON.stringify({
      date: prefilledDate || getLocalDateIso(),
      ouv: defaultOuverture,
      ferm: defaultFermeture,
      ouvId: prefilledOpeningResponsableId,
      fermId: prefilledClosingResponsableId
    });
    setShowAddModal(true);
  };

  const submitQuickEntry = async () => {
    if (!entryDate) {
      onToast?.("Date obligatoire.", "warning");
      return;
    }
    if (!entryOuvertureDone && !entryFermetureDone) {
      onToast?.("Sélectionner au moins une action.", "warning");
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
      onToast?.("Responsable obligatoire pour l'ouverture.", "warning");
      return;
    }
    if (entryFermetureDone && !entryFermetureResponsableId) {
      onToast?.("Responsable obligatoire pour la fermeture.", "warning");
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
      onToast?.(error instanceof Error ? error.message : "Enregistrement impossible.", "error");
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
      onToast?.("Impossible de copier le récap.", "error");
    }
  };

  return (
    <>
      <section className="panel">
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
                onClick={() => presenter.setMonth(getLocalDateIso().slice(0, 7))}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </label>
          <div className="fransor-main-row-actions">
            {presenter.loading ? <span className="muted">Chargement…</span> : null}
            <SiteDisplayCopyButton
              siteLabel={FRANSOR_SITE_COPY_LABEL}
              onNotify={onToast}
              className="btn-light fransor-site-copy-btn"
            />
          </div>
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
                {formatDayCardLabel(todayIso, compactDayLabels)}
                <span className="fransor-day-badges" aria-hidden="true">
                  <span className={`fransor-day-badge ${todayStatus.hasOpening ? "ok" : "missing"}`}>O</span>
                  <span className={`fransor-day-badge ${todayStatus.hasClosing ? "ok" : "missing"}`}>F</span>
                </span>
              </button>
            ) : (
              <span className="muted">Non prévue ({todayNonPlannedReason})</span>
            )}
          </div>
          <div className="fransor-today-actions">
            <button
              type="button"
              className="btn-light fransor-closures-btn"
              onClick={openClosureModal}
              title={
                monthClosuresCount > 0
                  ? `${monthClosuresAriaSummary} (${formatMonthFr(presenter.month)})`
                  : `Gérer les périodes exceptionnelles (${formatMonthFr(presenter.month)})`
              }
              aria-label={
                monthClosuresCount > 0
                  ? `Périodes exceptionnelles, ${monthClosuresAriaSummary}`
                  : "Périodes exceptionnelles"
              }
            >
              <span className="fransor-closures-btn-label">Périodes exceptionnelles</span>
              {monthClosuresCount > 0 ? (
                <span className="fransor-closures-count-badge" aria-hidden="true">
                  {monthClosuresCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
        <div className="fransor-missing-days-list">
          <div className="fransor-calendar-grid" aria-label="Journées du mois">
            {monthCalendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="fransor-calendar-week">
                {week.map((dayIso, dayIndex) => {
                  if (!dayIso) {
                    return (
                      <div
                        key={`pad-${weekIndex}-${dayIndex}`}
                        className="fransor-calendar-cell fransor-calendar-cell--pad"
                        aria-hidden="true"
                      />
                    );
                  }
                  const item = displayedDaysByDate.get(dayIso);
                  if (!item) {
                    return <div key={dayIso} className="fransor-calendar-cell fransor-calendar-cell--void" aria-hidden="true" />;
                  }
                  return (
                    <div key={item.date} className="fransor-calendar-cell">
                      <button
                        type="button"
                        className="btn-light fransor-missing-day-btn fransor-calendar-day-btn"
                        onClick={() =>
                          openEntryModal(
                            item.date,
                            !item.missingOpening,
                            !item.missingClosing,
                            item.openingResponsableId || "",
                            item.closingResponsableId || ""
                          )
                        }
                        title={
                          item.missingOpening && item.missingClosing
                            ? "Ouverture et fermeture à saisir"
                            : item.missingOpening
                              ? "Ouverture à saisir"
                              : item.missingClosing
                                ? "Fermeture à saisir"
                                : "Modifier la saisie du jour"
                        }
                        aria-label={formatDayCardAriaLabel(item.date)}
                      >
                        <span className="fransor-calendar-day-label">
                          {formatDayCardLabel(item.date, compactDayLabels)}
                        </span>
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
            {!dayStatuses.length && (
              <div className="fransor-calendar-empty" role="status" aria-live="polite">
                Aucune journée ouvrée à afficher sur ce mois.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <h3>Récap mensuel</h3>
          <div className="row-actions">
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

      <FransorEntryModal
        isOpen={showAddModal}
        entryDate={entryDate}
        entryOuvertureDone={entryOuvertureDone}
        entryFermetureDone={entryFermetureDone}
        entryOuvertureResponsableId={entryOuvertureResponsableId}
        entryFermetureResponsableId={entryFermetureResponsableId}
        responsables={presenter.responsables}
        onRequestClose={addCloseGuard.requestClose}
        onSubmit={() => void submitQuickEntry()}
        setEntryDate={setEntryDate}
        setEntryOuvertureDone={setEntryOuvertureDone}
        setEntryFermetureDone={setEntryFermetureDone}
        setEntryOuvertureResponsableId={setEntryOuvertureResponsableId}
        setEntryFermetureResponsableId={setEntryFermetureResponsableId}
      />
      <FransorClosureExceptionsModal
        isOpen={showClosureModal}
        pageMonth={presenter.month}
        closureModalYear={closureModalYear}
        closureModalYearMonths={closureModalYearMonths}
        closureModalSelectedMonth={closureModalSelectedMonth}
        closuresByMonth={closuresByMonth}
        closureYearLoading={closureYearLoading}
        selectedMonthClosures={selectedMonthClosures}
        closureStartDate={closureStartDate}
        closureEndDate={closureEndDate}
        closureLabel={closureLabel}
        closureMode={closureMode}
        editingClosureId={editingClosureId}
        deleteClosureId={deleteClosureId}
        deleteClosureReason={deleteClosureReason}
        onRequestClose={closureCloseGuard.requestClose}
        changeClosureModalYear={changeClosureModalYear}
        resetClosureModalToCurrentMonth={resetClosureModalToCurrentMonth}
        setClosureModalSelectedMonth={setClosureModalSelectedMonth}
        setClosureStartDate={setClosureStartDate}
        setClosureEndDate={setClosureEndDate}
        setClosureLabel={setClosureLabel}
        setClosureMode={setClosureMode}
        setEditingClosureId={setEditingClosureId}
        setDeleteClosureId={setDeleteClosureId}
        setDeleteClosureReason={setDeleteClosureReason}
        onSubmitException={() => void submitClosureException()}
        onConfirmDelete={() => {
          if (!deleteClosureId || !deleteClosureReason.trim()) return;
          const id = deleteClosureId;
          const reason = deleteClosureReason.trim();
          setDeleteClosureId(null);
          setDeleteClosureReason("");
          void (async () => {
            await presenter.deleteClosure(id, reason);
            if (showClosureModal) await refreshClosureYear(closureModalYear);
          })();
        }}
      />

      <DiscardConfirmModal
        isOpen={addCloseGuard.showDiscardConfirm}
        onCancel={addCloseGuard.cancelDiscard}
        onConfirm={addCloseGuard.confirmDiscardAndClose}
      />
      <DiscardConfirmModal
        isOpen={closureCloseGuard.showDiscardConfirm}
        onCancel={closureCloseGuard.cancelDiscard}
        onConfirm={closureCloseGuard.confirmDiscardAndClose}
      />
    </>
  );
}
