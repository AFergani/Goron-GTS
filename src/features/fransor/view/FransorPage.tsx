/**
 * Page Fransor : suivi quotidien ouvertures/fermetures client, calendrier et récap mensuel.
 *
 * Règles d’affichage : jours ouvrés (hors week-end et fériés) sauf exception calendrier
 * (mode OPEN force ouvert, CLOSED force fermé). Saisie par responsable, récap par mois,
 * copie du récap mensuel, gestion des périodes exceptionnelles.
 *
 * Montée depuis `AppShell` si la permission page `fransor` est active.
 * Responsables : référentiel géré dans Paramètres ; ici lecture + saisie uniquement.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { useFransorPresenter } from "../presenter/useFransorPresenter";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { formatSiteSelectedLabel } from "../../mainCourante/model/siteSearch";
import type { FransorClosure, Role, SiteRef } from "../../../types";


/** Jours ISO du mois `YYYY-MM` */
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

type FransorDisplayedDay = {
  date: string;
  missingOpening: boolean;
  missingClosing: boolean;
  openingResponsableId?: string;
  closingResponsableId?: string;
};

function formatDateFr(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Libellé carte calendrier (mois déjà indiqué dans le sélecteur). Ex. « Lundi 04 » ou « Mer 04 » en compact. */
function formatDayCardLabel(isoDate: string, compact = false) {
  const date = new Date(`${isoDate}T00:00:00`);
  const weekdayRaw = date
    .toLocaleDateString("fr-FR", { weekday: compact ? "short" : "long" })
    .replace(/\.$/, "");
  const weekday = `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}`;
  const dayNum = date.toLocaleDateString("fr-FR", { day: "2-digit" });
  return `${weekday} ${dayNum}`;
}

function formatDayCardAriaLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatMonthFr(month: string) {
  const [year, monthPart] = month.split("-").map((v) => Number(v));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1, 1);
  const text = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Libellé court du mois (ex. « Mai »). */
function formatMonthShortFr(month: string) {
  const [year, monthPart] = month.split("-").map((v) => Number(v));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1, 1);
  const text = date.toLocaleDateString("fr-FR", { month: "short" }).replace(/\.$/, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shiftMonth(month: string, delta: number) {
  const [year, monthPart] = month.split("-").map((v) => Number(v));
  if (!year || !monthPart) return month;
  const date = new Date(year, monthPart - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Les 12 clés `YYYY-MM` d'une année civile. */
function getYearMonthKeys(year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const monthPart = String(index + 1).padStart(2, "0");
    return `${year}-${monthPart}`;
  });
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatClosureModeLabel(mode: "CLOSED" | "OPEN") {
  return mode === "OPEN" ? "Ouvert" : "Fermer";
}

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
  const [closureModalYear, setClosureModalYear] = useState(() => new Date().getFullYear());
  const [closureModalSelectedMonth, setClosureModalSelectedMonth] = useState("");
  const [closuresByMonth, setClosuresByMonth] = useState<Record<string, FransorClosure[]>>({});
  const [closureYearLoading, setClosureYearLoading] = useState(false);

  const [compactDayLabels, setCompactDayLabels] = useState(false);
  const [fransorSiteLabel, setFransorSiteLabel] = useState("");
  const presenter = useFransorPresenter({ requesterRole, requesterUsername, onToast });

  useEffect(() => {
    let cancelled = false;
    void gtsApiClient.listSites({ requesterRole }).then((sites: SiteRef[]) => {
      if (cancelled) return;
      const match = sites.find((s) => s.code.toUpperCase() === "FRANSOR" || s.name.toUpperCase().includes("FRANSOR"));
      if (match) setFransorSiteLabel(formatSiteSelectedLabel(match));
    });
    return () => { cancelled = true; };
  }, [requesterRole]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 680px)");
    const sync = () => setCompactDayLabels(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* --- Dérivés calendrier : exceptions, fériés, jour courant, jours à compléter --- */
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

  const refreshClosureYear = useCallback(async () => {
    setClosureYearLoading(true);
    try {
      const results = await Promise.all(
        closureModalYearMonths.map((month) => gtsApiClient.listFransorClosures({ requesterRole, month }))
      );
      const byMonth: Record<string, FransorClosure[]> = {};
      closureModalYearMonths.forEach((month, index) => {
        byMonth[month] = results[index];
      });
      setClosuresByMonth(byMonth);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Erreur de chargement des périodes.", "error");
    } finally {
      setClosureYearLoading(false);
    }
  }, [closureModalYearMonths, onToast, requesterRole]);

  useEffect(() => {
    if (!showClosureModal) return;
    void refreshClosureYear();
  }, [showClosureModal, refreshClosureYear, presenter.closures]);

  const selectedMonthClosures = useMemo(() => {
    if (!closureModalSelectedMonth) return [];
    return (closuresByMonth[closureModalSelectedMonth] ?? []).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [closureModalSelectedMonth, closuresByMonth]);

  const openClosureModal = () => {
    const pageYear = Number(presenter.month.slice(0, 4));
    setClosureModalYear(Number.isFinite(pageYear) ? pageYear : new Date().getFullYear());
    setClosureModalSelectedMonth(presenter.month);
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
    const currentMonth = getLocalIsoDate().slice(0, 7);
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
        setClosureModalSelectedMonth(savedMonth);
        setClosureModalYear(Number(savedMonth.slice(0, 4)));
      }
      onToast?.("Exception calendrier enregistrée.");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Ajout impossible.", "error");
    }
  };

  /* --- Échap : fermer modales ouverte (saisie, exceptions, suppression) --- */
  useEffect(() => {
    const hasOpenModal = showAddModal || showClosureModal || Boolean(deleteClosureId);
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteClosureId, showAddModal, showClosureModal]);

  /** Ouvre la modale de saisie (jour courant ou date calendrier, états préremplis) */
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
        <div className="row fransor-help-row">
          <h3>Suivi quotidien</h3>
          {fransorSiteLabel ? (
            <SiteDisplayCopyButton siteLabel={fransorSiteLabel} onNotify={onToast} className="btn-light fransor-site-copy-btn" />
          ) : null}
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
          <div className="modal fransor-help-modal fransor-closure-modal">
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
                    const count = closuresByMonth[month]?.length ?? 0;
                    const isSelected = closureModalSelectedMonth === month;
                    const isPageMonth = presenter.month === month;
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
                          {closureYearLoading ? "…" : count}
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
                  <button type="button" onClick={() => void submitClosureException()}>
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
                {!closureYearLoading && closureModalSelectedMonth && selectedMonthClosures.length === 0 ? (
                  <p className="muted fransor-closure-empty">
                    Aucune période enregistrée pour {formatMonthFr(closureModalSelectedMonth)}.
                  </p>
                ) : null}
              </section>
            </div>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={() => setShowClosureModal(false)}>
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
