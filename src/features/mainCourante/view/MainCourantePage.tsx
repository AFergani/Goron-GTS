/**
 * Page Main courante : journal filtré, persistance filtres localStorage, exports Excel/Word.
 *
 * Filtre État par défaut : « Ouverts » (En attente + En cours) — Clôturé masqué tant qu'on ne le demande pas.
 * Cartes synthèse du mois en cours, modale unique (create/edit/manager/view).
 */

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { MainCouranteEntry } from "../model/mainCourante.types";
import { MainCouranteEntryModal, type EntryModalMode } from "../components/MainCouranteEntryModal";
import { MainCouranteTable } from "../components/MainCouranteTable";
import { useMainCourantePresenter } from "../presenter/useMainCourantePresenter";
import { useMainCouranteReferenceData } from "../presenter/useMainCouranteReferenceData";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import { matchesDailyCodeSearch } from "../../common/utils/dailyEntryCode";
import { exportMainCouranteToExcel } from "../export/mainCouranteExcelExport";
import { exportMainCouranteEntryToWord } from "../export/mainCouranteWordExport";
import { MonthSummaryStatsBlock } from "../../common/components/MonthSummaryStatsBlock";
import { ListExportButtons } from "../../common/components/ExportFileButtons";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { WORKSTATION_EXPORT_KEYS, wordExportKey } from "../../common/utils/workstationExportPaths";
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
  onToast?: NotifyToast;
};

export function MainCourantePage({ operatorName, requesterUsername, requesterRole, onToast }: MainCourantePageProps) {
  const filters = useTableFilters();
  const [typeFilter, setTypeFilterRaw] = useState("");
  /** Défaut « ouverts » : En attente + En cours (Clôturé masqué tant qu'on ne le demande pas). */
  const [statusFilter, setStatusFilterRaw] = useState("OPEN");
  const [operatorFilter, setOperatorFilterRaw] = useState("all");
  const [managerFilter, setManagerFilterRaw] = useState("all");
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  const setTypeFilter = (v: string) => { setTypeFilterRaw(v); filters.setCurrentPage(1); };
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); filters.setCurrentPage(1); };
  const setOperatorFilter = (v: string) => { setOperatorFilterRaw(v); filters.setCurrentPage(1); };
  const setManagerFilter = (v: string) => { setManagerFilterRaw(v); filters.setCurrentPage(1); };

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionModalMode, setActionModalMode] = useState<EntryModalMode>("create");
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
  const workstationExports = useWorkstationExports();

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
          matchesDailyCodeSearch(entry.dailyCode, q) ||
          entry.operatorName.toLowerCase().includes(q) ||
          (entry.siteDisplay || "").toLowerCase().includes(q) ||
          entry.anomalyTypeLabel.toLowerCase().includes(q) ||
          entry.information.toLowerCase().includes(q) ||
          (entry.managerObservation || "").toLowerCase().includes(q) ||
          (entry.managerName || "").toLowerCase().includes(q);
        const typeOk = !typeFilter || entry.anomalyTypeId === typeFilter;
        const statusOk =
          !statusFilter || statusFilter === "TOUS"
            ? true
            : statusFilter === "OPEN"
              ? entry.status === "EN_ATTENTE" || entry.status === "EN_COURS"
              : entry.status === statusFilter;
        return textOk && typeOk && statusOk;
      });
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
    if (!isManager && entry.priseEnCompteAt && entry.operatorName === operatorName) {
      void gtsApiClient.markMainCouranteEntryConsultedByOperator({
        requesterRole,
        requesterUsername,
        id: entry.id
      });
    }
  };

  const handleExportExcel = async () => {
    if (filteredEntries.length === 0) return;
    try {
      await workstationExports.saveAndRemember(
        WORKSTATION_EXPORT_KEYS.excelMainCourante,
        () => exportMainCouranteToExcel(filteredEntries),
        onToast,
        "Export Excel enregistré."
      );
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Export Excel impossible.", "error");
    }
  };

  const handleExportWord = async (entry: MainCouranteEntry) => {
    try {
      await workstationExports.saveAndRemember(
        wordExportKey("mainCourante", entry.id),
        () => exportMainCouranteEntryToWord(entry),
        onToast,
        "Document Word enregistré."
      );
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Export Word impossible.", "error");
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
      {
        const savedStatus = typeof parsed.statusFilter === "string" ? parsed.statusFilter : "OPEN";
        // Ancien défaut « Tous » (`""`) → ouverts (En attente + En cours).
        setStatusFilterRaw(savedStatus === "" ? "OPEN" : savedStatus);
      }
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
      <MonthSummaryStatsBlock
        cards={[
          { label: "Total", value: stats.total },
          { label: "En attente", value: stats.waiting },
          { label: "En cours", value: stats.inProgress },
          { label: "Clôturés", value: stats.closed }
        ]}
      />

      <section className="panel main-courante-table-panel">
        {referencesError ? <p className="error main-log-ref-error">{referencesError}</p> : null}
        <div className="main-courante-table-toolbar">
          <ListExportButtons
            exportDisabled={loading || filteredEntries.length === 0}
            canOpenLast={workstationExports.canOpenExcelTemporarily(WORKSTATION_EXPORT_KEYS.excelMainCourante)}
            lastFilePath={workstationExports.getLastPath(WORKSTATION_EXPORT_KEYS.excelMainCourante)}
            onExport={() => void handleExportExcel()}
            onOpenLast={() => void workstationExports.openLastExport(WORKSTATION_EXPORT_KEYS.excelMainCourante, onToast)}
          />
          <button type="button" className="mc-btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Nouvelle entrée
          </button>
        </div>
        <div className="list-panel-filters">
          <TableFiltersBar
            search={filters.search}
            onSearchChange={filters.setSearch}
            dateFrom={filters.dateFrom}
            onDateFromChange={filters.setDateFrom}
            dateTo={filters.dateTo}
            onDateToChange={filters.setDateTo}
            searchPlaceholder="N°, opérateur, site, type, information…"
            onReset={() => {
              filters.reset();
              setOperatorFilter("all");
              setManagerFilter("all");
              setTypeFilter("");
              setStatusFilter("OPEN");
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
                <option value="OPEN">Ouverts (en attente + en cours)</option>
                <option value="TOUS">Tous</option>
                <option value="EN_ATTENTE">En attente</option>
                <option value="EN_COURS">En cours</option>
                <option value="CLOTURE">Clôturé</option>
              </select>
            </label>
          </TableFiltersBar>
        </div>
        {referencesLoading && !anomalyTypes.length ? <p className="muted" style={{ marginTop: 8 }}>Chargement des types…</p> : null}
        {loading ? <p className="muted main-log-loading">Chargement de la main courante…</p> : null}
        <MainCouranteTable
          entries={pagedEntries}
          anomalyTypes={anomalyTypes}
          currentOperatorName={operatorName}
          isManager={isManager}
          onNotify={onToast}
          onEditEntry={openEdit}
          onManagerTreat={openManager}
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
        onSaveWord={(entry) => void handleExportWord(entry)}
        onOpenWord={(entry) =>
          void workstationExports.openLastExport(wordExportKey("mainCourante", entry.id), onToast)
        }
        getWordFilePath={(entryId) => workstationExports.getLastPath(wordExportKey("mainCourante", entryId))}
      />
    </>
  );
}
