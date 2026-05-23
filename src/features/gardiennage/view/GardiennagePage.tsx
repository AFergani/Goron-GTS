/**
 * Page Gardiennage : onglets « Du jour » (navigation date) et « Planification » (liste filtrée).
 *
 * Orchestration presenters + modales création/édition/clôture, exports Excel/Word,
 * filtres statut/famille/prestataire. Mode d’affichage jour/liste mémorisé en localStorage.
 * Montée depuis `AppShell` si permission `gardiennage`.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { Role } from "../../../types";
import type { GardiennageEntry } from "../model/gardiennage.types";
import { useGardiennagePresenter } from "../presenter/useGardiennagePresenter";
import { useGardiennageReferenceData } from "../presenter/useGardiennageReferenceData";
import { GardiennageEntryModal, type GardiennageModalMode } from "../components/GardiennageEntryModal";
import { GardiennageTable } from "../components/GardiennageTable";
import { GardiennageCloseModal } from "../components/GardiennageCloseModal";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { exportGardiennageToExcel } from "../export/gardiennageExcelExport";
import { exportGardiennageEntryToWord } from "../export/gardiennageWordExport";

const GARDIENNAGE_DISPLAY_MODE_STORAGE_KEY = "gardiennage.displayMode.v1";

type GardiennagePageProps = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
};

/** Retourne la date locale au format YYYY-MM-DD (sans décalage UTC). */
function getTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Décale une date ISO locale de `delta` jours. */
function shiftDate(iso: string, delta: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLong(iso: string): string {
  if (!iso) return "";
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

export function GardiennagePage({
  requesterRole,
  requesterUsername,
  onToast,
  onNavigateToLinkedIntervention,
  onNavigateToLinkedRonde
}: GardiennagePageProps) {

  const presenter = useGardiennagePresenter({ requesterRole, requesterUsername, onToast });
  const references = useGardiennageReferenceData(requesterRole, requesterUsername, onToast);

  const [displayMode, setDisplayMode] = useState<"day" | "list">(() => {
    if (typeof window === "undefined") return "day";
    const raw = window.localStorage.getItem(GARDIENNAGE_DISPLAY_MODE_STORAGE_KEY);
    return raw === "list" ? "list" : "day";
  });

  /* ── Onglet Du jour ── */
  const [selectedDate, setSelectedDate] = useState(getTodayIso);
  const isSelectedToday = selectedDate === getTodayIso();

  /* ── Onglet Planification — filtres ── */
  const planifFilters = useTableFilters();
  const [statusFilter, setStatusFilterRaw] = useState("");
  const [familyFilter, setFamilyFilterRaw] = useState("");
  const [intervenantFilter, setIntervenantFilterRaw] = useState("");
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); planifFilters.setCurrentPage(1); };
  const setFamilyFilter = (v: string) => { setFamilyFilterRaw(v); planifFilters.setCurrentPage(1); };
  const setIntervenantFilter = (v: string) => { setIntervenantFilterRaw(v); planifFilters.setCurrentPage(1); };

  /* Modale principale (création / édition) */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<GardiennageModalMode>("create");
  const [activeEntry, setActiveEntry] = useState<GardiennageEntry | null>(null);

  /* Modale de clôture rapide */
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeModalEntry, setCloseModalEntry] = useState<GardiennageEntry | null>(null);

  /* Suppression avec motif */
  const [deleteTarget, setDeleteTarget] = useState<GardiennageEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  /* ── Entrées du jour sélectionné (exclut ANNULE et CLOTURE) ── */
  const duJourEntries = useMemo(() => {
    return presenter.entries.filter((e) => {
      if (e.status === "ANNULE" || e.status === "CLOTURE") return false;
      if (e.recurrenceStartDate > selectedDate) return false;
      if (e.recurrenceEndDate && e.recurrenceEndDate < selectedDate) return false;
      return true;
    });
  }, [presenter.entries, selectedDate]);

  const familyOptions = useMemo(
    () =>
      Array.from(
        new Set(references.sites.map((s) => (s.famille || "").trim()).filter((v) => v.length > 0))
      ).sort((a, b) => a.localeCompare(b)),
    [references.sites]
  );

  /* ── Planification — filtrée et paginée ── */
  const planificationFiltered = useMemo(() => {
    const q = planifFilters.search.trim().toLowerCase();
    /* Si seul dateFrom est renseigné, on filtre sur cette date exacte */
    const effectiveDateTo = planifFilters.dateTo || planifFilters.dateFrom;
    const siteById = new Map(references.sites.map((s) => [s.id, s]));
    return presenter.entries.filter((e) => {
      if (q && !e.siteDisplay.toLowerCase().includes(q) && !e.intervenantName.toLowerCase().includes(q)) return false;
      if (statusFilter === "en_cours" && e.status !== "PLANIFIE" && e.status !== "ACTIF") return false;
      if (statusFilter === "CLOTURE" && e.status !== "CLOTURE") return false;
      if (statusFilter === "ANNULE" && e.status !== "ANNULE") return false;
      if (intervenantFilter && e.intervenantId !== intervenantFilter) return false;
      if (familyFilter) {
        const site = e.siteId ? siteById.get(e.siteId) : null;
        if (!site || (site.famille || "") !== familyFilter) return false;
      }
      /* Filtre plage de dates : l'entrée chevauche la plage */
      if (planifFilters.dateFrom && e.recurrenceEndDate && e.recurrenceEndDate < planifFilters.dateFrom) return false;
      if (effectiveDateTo && e.recurrenceStartDate > effectiveDateTo) return false;
      return true;
    });
  }, [presenter.entries, planifFilters.search, statusFilter, familyFilter, intervenantFilter, references.sites, planifFilters.dateFrom, planifFilters.dateTo]);

  useEffect(() => { planifFilters.setCurrentPage(1); }, [planificationFiltered]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = planifFilters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(planificationFiltered.length / planifFilters.pageSize));
  const planificationPaginated = useMemo(
    () => planifFilters.pageSize === 0
      ? planificationFiltered
      : planificationFiltered.slice((planifFilters.currentPage - 1) * planifFilters.pageSize, planifFilters.currentPage * planifFilters.pageSize),
    [planificationFiltered, planifFilters.currentPage, planifFilters.pageSize]
  );

  /* ── Stats rapides ── */
  const stats = useMemo(() => ({
    total: presenter.entries.length,
    enCours: presenter.entries.filter((e) => e.status === "PLANIFIE" || e.status === "ACTIF").length,
    cloture: presenter.entries.filter((e) => e.status === "CLOTURE").length,
    annule: presenter.entries.filter((e) => e.status === "ANNULE").length,
    duJour: duJourEntries.length
  }), [presenter.entries, duJourEntries]);

  /* ── Handlers ── */
  const openCreate = () => { setActiveEntry(null); setModalMode("create"); setModalOpen(true); };
  const openEdit = (entry: GardiennageEntry) => {
    const batchId = String(entry.planningBatchId || "").trim();
    let target = entry;
    if (batchId) {
      const batchEntries = presenter.entries.filter((row) => String(row.planningBatchId || "").trim() === batchId);
      const editableWithSnapshot = batchEntries.find(
        (row) => row.planningSnapshot && row.status !== "CLOTURE" && row.status !== "ANNULE"
      );
      const anyWithSnapshot = batchEntries.find((row) => row.planningSnapshot);
      target = editableWithSnapshot || anyWithSnapshot || entry;
    }
    setActiveEntry(target);
    setModalMode("edit");
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setActiveEntry(null); };
  const openCloseModal = (entry: GardiennageEntry) => { setCloseModalEntry(entry); setCloseModalOpen(true); };
  const openDeleteConfirm = (entry: GardiennageEntry) => { setDeleteTarget(entry); setDeleteReason(""); };
  const deleteScopeCount = useMemo(() => {
    if (!deleteTarget) return 0;
    const batchId = String(deleteTarget.planningBatchId || "").trim();
    if (!batchId) return 1;
    const count = presenter.entries.filter((entry) => String(entry.planningBatchId || "").trim() === batchId).length;
    return count > 0 ? count : 1;
  }, [deleteTarget, presenter.entries]);

  const handleDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) return;
    setIsDeleting(true);
    await presenter.deleteEntry(deleteTarget.id, deleteReason.trim());
    setIsDeleting(false);
    setDeleteTarget(null);
    setDeleteReason("");
  };

  const resetPlanificationFilters = () => {
    planifFilters.reset();
    setStatusFilter("");
    setFamilyFilter("");
    setIntervenantFilter("");
  };

  const handleExportFilteredList = () => {
    if (!planificationFiltered.length) {
      onToast?.("Aucune donnée à exporter avec les filtres actifs.");
      return;
    }
    try {
      exportGardiennageToExcel(planificationFiltered);
      onToast?.(`${planificationFiltered.length} ligne(s) exportée(s) dans le tableur Excel.`);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.");
    }
  };

  const handleExportWord = async (entry: GardiennageEntry) => {
    try {
      await exportGardiennageEntryToWord(entry);
      onToast?.("Document Word téléchargé.");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Word impossible.");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GARDIENNAGE_DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  return (
    <>
      {/* ── Statistiques ── */}
      <section className="panel main-log-stats">
        <div className="stat-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-card">
          <span>En cours</span>
          <strong>{stats.enCours}</strong>
        </div>
        <div className="stat-card">
          <span>Clôturés</span>
          <strong>{stats.cloture}</strong>
        </div>
        <div className="stat-card">
          <span>Annulés</span>
          <strong>{stats.annule}</strong>
        </div>
      </section>

      {/* Ligne 1: toggle à gauche, action à droite */}
      <section className="panel">
        <div className="main-courante-table-toolbar">
          <div className="row-actions" style={{ display: "inline-flex" }}>
            <button
              type="button"
              className="btn-light"
              title="Exporter Excel (filtres actifs)"
              aria-label="Exporter données (filtres actifs)"
              onClick={handleExportFilteredList}
              disabled={displayMode !== "list"}
            >
              Export données
            </button>
          </div>
          <div className="row-actions" style={{ display: "inline-flex" }}>
            <ToggleSwitch
              checked={displayMode === "day"}
              onChange={(checked) => setDisplayMode(checked ? "day" : "list")}
              label={displayMode === "day" ? "Affichage journée" : "Affichage liste"}
              labelFirst
            />
          </div>
          <button type="button" className="mc-btn-primary" onClick={openCreate}>
            <Plus size={15} aria-hidden />
            Nouveau gardiennage
          </button>
        </div>
        {displayMode === "list" ? (
          <>
            {references.error ? <p className="error">{references.error}</p> : null}
            <TableFiltersBar
              search={planifFilters.search}
              onSearchChange={planifFilters.setSearch}
              dateFrom={planifFilters.dateFrom}
              onDateFromChange={planifFilters.setDateFrom}
              dateTo={planifFilters.dateTo}
              onDateToChange={planifFilters.setDateTo}
              searchPlaceholder="Site, prestataire…"
              onReset={resetPlanificationFilters}
            >
              <label>
                Famille
                <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}>
                  <option value="">Toutes</option>
                  {familyOptions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                Prestataire
                <select value={intervenantFilter} onChange={(e) => setIntervenantFilter(e.target.value)}>
                  <option value="">Tous</option>
                  {references.intervenants.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Statut
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Tous</option>
                  <option value="en_cours">En cours</option>
                  <option value="CLOTURE">Clôturé</option>
                  <option value="ANNULE">Annulé</option>
                </select>
              </label>
            </TableFiltersBar>
          </>
        ) : null}
      </section>

      {/* Section 2: conteneurs séparés en mode liste */}
      {displayMode === "list" ? (
        <>
          <section className="panel main-courante-table-panel">
            {!presenter.loading ? (
              <GardiennageTable
                entries={planificationPaginated}
                showPeriode
                onEdit={openEdit}
                onDelete={openDeleteConfirm}
                onClose={openCloseModal}
                onExportWord={handleExportWord}
              />
            ) : (
              <p className="muted">Chargement…</p>
            )}

            <TablePaginationBar
              currentPage={planifFilters.currentPage}
              totalPages={totalPages}
              totalItems={planificationFiltered.length}
              pageSize={planifFilters.pageSize}
              onPageChange={planifFilters.setCurrentPage}
              onPageSizeChange={planifFilters.setPageSize}
            />
          </section>
        </>
      ) : (
        <section className="panel main-courante-table-panel">
          {references.error ? <p className="error">{references.error}</p> : null}
          <>
            <div className="gard-date-nav">
              <button
                type="button"
                className="action-icon-btn"
                title="Jour précédent"
                aria-label="Jour précédent"
                onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                type="date"
                className="gard-date-nav-input"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                aria-label="Date sélectionnée"
              />
              <button
                type="button"
                className="action-icon-btn"
                title="Jour suivant"
                aria-label="Jour suivant"
                onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
              >
                <ChevronRight size={18} />
              </button>
              {!isSelectedToday ? (
                <button
                  type="button"
                  className="action-icon-btn"
                  title="Revenir à aujourd'hui"
                  aria-label="Aujourd'hui"
                  onClick={() => setSelectedDate(getTodayIso())}
                >
                  <RotateCcw size={15} />
                </button>
              ) : null}
              <span className="gard-date-nav-label">{formatDateLong(selectedDate)}</span>
              {isSelectedToday ? <span className="gard-today-badge">Aujourd'hui</span> : null}
            </div>

            {!presenter.loading && duJourEntries.length === 0 ? (
              <div className="main-log-empty">
                <p className="muted">Aucun gardiennage planifié ou actif pour cette date.</p>
              </div>
            ) : null}

            {!presenter.loading && duJourEntries.length > 0 ? (
              <GardiennageTable
                entries={duJourEntries}
                onEdit={openEdit}
                onDelete={openDeleteConfirm}
                onClose={openCloseModal}
                onExportWord={handleExportWord}
              />
            ) : null}

            {presenter.loading ? <p className="muted">Chargement…</p> : null}
          </>
        </section>
      )}

      {/* Modale de création / édition complète */}
      <GardiennageEntryModal
        isOpen={modalOpen}
        mode={modalMode}
        entry={activeEntry}
        sites={references.sites}
        intervenants={references.intervenants}
        holidays={references.holidays}
        requesterRole={requesterRole}
        onClose={closeModal}
        onCreate={presenter.createEntry}
        onUpdate={presenter.updateEntry}
        onSetStatus={presenter.setStatus}
        onReopenEntry={presenter.reopenEntry}
        onNavigateToLinkedIntervention={onNavigateToLinkedIntervention}
        onNavigateToLinkedRonde={onNavigateToLinkedRonde}
        onNotify={onToast}
      />

      {/* Modale de clôture rapide */}
      <GardiennageCloseModal
        isOpen={closeModalOpen}
        entry={closeModalEntry}
        closeDate={selectedDate}
        onClose={() => { setCloseModalOpen(false); setCloseModalEntry(null); }}
        onSubmit={presenter.closeEntry}
        onNavigateToLinkedIntervention={onNavigateToLinkedIntervention}
        onNavigateToLinkedRonde={onNavigateToLinkedRonde}
      />

      {/* Confirmation suppression avec motif obligatoire */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Supprimer ce gardiennage ?"
        message={
          deleteTarget
            ? deleteScopeCount > 1
              ? `${deleteScopeCount} entrée(s) du lot de gardiennage seront traitées: suppression des non clôturées, conservation des clôturées (site "${deleteTarget.siteDisplay || "—"}").`
              : `Le gardiennage du site "${deleteTarget.siteDisplay || "—"}" (${deleteTarget.startTime} → ${deleteTarget.endTime}) sera définitivement supprimé.`
            : ""
        }
        confirmLabel={isDeleting ? "Suppression…" : "Supprimer"}
        confirmClassName="btn-danger"
        confirmDisabled={isDeleting || !deleteReason.trim()}
        onCancel={() => { setDeleteTarget(null); setDeleteReason(""); }}
        onConfirm={() => void handleDelete()}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
            Motif de suppression <span style={{ color: "var(--danger, #e55)" }}>*</span>
          </span>
          <textarea
            rows={2}
            className="mc-textarea"
            placeholder="Indiquer la raison de la suppression…"
            value={deleteReason}
            maxLength={500}
            autoFocus
            onChange={(e) => setDeleteReason(e.target.value)}
          />
        </label>
      </ConfirmModal>
    </>
  );
}
