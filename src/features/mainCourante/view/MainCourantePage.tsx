/**
 * Page Main courante : journal filtré, persistance filtres localStorage, exports Excel/Word.
 *
 * Compteurs statuts, modale unique (create/edit/manager/view). Responsable vs opérateur
 * pour les actions disponibles sur une ligne.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { MainCouranteEntry } from "../model/mainCourante.types";
import { MainCouranteEntryModal } from "../components/MainCouranteEntryModal";
import { MainCouranteTable } from "../components/MainCouranteTable";
import { useMainCourantePresenter } from "../presenter/useMainCourantePresenter";
import { useMainCouranteReferenceData } from "../presenter/useMainCouranteReferenceData";
import type { Role } from "../../../types";
import { exportMainCouranteToExcel } from "../export/mainCouranteExcelExport";
import { exportMainCouranteEntryToWord } from "../export/mainCouranteWordExport";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";

const MAIN_COURANTE_FILTERS_STORAGE_KEY = "mainCourante.filters.v1";

type MainCourantePersistedFiltersV1 = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  typeFilter?: string;
  statusFilter?: string;
  operatorFilter?: string;
  managerFilter?: string;
  pageSize?: number;
};

type MainCourantePageProps = {
  operatorName: string;
  requesterUsername: string;
  requesterRole: Role;
  onToast?: (message: string) => void;
};

export function MainCourantePage({ operatorName, requesterUsername, requesterRole, onToast }: MainCourantePageProps) {
  const filters = useTableFilters();
  const [typeFilter, setTypeFilterRaw] = useState("");
  const [statusFilter, setStatusFilterRaw] = useState("");
  const [operatorFilter, setOperatorFilterRaw] = useState("all");
  const [managerFilter, setManagerFilterRaw] = useState("all");
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  const setTypeFilter = (v: string) => { setTypeFilterRaw(v); filters.setCurrentPage(1); };
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); filters.setCurrentPage(1); };
  const setOperatorFilter = (v: string) => { setOperatorFilterRaw(v); filters.setCurrentPage(1); };
  const setManagerFilter = (v: string) => { setManagerFilterRaw(v); filters.setCurrentPage(1); };

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionModalMode, setActionModalMode] = useState<"create" | "edit" | "manager" | "view">("create");
  const [activeEntry, setActiveEntry] = useState<MainCouranteEntry | null>(null);

  const { entries, stats, loading, createEntry, updateOperatorEntry, applyManagerAction, reopenEntry } = useMainCourantePresenter(
    operatorName,
    { requesterRole, requesterUsername, onToast }
  );
  const { sites, anomalyTypes, loading: referencesLoading, error: referencesError, createPendingSite } = useMainCouranteReferenceData(
    requesterRole,
    requesterUsername,
    onToast
  );

  const isManager = requesterRole === "RESPONSABLE" || requesterRole === "DEV";

  const operatorOptions = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.operatorName))).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const managerOptions = useMemo(() => {
    return Array.from(
      new Set(entries.map((e) => e.managerName).filter((n): n is string => Boolean(n?.trim())))
    ).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let list = [...entries];

    if (filters.dateFrom) {
      const from = new Date(`${filters.dateFrom}T00:00:00`);
      list = list.filter((e) => new Date(e.createdAt) >= from);
    }
    /* Si seul dateFrom est renseigné, on filtre sur cette date exacte */
    const effectiveDateTo = filters.dateTo || filters.dateFrom;
    if (effectiveDateTo) {
      const to = new Date(`${effectiveDateTo}T23:59:59.999`);
      list = list.filter((e) => new Date(e.createdAt) <= to);
    }
    if (operatorFilter !== "all") {
      list = list.filter((e) => e.operatorName === operatorFilter);
    }
    if (managerFilter === "__none__") {
      list = list.filter((e) => !e.managerName?.trim());
    } else if (managerFilter !== "all") {
      list = list.filter((e) => e.managerName === managerFilter);
    }

    const q = filters.search.trim().toLowerCase();
    return list
      .filter((entry) => {
        const textOk =
          !q ||
          entry.operatorName.toLowerCase().includes(q) ||
          (entry.siteDisplay || "").toLowerCase().includes(q) ||
          entry.anomalyTypeLabel.toLowerCase().includes(q) ||
          entry.information.toLowerCase().includes(q) ||
          (entry.managerObservation || "").toLowerCase().includes(q) ||
          (entry.managerName || "").toLowerCase().includes(q);
        const typeOk = !typeFilter || entry.anomalyTypeId === typeFilter;
        const statusOk = !statusFilter || entry.status === statusFilter;
        return textOk && typeOk && statusOk;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, filters.search, statusFilter, typeFilter, filters.dateFrom, filters.dateTo, operatorFilter, managerFilter]);

  const totalPages = filters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredEntries.length / filters.pageSize));
  const pagedEntries = useMemo(() => {
    if (filters.pageSize === 0) return filteredEntries;
    const start = (filters.currentPage - 1) * filters.pageSize;
    return filteredEntries.slice(start, start + filters.pageSize);
  }, [filteredEntries, filters.currentPage, filters.pageSize]);

  useEffect(() => {
    if (filters.currentPage <= totalPages) return;
    filters.setCurrentPage(totalPages);
  }, [filters.currentPage, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setActiveEntry(null);
    setActionModalMode("create");
    setActionModalOpen(true);
  };

  const openEdit = (entry: MainCouranteEntry) => {
    setActiveEntry(entry);
    setActionModalMode("edit");
    setActionModalOpen(true);
  };

  const openManager = (entry: MainCouranteEntry) => {
    setActiveEntry(entry);
    setActionModalMode("manager");
    setActionModalOpen(true);
    if (isManager && !entry.consultedByManagerAt) {
      void gtsApiClient.markMainCouranteEntryConsulted({ requesterRole, requesterUsername, id: entry.id });
    }
  };

  const openView = (entry: MainCouranteEntry) => {
    setActiveEntry(entry);
    setActionModalMode("view");
    setActionModalOpen(true);
    if (isManager && !entry.consultedByManagerAt) {
      void gtsApiClient.markMainCouranteEntryConsulted({ requesterRole, requesterUsername, id: entry.id });
    }
  };

  const handleExportExcel = () => {
    if (filteredEntries.length === 0) return;
    try {
      exportMainCouranteToExcel(filteredEntries);
      onToast?.("Export Excel téléchargé.");
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Export Excel impossible.");
    }
  };

  const handleExportWord = async (entry: MainCouranteEntry) => {
    try {
      await exportMainCouranteEntryToWord(entry);
      onToast?.("Document Word téléchargé.");
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Export Word impossible.");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(MAIN_COURANTE_FILTERS_STORAGE_KEY);
      if (!raw) {
        setFiltersHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as MainCourantePersistedFiltersV1;
      filters.setSearch(typeof parsed.search === "string" ? parsed.search : "");
      filters.setDateFrom(typeof parsed.dateFrom === "string" ? parsed.dateFrom : "");
      filters.setDateTo(typeof parsed.dateTo === "string" ? parsed.dateTo : "");
      setTypeFilterRaw(typeof parsed.typeFilter === "string" ? parsed.typeFilter : "");
      setStatusFilterRaw(typeof parsed.statusFilter === "string" ? parsed.statusFilter : "");
      setOperatorFilterRaw(typeof parsed.operatorFilter === "string" ? parsed.operatorFilter : "all");
      setManagerFilterRaw(typeof parsed.managerFilter === "string" ? parsed.managerFilter : "all");
      if (typeof parsed.pageSize === "number" && Number.isFinite(parsed.pageSize)) {
        filters.setPageSize(parsed.pageSize);
      }
    } catch {
      // Ignorer une éventuelle valeur corrompue.
    } finally {
      setFiltersHydrated(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filtersHydrated || typeof window === "undefined") return;
    const payload: MainCourantePersistedFiltersV1 = {
      search: filters.search,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      typeFilter,
      statusFilter,
      operatorFilter,
      managerFilter,
      pageSize: filters.pageSize
    };
    window.localStorage.setItem(MAIN_COURANTE_FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    filtersHydrated,
    filters.search,
    filters.dateFrom,
    filters.dateTo,
    filters.pageSize,
    typeFilter,
    statusFilter,
    operatorFilter,
    managerFilter
  ]);

  return (
    <>
      <section className="panel main-log-stats">
        <div className="stat-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-card">
          <span>En attente</span>
          <strong>{stats.waiting}</strong>
        </div>
        <div className="stat-card">
          <span>En cours</span>
          <strong>{stats.inProgress}</strong>
        </div>
        <div className="stat-card">
          <span>Clôturés</span>
          <strong>{stats.closed}</strong>
        </div>
      </section>

      <section className="panel">
        {referencesError ? <p className="error main-log-ref-error">{referencesError}</p> : null}
        <TableFiltersBar
          search={filters.search}
          onSearchChange={filters.setSearch}
          dateFrom={filters.dateFrom}
          onDateFromChange={filters.setDateFrom}
          dateTo={filters.dateTo}
          onDateToChange={filters.setDateTo}
          searchPlaceholder="Opérateur, site, type, information…"
          onReset={() => {
            filters.reset();
            setOperatorFilter("all");
            setManagerFilter("all");
            setTypeFilter("");
            setStatusFilter("");
          }}
        >
          <label>
            Opérateur
            <select value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)}>
              <option value="all">Tous</option>
              {operatorOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsable
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
              <option value="all">Tous</option>
              <option value="__none__">Sans responsable</option>
              {managerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Tous</option>
              {anomalyTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            État
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tous</option>
              <option value="EN_ATTENTE">En attente</option>
              <option value="EN_COURS">En cours</option>
              <option value="CLOTURE">Clôturé</option>
            </select>
          </label>
        </TableFiltersBar>
        {referencesLoading && !anomalyTypes.length ? <p className="muted" style={{ marginTop: 8 }}>Chargement des types…</p> : null}
      </section>

      <section className="panel main-courante-table-panel">
        <div className="main-courante-table-toolbar">
          <button
            type="button"
            className="btn-light"
            disabled={loading || filteredEntries.length === 0}
            onClick={handleExportExcel}
          >
            Exporter données
          </button>
          <button type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Nouvelle entrée
          </button>
        </div>
        {loading ? <p className="muted main-log-loading">Chargement de la main courante…</p> : null}
        <MainCouranteTable
          entries={pagedEntries}
          anomalyTypes={anomalyTypes}
          currentOperatorName={operatorName}
          isManager={isManager}
          onNotify={onToast}
          onEditEntry={openEdit}
          onManagerTreat={openManager}
          onExportWord={handleExportWord}
          onViewEntry={openView}
        />
        <TablePaginationBar
          currentPage={filters.currentPage}
          totalPages={totalPages}
          totalItems={filteredEntries.length}
          pageSize={filters.pageSize}
          onPageChange={filters.setCurrentPage}
          onPageSizeChange={filters.setPageSize}
        />
      </section>

      <MainCouranteEntryModal
        isOpen={actionModalOpen}
        mode={actionModalMode}
        operatorName={operatorName}
        entry={activeEntry}
        managerDisplayName={operatorName}
        sites={sites}
        anomalyTypes={anomalyTypes}
        referencesLoading={referencesLoading}
        referencesError={referencesError}
        canReopenEntry={isManager}
        onNotify={onToast}
        onClose={() => setActionModalOpen(false)}
        onCreatePendingSite={createPendingSite}
        onCreate={createEntry}
        onUpdate={updateOperatorEntry}
        onManagerAction={(entry, payload) =>
          applyManagerAction(entry.id, {
            ...payload,
            managerName: operatorName,
            expectedUpdatedAt: entry.updatedAt
          })
        }
        onReopenEntry={(entry) =>
          reopenEntry(entry.id, {
            managerName: operatorName,
            expectedUpdatedAt: entry.updatedAt
          })
        }
      />
    </>
  );
}
