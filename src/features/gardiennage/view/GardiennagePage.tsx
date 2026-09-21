/**
 * Page Gardiennage : onglets « Du jour » (navigation date) et « Planification » (liste filtrée).
 *
 * Orchestration presenters + modales création/édition/clôture, export Excel de la liste,
 * filtres statut/famille/prestataire. Mode d’affichage jour/liste mémorisé en localStorage.
 * Affichage liste : filtre Statut par défaut « En cours » (planifié + actif).
 * Cartes synthèse du mois en cours (début de prestation).
 * Montée depuis `AppShell` si permission `gardiennage`.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { ServiceListFiltersBar } from "../../common/components/ServiceListFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import { ListLoadingOverlay } from "../../common/components/ListLoadingOverlay";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import { matchesDailyCodeSearch } from "../../common/utils/dailyEntryCode";
import type { GardiennageEntry } from "../model/gardiennage.types";
import { clipGardiennageHoursToDay } from "../model/gardiennageDayHours";
import { useGardiennagePresenter } from "../presenter/useGardiennagePresenter";
import { useGardiennageReferenceData } from "../presenter/useGardiennageReferenceData";
import { GardiennageEntryModal, type GardiennageModalMode } from "../components/GardiennageEntryModal";
import { GardiennageTable } from "../components/GardiennageTable";
import { GardiennageCloseModal } from "../components/GardiennageCloseModal";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { MonthSummaryStatsBlock } from "../../common/components/MonthSummaryStatsBlock";
import { DateInput } from "../../common/components/DateInput";
import { addDaysLocalIso, formatLongDateFr, getLocalDateIso } from "../../common/utils/localDateIso";
import { exportGardiennageToExcel } from "../export/gardiennageExcelExport";
import { ListExportButtons } from "../../common/components/ExportFileButtons";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { WORKSTATION_EXPORT_KEYS } from "../../common/utils/workstationExportPaths";

const GARDIENNAGE_DISPLAY_MODE_STORAGE_KEY = "gardiennage.displayMode.v2";

type GardiennagePageProps = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: NotifyToast;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
  /** Id gardiennage à ouvrir (navigation depuis une intervention liée). */
  focusGardiennageId?: string | null;
  onFocusGardiennageConsumed?: () => void;
};

export function GardiennagePage({
  requesterRole,
  requesterUsername,
  onToast,
  onNavigateToLinkedIntervention,
  onNavigateToLinkedRonde,
  focusGardiennageId,
  onFocusGardiennageConsumed
}: GardiennagePageProps) {

  const presenter = useGardiennagePresenter({ requesterRole, requesterUsername, onToast });
  const references = useGardiennageReferenceData(requesterRole, requesterUsername, onToast);
  const workstationExports = useWorkstationExports();

  const [displayMode, setDisplayMode] = useState<"day" | "list">(() => {
    if (typeof window === "undefined") return "list";
    const raw = window.localStorage.getItem(GARDIENNAGE_DISPLAY_MODE_STORAGE_KEY);
    return raw === "day" ? "day" : "list";
  });

  /* ── Onglet Du jour ── */
  const [selectedDate, setSelectedDate] = useState(getLocalDateIso);
  const isSelectedToday = selectedDate === getLocalDateIso();

  /* ── Onglet Planification — filtres (affichage liste) ── */
  const planifFilters = useTableFilters();
  /** Défaut « en cours » : clôturés et annulés masqués tant qu'on ne les demande pas explicitement. */
  const [statusFilter, setStatusFilterRaw] = useState("EN_COURS");
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

  /* ── Deep-link : ouverture automatique d'un gardiennage depuis une intervention liée ── */
  useEffect(() => {
    if (!focusGardiennageId) return;
    let cancelled = false;
    void (async () => {
      const rows = await presenter.loadEntries(true);
      if (cancelled) return;
      const found = rows.find((e) => e.id === focusGardiennageId);
      if (found) {
        setActiveEntry(found);
        setModalMode("edit");
        setModalOpen(true);
      } else {
        onToast?.("Gardiennage lié introuvable dans la liste.", "error");
      }
      onFocusGardiennageConsumed?.();
    })();
    return () => { cancelled = true; };
  }, [focusGardiennageId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Entrées du jour sélectionné (exclut ANNULE et CLOTURE) ── */
  const duJourEntries = useMemo(() => {
    return presenter.entries.filter((e) => {
      if (e.status === "ANNULE" || e.status === "CLOTURE") return false;
      return clipGardiennageHoursToDay(e, selectedDate) !== null;
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
      if (q && !matchesDailyCodeSearch(e.dailyCode, q) && !e.siteDisplay.toLowerCase().includes(q) && !e.intervenantName.toLowerCase().includes(q)) return false;
      if (statusFilter === "EN_COURS" && e.status !== "PLANIFIE" && e.status !== "ACTIF") return false;
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
    setStatusFilter("EN_COURS");
    setFamilyFilter("");
    setIntervenantFilter("");
  };

  const handleExportFilteredList = async () => {
    if (!planificationFiltered.length) {
      onToast?.("Aucune donnée à exporter avec les filtres actifs.", "warning");
      return;
    }
    try {
      await workstationExports.saveAndRemember(
        WORKSTATION_EXPORT_KEYS.excelGardiennage,
        () => exportGardiennageToExcel(planificationFiltered),
        onToast,
        `${planificationFiltered.length} ligne(s) exportée(s) dans le tableur Excel.`
      );
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.", "error");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GARDIENNAGE_DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  return (
    <>
      <MonthSummaryStatsBlock
        cards={[
          { label: "Total", value: presenter.stats.total },
          { label: "Planifiés", value: presenter.stats.planned },
          { label: "Actifs", value: presenter.stats.active },
          { label: "Clôturés", value: presenter.stats.closed }
        ]}
      />

      <section className="panel main-courante-table-panel">
        {displayMode === "day" ? (
          <div className="gard-panel-head">
            <div className="gard-date-nav">
              <button
                type="button"
                className="action-icon-btn"
                title="Jour précédent"
                aria-label="Jour précédent"
                onClick={() => setSelectedDate((d) => addDaysLocalIso(d, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <DateInput
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
                onClick={() => setSelectedDate((d) => addDaysLocalIso(d, 1))}
              >
                <ChevronRight size={18} />
              </button>
              {!isSelectedToday ? (
                <button
                  type="button"
                  className="action-icon-btn"
                  title="Revenir à aujourd'hui"
                  aria-label="Aujourd'hui"
                  onClick={() => setSelectedDate(getLocalDateIso())}
                >
                  <RotateCcw size={15} />
                </button>
              ) : null}
              <span className="gard-date-nav-label">{formatLongDateFr(selectedDate)}</span>
              {isSelectedToday ? <span className="gard-today-badge">Aujourd'hui</span> : null}
            </div>

            <div className="main-courante-table-toolbar gard-panel-head__toolbar">
              <div className="row-actions">
                <ToggleSwitch
                  checked
                  onChange={(checked) => setDisplayMode(checked ? "day" : "list")}
                  label="Affichage journée"
                  labelFirst
                />
              </div>
              <button type="button" className="mc-btn-primary" onClick={openCreate}>
                <Plus size={15} aria-hidden />
                Nouveau gardiennage
              </button>
            </div>
          </div>
        ) : (
          <div className="main-courante-table-toolbar">
            <ListExportButtons
              exportDisabled={presenter.loading || planificationFiltered.length === 0}
              canOpenLast={workstationExports.canOpenExcelTemporarily(WORKSTATION_EXPORT_KEYS.excelGardiennage)}
              lastFilePath={workstationExports.getLastPath(WORKSTATION_EXPORT_KEYS.excelGardiennage)}
              onExport={() => void handleExportFilteredList()}
              onOpenLast={() =>
                void workstationExports.openLastExport(WORKSTATION_EXPORT_KEYS.excelGardiennage, onToast)
              }
              exportTitle="Exporter Excel (filtres actifs)"
              exportAriaLabel="Exporter données (filtres actifs)"
            />
            <div className="row-actions">
              <ToggleSwitch
                checked={false}
                onChange={(checked) => setDisplayMode(checked ? "day" : "list")}
                label="Affichage liste"
                labelFirst
              />
            </div>
            <button type="button" className="mc-btn-primary" onClick={openCreate}>
              <Plus size={15} aria-hidden />
              Nouveau gardiennage
            </button>
          </div>
        )}

        {displayMode === "list" ? (
          <>
            {references.error ? <p className="error">{references.error}</p> : null}
            <ServiceListFiltersBar
              search={planifFilters.search}
              onSearchChange={planifFilters.setSearch}
              dateFrom={planifFilters.dateFrom}
              onDateFromChange={planifFilters.setDateFrom}
              dateTo={planifFilters.dateTo}
              onDateToChange={planifFilters.setDateTo}
              searchPlaceholder="N°, site, prestataire…"
              onReset={resetPlanificationFilters}
              familyFilter={familyFilter}
              onFamilyFilterChange={setFamilyFilter}
              familyOptions={familyOptions}
              intervenantFilter={intervenantFilter}
              onIntervenantFilterChange={setIntervenantFilter}
              intervenantOptions={references.intervenants}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />

            <ListLoadingOverlay loading={presenter.loading}>
              <GardiennageTable
                entries={planificationPaginated}
                showPeriode
                onEdit={openEdit}
                onDelete={openDeleteConfirm}
                onClose={openCloseModal}
                onNotify={onToast}
              />
              <TablePaginationBar
                currentPage={planifFilters.currentPage}
                totalPages={totalPages}
                totalItems={planificationFiltered.length}
                pageSize={planifFilters.pageSize}
                onPageChange={planifFilters.setCurrentPage}
                onPageSizeChange={planifFilters.setPageSize}
              />
            </ListLoadingOverlay>
          </>
        ) : (
          <>
            {references.error ? <p className="error">{references.error}</p> : null}

            <ListLoadingOverlay loading={presenter.loading}>
              {duJourEntries.length === 0 ? (
                <div className="main-log-empty">
                  <p className="muted">Aucun gardiennage planifié ou actif pour cette date.</p>
                </div>
              ) : (
                <GardiennageTable
                  entries={duJourEntries}
                  hoursForDate={selectedDate}
                  onEdit={openEdit}
                  onDelete={openDeleteConfirm}
                  onClose={openCloseModal}
                  onNotify={onToast}
                />
              )}
            </ListLoadingOverlay>
          </>
        )}
      </section>

      {/* Modale de création / édition complète */}
      <GardiennageEntryModal
        isOpen={modalOpen}
        mode={modalMode}
        entry={activeEntry}
        batchEntries={
          activeEntry?.planningBatchId
            ? presenter.entries.filter((row) => String(row.planningBatchId || "") === String(activeEntry.planningBatchId))
            : (activeEntry ? [activeEntry] : [])
        }
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
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        onNotify={onToast}
      />

      {/* Modale de clôture rapide */}
      <GardiennageCloseModal
        isOpen={closeModalOpen}
        entry={closeModalEntry}
        requesterRole={requesterRole}
        sites={references.sites}
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
            Motif de suppression <span className="text-error">*</span>
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
