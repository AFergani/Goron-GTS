/**
 * Page Rondes : onglets urgence / planifié ; orchestration presenter + référentiels.
 *
 * Synthèse du mois, puis panneau liste (onglets + actions, filtres, tableau / journée).
 * Affichage liste (contractuelle et exceptionnelle) : filtre Statut par défaut « En cours ».
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import type { RondeEntry, RondeOriginKind, RondeBatchDeleteRequestRef } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import { useRondePresenter } from "../presenter/useRondePresenter";
import { useRondeReferenceData } from "../presenter/useRondeReferenceData";
import { RondeEntryModal } from "../components/RondeEntryModal";
import { RondeRequestModal } from "../components/RondeRequestModal";
import { RondePageTabsBar } from "../components/RondePageTabsBar";
import type { RondeListView } from "../components/RondePageTabsBar";
import type { RondePlannedProfilePayload, RondePlannedProfileRef } from "../model/rondePlanned.types";
import { RondeTable } from "../components/RondeTable";
import { RondePlannedDaySection } from "../components/RondePlannedDaySection";
import { RondePlannedProfilesListModal } from "../components/RondePlannedProfilesListModal";
import { RondePlannedCancellationQueueModal } from "../components/RondePlannedCancellationQueueModal";
import { RondeBatchDeleteQueueModal } from "../components/RondeBatchDeleteQueueModal";
import { RondePlannedProfileLifecycleModals } from "../components/RondePlannedProfileLifecycleModals";
import { RondeListFiltersBar } from "../components/RondeListFiltersBar";
import { RondeServiceTabActions } from "../components/RondeServiceTabActions";
import { useRondePlannedProfileLifecycle } from "../hooks/useRondePlannedProfileLifecycle";
import { getExceptionalDemandGroup } from "../utils/exceptionalDemandGroup";
import { exportRondeToExcel } from "../export/rondeExcelExport";
import { exportRondeEntryToWord } from "../export/rondeWordExport";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { WORKSTATION_EXPORT_KEYS, wordExportKey } from "../../common/utils/workstationExportPaths";
import { getLocalDateIso } from "../../common/utils/localDateIso";
import { countTodayInProgressRondes, isContractualRondeEntry } from "../utils/rondeEntryClassification";
import { isRondeManagerRole } from "../utils/rondePassageRules";
import { requestOriginFromStoredEntry, type RequestOrigin } from "../model/requestOrigin";
import { syntheticPlanningSnapshotForLinkedDemand } from "../utils/syntheticPlanningSnapshot";
import { buildPlannedFallbackVirtualEntries } from "../utils/buildPlannedFallbackVirtualEntries";
import { useRondeDisplayMode } from "../hooks/useRondeDisplayMode";
import { filterAndSortRondeListEntries } from "../utils/filterAndSortRondeListEntries";
import { MonthSummaryStatsBlock } from "../../common/components/MonthSummaryStatsBlock";
import { ListLoadingOverlay } from "../../common/components/ListLoadingOverlay";

type RondePageProps = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: NotifyToast;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  /** Id ronde à ouvrir (navigation depuis une intervention liée). */
  focusRondeId?: string | null;
  onFocusRondeConsumed?: () => void;
  onUpsertRondePlannedProfile?: (
    payload: RondePlannedProfilePayload
  ) => void | Promise<void | RondePlannedProfileRef>;
  onDeleteRondePlannedProfile?: (id: string, reason: string) => void | Promise<unknown>;
  onRequestRondePlannedProfileCancellation?: (id: string, reason: string) => void | Promise<unknown>;
  onReviewRondePlannedProfileCancellationRequest?: (
    id: string,
    payload: { decision: "approve" | "reject"; reviewReason: string; planningEndDate?: string }
  ) => void | Promise<unknown>;
  onSetRondePlannedProfilePlanningEnd?: (id: string, planningEndDate: string, reason: string) => void | Promise<unknown>;
};

export function RondePage({
  requesterRole,
  requesterUsername,
  onToast,
  onNavigateToLinkedIntervention,
  focusRondeId,
  onFocusRondeConsumed,
  onUpsertRondePlannedProfile,
  onDeleteRondePlannedProfile,
  onRequestRondePlannedProfileCancellation,
  onReviewRondePlannedProfileCancellationRequest,
  onSetRondePlannedProfilePlanningEnd
}: RondePageProps) {
  const [listView, setListView] = useState<RondeListView>("urgence");
  const { displayModeByService, setDisplayModeByService } = useRondeDisplayMode();
  const filters = useTableFilters();
  /** Défaut « en cours » en affichage liste : clôturées et annulées masquées tant qu'on ne les demande pas. */
  const [statusFilter, setStatusFilterRaw] = useState("EN_COURS");
  const [familyFilter, setFamilyFilterRaw] = useState("");
  const [intervenantFilter, setIntervenantFilterRaw] = useState("");
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); filters.setCurrentPage(1); };
  const setFamilyFilter = (v: string) => { setFamilyFilterRaw(v); filters.setCurrentPage(1); };
  const setIntervenantFilter = (v: string) => { setIntervenantFilterRaw(v); filters.setCurrentPage(1); };
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [activeEntry, setActiveEntry] = useState<RondeEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestFixedOrigin, setRequestFixedOrigin] = useState<RequestOrigin | null>("CONTRAT");
  const [requestInitial, setRequestInitial] = useState<{
    requestDate?: string | null;
    motifTypeId?: string | null;
    consigne?: string | null;
    siteId?: string | null;
    intervenantId?: string | null;
    interventionId?: string | null;
  } | null>(null);
  const [requestPlanningReplay, setRequestPlanningReplay] = useState<RondePlanningSnapshotV1 | null>(null);
  const [openProfileRequest, setOpenProfileRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [editingProfile, setEditingProfile] = useState<RondePlannedProfileRef | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profilesListOpen, setProfilesListOpen] = useState(false);
  const [cancellationQueueOpen, setCancellationQueueOpen] = useState(false);
  const [batchDeleteQueueOpen, setBatchDeleteQueueOpen] = useState(false);
  const [batchDeleteRequests, setBatchDeleteRequests] = useState<RondeBatchDeleteRequestRef[]>([]);
  const [createPreset, setCreatePreset] = useState<{
    source: "PLANIFIE";
    requestDate: string;
    siteId: string;
    intervenantId: string | null;
    plannedProfileId: string;
    plannedRoundKind: string;
    plannedSlotKey: string;
    planningHint?: string;
    motifTypeId?: string | null;
  } | null>(null);
  const [linkedDemandAnchorId, setLinkedDemandAnchorId] = useState<string | null>(null);
  /** D'où on a ouvert la demande liée (pour le bouton retour). */
  const [linkedDemandOrigin, setLinkedDemandOrigin] = useState<"ronde-report" | "batch-delete-queue" | null>(
    null
  );

  const ronde = useRondePresenter({ requesterRole, requesterUsername, onToast });
  const references = useRondeReferenceData(requesterRole, requesterUsername, onToast);
  const workstationExports = useWorkstationExports();

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setEditingProfile(null);
  };

  const lifecycle = useRondePlannedProfileLifecycle(requesterRole, {
    onDeleteRondePlannedProfile,
    onRequestRondePlannedProfileCancellation,
    onReviewRondePlannedProfileCancellationRequest,
    onSetRondePlannedProfilePlanningEnd,
    onReload: references.reload,
    onNotify: onToast,
    onAfterDestructiveSuccess: (profileId) => {
      if (editingProfile?.id === profileId) closeProfileModal();
    }
  });

  const pendingCancellationCount = useMemo(
    () => references.plannedProfiles.filter((p) => Boolean(p.cancellationRequestedAt)).length,
    [references.plannedProfiles]
  );

  const canManageRondes = isRondeManagerRole(requesterRole);

  const refreshBatchDeleteRequests = async () => {
    if (!canManageRondes) {
      setBatchDeleteRequests([]);
      return;
    }
    const list = await ronde.listBatchDeleteRequests();
    setBatchDeleteRequests(list);
  };

  useEffect(() => {
    if (!canManageRondes) {
      setBatchDeleteRequests([]);
      return;
    }
    let alive = true;
    void ronde.listBatchDeleteRequests().then((list) => {
      if (alive) setBatchDeleteRequests(list);
    });
    return () => {
      alive = false;
    };
  }, [canManageRondes, ronde.entries]);

  const pendingBatchDeleteCount = useMemo(
    () => batchDeleteRequests.filter((row) => row.status === "PENDING").length,
    [batchDeleteRequests]
  );

  const lastOpenProfileNonce = useRef<number | null>(null);

  const openProfileById = (profileId: string) => {
    setOpenProfileRequest({ id: profileId, nonce: Date.now() });
  };

  const openProfileEditor = (profile: RondePlannedProfileRef) => {
    setEditingProfile(profile);
    setProfileModalOpen(true);
    setProfilesListOpen(false);
  };

  /* Consommation openProfileRequest (toujours montée — plus d’onglet Gestion). */
  useEffect(() => {
    if (!openProfileRequest?.id) return;
    if (lastOpenProfileNonce.current === openProfileRequest.nonce) return;
    const target = references.plannedProfiles.find((p) => p.id === openProfileRequest.id) ?? null;
    if (!target) {
      onToast?.("Programmation introuvable.", "error");
      lastOpenProfileNonce.current = openProfileRequest.nonce;
      return;
    }
    lastOpenProfileNonce.current = openProfileRequest.nonce;
    setEditingProfile(target);
    setProfileModalOpen(true);
  }, [openProfileRequest?.nonce, openProfileRequest?.id, references.plannedProfiles, onToast]);

  /* Garde le profil édité synchronisé après reload. */
  useEffect(() => {
    if (!editingProfile?.id) return;
    const fresh = references.plannedProfiles.find((p) => p.id === editingProfile.id) ?? null;
    if (!fresh) {
      closeProfileModal();
      return;
    }
    if (
      fresh.updatedAt !== editingProfile.updatedAt ||
      fresh.cancellationRequestedAt !== editingProfile.cancellationRequestedAt ||
      fresh.planningValidTo !== editingProfile.planningValidTo ||
      fresh.isActive !== editingProfile.isActive
    ) {
      setEditingProfile(fresh);
    }
  }, [references.plannedProfiles]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Deep-link : ouverture automatique d'une ronde depuis une intervention liée ── */
  useEffect(() => {
    if (!focusRondeId) return;
    let cancelled = false;
    void (async () => {
      const rows = await ronde.loadEntries(true);
      if (cancelled) return;
      const found = rows.find((e) => e.id === focusRondeId);
      if (found) {
        setActiveEntry(found);
        setModalMode("edit");
        setModalOpen(true);
      } else {
        onToast?.("Ronde liée introuvable dans la liste.", "error");
      }
      onFocusRondeConsumed?.();
    })();
    return () => { cancelled = true; };
  }, [focusRondeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const familyOptions = useMemo(
    () =>
      Array.from(
        new Set(references.sites.map((s) => (s.famille || "").trim()).filter((v) => v.length > 0))
      ).sort((a, b) => a.localeCompare(b)),
    [references.sites]
  );

  const todayRondeBadgeCounts = useMemo(
    () => countTodayInProgressRondes(ronde.entries, getLocalDateIso()),
    [ronde.entries]
  );

  const linkedDemandGroup = useMemo(() => {
    if (!linkedDemandAnchorId) return [];
    const row = ronde.entries.find((e) => e.id === linkedDemandAnchorId);
    return row ? getExceptionalDemandGroup(row, ronde.entries) : [];
  }, [linkedDemandAnchorId, ronde.entries]);

  useEffect(() => {
    if (!linkedDemandAnchorId) return;
    if (!ronde.entries.some((e) => e.id === linkedDemandAnchorId)) {
      setLinkedDemandAnchorId(null);
    }
  }, [linkedDemandAnchorId, ronde.entries]);

  const filteredEntries = useMemo(() => {
    return filterAndSortRondeListEntries(
      ronde.entries.filter((entry) => !isContractualRondeEntry(entry)),
      {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        status: statusFilter,
        intervenantId: intervenantFilter,
        family: familyFilter,
        search: filters.search,
        sites: references.sites
      }
    );
  }, [filters.dateFrom, filters.dateTo, filters.search, familyFilter, intervenantFilter, references.sites, ronde.entries, statusFilter]);

  const contractualEntries = useMemo(
    () =>
      ronde.entries
        .filter((entry) => isContractualRondeEntry(entry))
        .sort((a, b) => a.requestDate.localeCompare(b.requestDate) || (a.dailyCode || "").localeCompare(b.dailyCode || "", "fr")),
    [ronde.entries]
  );
  const todayIso = useMemo(() => getLocalDateIso(), []);
  const contractualRangeFrom = filters.dateFrom || todayIso;
  const contractualRangeTo = filters.dateTo || filters.dateFrom || todayIso;
  const plannedFallbackVirtualEntries = useMemo(
    () =>
      buildPlannedFallbackVirtualEntries({
        entries: ronde.entries,
        profiles: references.plannedProfiles,
        holidays: references.holidays,
        intervenants: references.intervenants,
        dateFrom: contractualRangeFrom,
        dateTo: contractualRangeTo
      }),
    [
      contractualRangeFrom,
      contractualRangeTo,
      references.holidays,
      references.intervenants,
      references.plannedProfiles,
      ronde.entries
    ]
  );
  const contractualListEntries = useMemo(
    () => [...contractualEntries, ...plannedFallbackVirtualEntries],
    [contractualEntries, plannedFallbackVirtualEntries]
  );
  const filteredContractualListEntries = useMemo(() => {
    return filterAndSortRondeListEntries(contractualListEntries, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      status: statusFilter,
      intervenantId: intervenantFilter,
      family: familyFilter,
      search: filters.search,
      sites: references.sites
    });
  }, [contractualListEntries, familyFilter, filters.dateFrom, filters.dateTo, filters.search, intervenantFilter, references.sites, statusFilter]);
  const sharedListFiltersBar = (
    <RondeListFiltersBar
      search={filters.search}
      onSearchChange={filters.setSearch}
      dateFrom={filters.dateFrom}
      onDateFromChange={filters.setDateFrom}
      dateTo={filters.dateTo}
      onDateToChange={filters.setDateTo}
      onReset={() => {
        filters.reset();
        setStatusFilter("EN_COURS");
        setFamilyFilter("");
        setIntervenantFilter("");
      }}
      familyFilter={familyFilter}
      onFamilyFilterChange={setFamilyFilter}
      familyOptions={familyOptions}
      intervenantFilter={intervenantFilter}
      onIntervenantFilterChange={setIntervenantFilter}
      intervenantOptions={references.intervenants}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
    />
  );

  const handleExportContractual = async () => {
    if (!filteredContractualListEntries.length) {
      onToast?.("Aucune donnée à exporter avec les filtres actifs.", "warning");
      return;
    }
    try {
      await workstationExports.saveAndRemember(
        WORKSTATION_EXPORT_KEYS.excelRondeContractual,
        () => exportRondeToExcel(filteredContractualListEntries, "Ronde contractuelle"),
        onToast,
        `${filteredContractualListEntries.length} ligne(s) exportée(s) en Excel.`
      );
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.", "error");
    }
  };

  const handleExportExceptional = async () => {
    if (!filteredEntries.length) {
      onToast?.("Aucune donnée à exporter avec les filtres actifs.", "warning");
      return;
    }
    try {
      await workstationExports.saveAndRemember(
        WORKSTATION_EXPORT_KEYS.excelRondeExceptional,
        () => exportRondeToExcel(filteredEntries, "Ronde exceptionnelle"),
        onToast,
        `${filteredEntries.length} ligne(s) exportée(s) en Excel.`
      );
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.", "error");
    }
  };

  const handleExportRondeWord = async (entry: RondeEntry) => {
    try {
      await workstationExports.saveAndRemember(
        wordExportKey("ronde", entry.id),
        () =>
          exportRondeEntryToWord(entry, {
            profiles: references.plannedProfiles,
            holidays: references.holidays
          }),
        onToast,
        "Document Word enregistré."
      );
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Word impossible.", "error");
    }
  };

  const rondeExcelKey =
    listView === "planifie"
      ? WORKSTATION_EXPORT_KEYS.excelRondeContractual
      : WORKSTATION_EXPORT_KEYS.excelRondeExceptional;

  const activeFilteredCount =
    listView === "planifie" ? filteredContractualListEntries.length : filteredEntries.length;
  const totalPages =
    filters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(activeFilteredCount / filters.pageSize));
  const pageSliceStart = (filters.currentPage - 1) * filters.pageSize;
  const pagedEntries =
    filters.pageSize === 0
      ? filteredEntries
      : filteredEntries.slice(pageSliceStart, pageSliceStart + filters.pageSize);
  const pagedContractualEntries =
    filters.pageSize === 0
      ? filteredContractualListEntries
      : filteredContractualListEntries.slice(pageSliceStart, pageSliceStart + filters.pageSize);
  const liveActiveEntry = useMemo(() => {
    if (!activeEntry) return null;
    return ronde.entries.find((entry) => entry.id === activeEntry.id) || activeEntry;
  }, [activeEntry, ronde.entries]);

  useEffect(() => {
    if (filters.currentPage > totalPages) filters.setCurrentPage(totalPages);
  }, [filters.currentPage, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeServiceView = listView === "urgence" ? "urgence" : "planifie";
  const activeDisplayMode = displayModeByService[activeServiceView];

  const clearLinkedDemandNavigation = () => {
    setRequestPlanningReplay(null);
    setLinkedDemandAnchorId(null);
    setLinkedDemandOrigin(null);
  };

  const openRequestModal = (origin: RequestOrigin) => {
    setRequestFixedOrigin(origin);
    setRequestInitial(null);
    clearLinkedDemandNavigation();
    setRequestModalOpen(true);
  };

  /** Ouvre la demande / programmation liée depuis une fiche (tableau ou rapport). */
  const openLinkedDemand = (row: {
    source: RondeEntry["source"];
    plannedProfileId?: string | null;
    requestDate: string;
    motifTypeId: string | null;
    horairesDemandeObs: string;
    siteId: string | null;
    intervenantId: string | null;
    originInterventionId?: string | null;
    originKind?: RondeOriginKind;
    originDetail?: string;
    planningSnapshot?: RondePlanningSnapshotV1 | null;
    anchorRondeId?: string | null;
    /** Contexte de navigation pour le bouton retour. */
    returnOrigin?: "ronde-report" | "batch-delete-queue" | null;
  }) => {
    if (row.source === "PLANIFIE" && row.plannedProfileId) {
      setModalOpen(false);
      openProfileById(row.plannedProfileId);
      return;
    }
    if (row.source === "URGENCE" || row.source === "LIEE_INTERVENTION") {
      if (row.anchorRondeId) setLinkedDemandAnchorId(row.anchorRondeId);
      else setLinkedDemandAnchorId(null);
      setLinkedDemandOrigin(row.returnOrigin ?? (row.anchorRondeId ? "ronde-report" : null));
      const replay =
        row.planningSnapshot?.version === 1
          ? row.planningSnapshot
          : syntheticPlanningSnapshotForLinkedDemand(row);
      setRequestFixedOrigin(requestOriginFromStoredEntry(row));
      setRequestInitial({
        requestDate: row.requestDate,
        motifTypeId: row.motifTypeId,
        consigne: row.horairesDemandeObs || row.originDetail || "",
        siteId: row.siteId,
        intervenantId: row.intervenantId,
        interventionId: row.originInterventionId ?? null
      });
      setRequestPlanningReplay(replay);
      setModalOpen(false);
      setRequestModalOpen(true);
      return;
    }
    clearLinkedDemandNavigation();
    setRequestFixedOrigin(requestOriginFromStoredEntry(row));
    setRequestPlanningReplay(null);
    setRequestInitial({
      requestDate: row.requestDate,
      motifTypeId: row.motifTypeId,
      consigne: row.horairesDemandeObs || row.originDetail || "",
      siteId: row.siteId,
      intervenantId: row.intervenantId,
      interventionId: row.originInterventionId
    });
    setModalOpen(false);
    setRequestModalOpen(true);
  };

  const openLinkedDemandForEntry = (
    entry: RondeEntry,
    returnOrigin: "ronde-report" | "batch-delete-queue" | null = "ronde-report"
  ) => {
    openLinkedDemand({
      source: entry.source,
      plannedProfileId: entry.plannedProfileId,
      requestDate: entry.requestDate,
      motifTypeId: entry.motifTypeId,
      horairesDemandeObs: entry.horairesDemandeObs,
      siteId: entry.siteId,
      intervenantId: entry.intervenantId,
      originInterventionId: entry.originInterventionId,
      originKind: entry.originKind,
      originDetail: entry.originDetail,
      planningSnapshot: entry.requestPlanningSnapshot,
      anchorRondeId: entry.id,
      returnOrigin
    });
  };

  const openContractualRow = (entry: RondeEntry) => {
    if (entry.id.startsWith("virtual-planned-")) {
      if (!entry.siteId || !entry.plannedProfileId || !entry.plannedRoundKind || !entry.plannedSlotKey) {
        onToast?.("Créneau planifié incomplet, ouverture impossible.", "warning");
        return;
      }
      setCreatePreset({
        source: "PLANIFIE",
        requestDate: entry.requestDate,
        siteId: entry.siteId,
        intervenantId: entry.intervenantId ?? null,
        plannedProfileId: entry.plannedProfileId,
        plannedRoundKind: entry.plannedRoundKind,
        plannedSlotKey: entry.plannedSlotKey,
        planningHint: entry.horairesDemandeObs,
        motifTypeId: entry.motifTypeId
      });
      setModalMode("create");
      setActiveEntry(null);
      setModalOpen(true);
      return;
    }
    setCreatePreset(null);
    setActiveEntry(entry);
    setModalMode("edit");
    setModalOpen(true);
  };

  const serviceTabActions = (
    <RondeServiceTabActions
      listView={listView}
      activeDisplayMode={activeDisplayMode}
      canUpsertProfiles={Boolean(onUpsertRondePlannedProfile)}
      canManageCancellation={lifecycle.canManageCancellation}
      pendingCancellationCount={pendingCancellationCount}
      canManageBatchDelete={canManageRondes}
      pendingBatchDeleteCount={pendingBatchDeleteCount}
      onOpenProfilesList={() => setProfilesListOpen(true)}
      onExport={() =>
        void (listView === "planifie" ? handleExportContractual() : handleExportExceptional())
      }
      onOpenLastExport={() => void workstationExports.openLastExport(rondeExcelKey, onToast)}
      canOpenLastExport={workstationExports.canOpenExcelTemporarily(rondeExcelKey)}
      lastExportPath={workstationExports.getLastPath(rondeExcelKey)}
      onDisplayModeChange={(mode) =>
        setDisplayModeByService((prev) => ({
          ...prev,
          [activeServiceView]: mode
        }))
      }
      onOpenCancellationQueue={() => setCancellationQueueOpen(true)}
      onOpenBatchDeleteQueue={() => {
        void refreshBatchDeleteRequests();
        setBatchDeleteQueueOpen(true);
      }}
      onCreate={() => openRequestModal(listView === "planifie" ? "CONTRAT" : "APPEL_CLIENT")}
    />
  );

  const monthSummaryCards =
    listView === "planifie"
      ? [
          { label: "Total", value: ronde.monthStats.contractual.total },
          { label: "En cours", value: ronde.monthStats.contractual.inProgress },
          { label: "Effectuées", value: ronde.monthStats.contractual.closed },
          { label: "Non effectuées", value: ronde.monthStats.contractual.notPerformed }
        ]
      : [
          { label: "Total", value: ronde.monthStats.exceptional.total },
          { label: "En cours", value: ronde.monthStats.exceptional.inProgress },
          { label: "Clôturées", value: ronde.monthStats.exceptional.closed },
          { label: "Annulées", value: ronde.monthStats.exceptional.canceled }
        ];

  return (
    <>
      <MonthSummaryStatsBlock cards={monthSummaryCards} />

      <section className="panel main-courante-table-panel">
        <RondePageTabsBar
          listView={listView}
          onListViewChange={setListView}
          todayContractualCount={todayRondeBadgeCounts.contractual}
          todayExceptionalCount={todayRondeBadgeCounts.exceptional}
          actions={serviceTabActions}
        />
        {references.error ? <p className="error">{references.error}</p> : null}
        {activeDisplayMode === "list" ? sharedListFiltersBar : null}
        <ListLoadingOverlay loading={ronde.loading}>
        {listView === "planifie" ? (
          displayModeByService.planifie === "day" ? (
            <RondePlannedDaySection
              entries={ronde.entries}
              profiles={references.plannedProfiles}
              intervenants={references.intervenants}
              rondeMotifs={references.rondeMotifs}
              holidays={references.holidays}
              onNotify={onToast}
              onOpenCreatePlanned={(slot, dayIso) => {
                setCreatePreset({
                  source: "PLANIFIE",
                  requestDate: dayIso,
                  siteId: slot.siteId,
                  intervenantId: slot.defaultIntervenantId ?? null,
                  plannedProfileId: slot.profileId,
                  plannedRoundKind: slot.roundKind,
                  plannedSlotKey: slot.slotKey,
                  planningHint: slot.planningHint,
                  motifTypeId: slot.motifTypeId
                });
                setModalMode("create");
                setActiveEntry(null);
                setModalOpen(true);
              }}
              onOpenEntry={(entry) => {
                setCreatePreset(null);
                setActiveEntry(entry);
                setModalMode("edit");
                setModalOpen(true);
              }}
            />
          ) : (
            <>
              <RondeTable
                entries={pagedContractualEntries}
                onNotify={onToast}
                onOpen={openContractualRow}
                onFollowUp={openContractualRow}
                onOpenProfile={openProfileById}
                showOrigin={false}
              />
              <TablePaginationBar
                currentPage={filters.currentPage}
                totalPages={totalPages}
                totalItems={filteredContractualListEntries.length}
                pageSize={filters.pageSize}
                onPageChange={filters.setCurrentPage}
                onPageSizeChange={filters.setPageSize}
              />
            </>
          )
        ) : displayModeByService.urgence === "list" ? (
          <>
            <RondeTable
              entries={pagedEntries}
              onNotify={onToast}
              onOpen={(entry) => {
                setCreatePreset(null);
                setActiveEntry(entry);
                setModalMode("edit");
                setModalOpen(true);
              }}
              onFollowUp={(entry) => {
                setCreatePreset(null);
                setActiveEntry(entry);
                setModalMode("edit");
                setModalOpen(true);
              }}
              onOpenLinkedDemand={openLinkedDemandForEntry}
            />
            <TablePaginationBar
              currentPage={filters.currentPage}
              totalPages={totalPages}
              totalItems={filteredEntries.length}
              pageSize={filters.pageSize}
              onPageChange={filters.setCurrentPage}
              onPageSizeChange={filters.setPageSize}
            />
          </>
        ) : (
          <RondePlannedDaySection
            mode="entries"
            entries={ronde.entries.filter((entry) => !isContractualRondeEntry(entry))}
            profiles={references.plannedProfiles}
            intervenants={references.intervenants}
            rondeMotifs={references.rondeMotifs}
            holidays={references.holidays}
            onNotify={onToast}
            onOpenCreatePlanned={() => {
              // Non utilisé en mode "entries"
            }}
            onOpenEntry={(entry) => {
              setCreatePreset(null);
              setActiveEntry(entry);
              setModalMode("edit");
              setModalOpen(true);
            }}
          />
        )}
        </ListLoadingOverlay>
      </section>

      <RondeEntryModal
        isOpen={modalOpen}
        mode={modalMode}
        entry={liveActiveEntry}
        sites={references.sites}
        intervenants={references.intervenants}
        rondeMotifs={references.rondeMotifs}
        plannedProfiles={references.plannedProfiles}
        linkedInterventionEntry={null}
        onNotify={onToast}
        onClose={() => setModalOpen(false)}
        createPreset={createPreset}
        onCreate={ronde.createEntry}
        onUpdate={ronde.updateEntry}
        onSetStatus={ronde.setStatus}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        onNavigateToLinkedIntervention={onNavigateToLinkedIntervention}
        onOpenLinkedRequest={openLinkedDemand}
        requesterRole={requesterRole}
        onSaveWord={
          liveActiveEntry ? () => void handleExportRondeWord(liveActiveEntry) : undefined
        }
        onOpenWord={
          liveActiveEntry
            ? () => void workstationExports.openLastExport(wordExportKey("ronde", liveActiveEntry.id), onToast)
            : undefined
        }
        canOpenWord={
          liveActiveEntry
            ? Boolean(workstationExports.getLastPath(wordExportKey("ronde", liveActiveEntry.id)))
            : false
        }
        lastWordFilePath={
          liveActiveEntry ? workstationExports.getLastPath(wordExportKey("ronde", liveActiveEntry.id)) : null
        }
      />
      <RondeRequestModal
        isOpen={requestModalOpen}
        onClose={() => {
          setRequestModalOpen(false);
          clearLinkedDemandNavigation();
        }}
        fixedOrigin={requestFixedOrigin}
        initialRequestDate={requestInitial?.requestDate}
        initialMotifTypeId={requestInitial?.motifTypeId}
        initialConsigne={requestInitial?.consigne}
        initialSiteId={requestInitial?.siteId}
        initialIntervenantId={requestInitial?.intervenantId}
        initialInterventionId={requestInitial?.interventionId}
        onNavigateToLinkedIntervention={onNavigateToLinkedIntervention}
        replayPlanningSnapshot={requestPlanningReplay}
        requesterRole={requesterRole}
        linkedBatchEntries={linkedDemandAnchorId && linkedDemandGroup.length ? linkedDemandGroup : null}
        onSaveLinkedBatch={(payload) => ronde.updateBatchSharedFields(payload)}
        cancelLinkedBatchOne={async (entry, reason, kind) =>
          ronde.setStatus(entry.id, entry.updatedAt, "ANNULE", reason, kind)
        }
        bulkCancelLinkedBatch={canManageRondes ? ronde.bulkCancelBatch : undefined}
        bulkDeleteLinkedBatch={canManageRondes ? ronde.bulkDeleteBatch : undefined}
        requestLinkedBatchDelete={!canManageRondes ? ronde.requestBatchDelete : undefined}
        onOpenLinkedBatchRonde={(e) => {
          setRequestModalOpen(false);
          clearLinkedDemandNavigation();
          setCreatePreset(null);
          setActiveEntry(e);
          setModalMode("edit");
          setModalOpen(true);
        }}
        navigateBack={
          linkedDemandOrigin === "batch-delete-queue"
            ? {
                label: "Demandes de suppression",
                title: "Retour aux demandes de suppression",
                onNavigate: () => {
                  setRequestModalOpen(false);
                  clearLinkedDemandNavigation();
                  void refreshBatchDeleteRequests();
                  setBatchDeleteQueueOpen(true);
                }
              }
            : linkedDemandOrigin === "ronde-report" && linkedDemandAnchorId
              ? {
                  label: "Rapport de ronde",
                  title: "Retour au rapport de ronde",
                  onNavigate: () => {
                    const anchor = ronde.entries.find((e) => e.id === linkedDemandAnchorId);
                    if (!anchor) {
                      onToast?.("Rapport de ronde d'origine introuvable.", "error");
                      return;
                    }
                    setRequestModalOpen(false);
                    clearLinkedDemandNavigation();
                    setCreatePreset(null);
                    setActiveEntry(anchor);
                    setModalMode("edit");
                    setModalOpen(true);
                  }
                }
              : null
        }
        onNotify={onToast}
        sites={references.sites}
        intervenants={references.intervenants}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        holidays={references.holidays}
        rondeMotifs={references.rondeMotifs}
        onCreateEntry={async (payload) => ronde.createEntry(payload)}
        onCreateProfile={async (payload) => {
          if (!onUpsertRondePlannedProfile) {
            throw new Error("La création de profil n'est pas disponible.");
          }
          const result = await onUpsertRondePlannedProfile(payload);
          await references.reload();
          return result ?? undefined;
        }}
      />

      {onUpsertRondePlannedProfile ? (
        <RondeRequestModal
          isOpen={profileModalOpen}
          editProfile={editingProfile}
          sites={references.sites}
          intervenants={references.intervenants}
          rondeMotifs={references.rondeMotifs}
          requesterRole={requesterRole}
          onNotify={onToast}
          onClose={closeProfileModal}
          onStopProfile={
            lifecycle.canManageCancellation && onSetRondePlannedProfilePlanningEnd && editingProfile
              ? () => lifecycle.beginStop(editingProfile)
              : undefined
          }
          onRequestStopProfile={
            !lifecycle.canManageCancellation &&
            onRequestRondePlannedProfileCancellation &&
            editingProfile &&
            !editingProfile.cancellationRequestedAt
              ? () => lifecycle.beginRequestCancellation(editingProfile)
              : undefined
          }
          onDeleteProfile={
            lifecycle.canDelete && onDeleteRondePlannedProfile && editingProfile
              ? () => lifecycle.beginDelete(editingProfile)
              : undefined
          }
          onCreateProfile={async (payload) => {
            const result = await onUpsertRondePlannedProfile(payload);
            await references.reload();
            if (result) setEditingProfile(result);
            return result ?? undefined;
          }}
        />
      ) : null}

      <RondePlannedProfilesListModal
        isOpen={profilesListOpen}
        profiles={references.plannedProfiles}
        onClose={() => setProfilesListOpen(false)}
        onOpenProfile={openProfileEditor}
      />

      <RondePlannedCancellationQueueModal
        isOpen={cancellationQueueOpen}
        profiles={references.plannedProfiles}
        onClose={() => setCancellationQueueOpen(false)}
        onApprove={(profile) => {
          lifecycle.beginStop(profile);
        }}
        onReject={(profile) => {
          lifecycle.beginReject(profile);
        }}
        onOpenProfile={(profile) => {
          setCancellationQueueOpen(false);
          openProfileEditor(profile);
        }}
      />

      <RondeBatchDeleteQueueModal
        isOpen={batchDeleteQueueOpen}
        requests={batchDeleteRequests}
        onClose={() => setBatchDeleteQueueOpen(false)}
        onOpenLinkedDemand={(request) => {
          const anchorId = request.entryIds[0];
          const entry =
            (anchorId ? ronde.entries.find((e) => e.id === anchorId) : null) ||
            ronde.entries.find((e) => e.requestBatchId === request.requestBatchId) ||
            null;
          if (!entry) {
            onToast?.("Demande liée introuvable (fiches absentes ou déjà traitées).", "error");
            return;
          }
          setBatchDeleteQueueOpen(false);
          openLinkedDemandForEntry(entry, "batch-delete-queue");
        }}
        onApprove={async (requestBatchId, reviewReason) => {
          const res = await ronde.reviewBatchDeleteRequest(requestBatchId, "approve", reviewReason);
          if (res?.ok) {
            onToast?.("Demande de suppression approuvée.");
            await refreshBatchDeleteRequests();
            return true;
          }
          return false;
        }}
        onReject={async (requestBatchId, reviewReason) => {
          const res = await ronde.reviewBatchDeleteRequest(requestBatchId, "reject", reviewReason);
          if (res?.ok) {
            onToast?.("Demande de suppression refusée.");
            await refreshBatchDeleteRequests();
            return true;
          }
          return false;
        }}
      />

      <RondePlannedProfileLifecycleModals
        lifecycle={lifecycle}
        hasSetPlanningEnd={Boolean(onSetRondePlannedProfilePlanningEnd)}
        hasReviewCancellation={Boolean(onReviewRondePlannedProfileCancellationRequest)}
        hasRequestCancellation={Boolean(onRequestRondePlannedProfileCancellation)}
        hasDelete={Boolean(onDeleteRondePlannedProfile)}
      />

    </>
  );
}
