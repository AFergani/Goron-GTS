import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { Role } from "../../../types";
import type { RondeEntry, RondeOriginKind } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import { useRondePresenter } from "../presenter/useRondePresenter";
import { useRondeReferenceData } from "../presenter/useRondeReferenceData";
import { buildApplicablePlannedSlots } from "../model/plannedSlots";
import { RondeEntryModal } from "../components/RondeEntryModal";
import { RondeRequestModal } from "../components/RondeRequestModal";
import type { RequestOrigin } from "../components/RondeRequestModal";
import { RondeProfilesManageTab } from "../components/RondeProfilesManageTab";
import type { RondePlannedProfilePayload } from "../model/rondePlanned.types";
import { RondeTable } from "../components/RondeTable";
import { RondePlannedDaySection } from "../components/RondePlannedDaySection";
import { getExceptionalDemandGroup } from "../utils/exceptionalDemandGroup";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { exportRondeToExcel } from "../export/rondeExcelExport";
import { exportRondeEntryToWord } from "../export/rondeWordExport";
/** Anciens lots sans snapshot : hydratation minimale pour rouvrir la même modale que à la création. */
function syntheticPlanningSnapshotForLinkedDemand(row: {
  requestDate: string;
  motifTypeId: string | null;
  horairesDemandeObs: string;
  siteId: string | null;
  intervenantId: string | null;
  originInterventionId?: string | null;
  originKind?: RondeOriginKind;
  originDetail?: string;
}): RondePlanningSnapshotV1 {
  const origin: RequestOrigin = row.originInterventionId
    ? "SUITE_INTERVENTION"
    : row.originKind === "CLIENT"
      ? "APPEL_CLIENT"
      : row.originKind === "TELESURVEILLANCE"
        ? "CONTRAT"
        : "AUTRE";
  const rawDetail = String(row.originDetail ?? row.horairesDemandeObs ?? "").trim();
  const suitePrefix = /^Suite intervention\.\s*/i;
  const consigne = origin === "SUITE_INTERVENTION" ? rawDetail.replace(suitePrefix, "").trim() : rawDetail;
  return {
    version: 1,
    requestDate: row.requestDate,
    requestTime: "00:00",
    validFrom: row.requestDate,
    validTo: "",
    origin,
    motifTypeId: String(row.motifTypeId ?? "").trim(),
    consigne,
    siteId: row.siteId ?? null,
    intervenantId: String(row.intervenantId ?? ""),
    createRoundsEnabled: true,
    lines: [
      {
        roundKind: "OPENING",
        requestedTime: "08:00",
        randomWindowStart: "",
        randomWindowEnd: "",
        randomRoundsCount: "",
        intervalHours: "",
        intervalEndTime: "23:59",
        weekdaysMask: 0,
        includeHolidays: false,
        includeHolidayEves: false
      }
    ],
    originInterventionId: row.originInterventionId ?? null
  };
}

function isContractualEntry(entry: RondeEntry): boolean {
  return (
    entry.source === "PLANIFIE" ||
    Boolean(entry.plannedProfileId) ||
    Boolean(entry.plannedRoundKind) ||
    entry.requestPlanningSnapshot?.origin === "CONTRAT" ||
    entry.originKind === "TELESURVEILLANCE"
  );
}

function findExistingPlannedEntryForSlot(entries: RondeEntry[], dateIso: string, slotKey: string, profileId: string) {
  return entries.find(
    (entry) =>
      entry.source === "PLANIFIE" &&
      entry.requestDate === dateIso &&
      entry.plannedProfileId === profileId &&
      entry.plannedSlotKey === slotKey
  );
}

function enumerateDateRangeInclusive(fromIso: string, toIso: string): string[] {
  if (!fromIso || !toIso || fromIso > toIso) return [];
  const out: string[] = [];
  const cursor = new Date(`${fromIso}T12:00:00`);
  const end = new Date(`${toIso}T12:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

type RondePageProps = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onUpsertRondePlannedProfile?: (payload: RondePlannedProfilePayload) => void | Promise<void>;
  onDeleteRondePlannedProfile?: (id: string, reason: string) => void | Promise<void>;
  onSetRondePlannedProfilePlanningEnd?: (id: string, planningEndDate: string, reason: string) => void | Promise<void>;
};

const RONDE_DISPLAY_MODE_STORAGE_KEY = "rondeDisplayModeByService.v1";

export function RondePage({
  requesterRole,
  requesterUsername,
  onToast,
  onNavigateToLinkedIntervention,
  onUpsertRondePlannedProfile,
  onDeleteRondePlannedProfile,
  onSetRondePlannedProfilePlanningEnd
}: RondePageProps) {
  const [listView, setListView] = useState<"urgence" | "planifie" | "gestion">("planifie");
  const [displayModeByService, setDisplayModeByService] = useState<{
    planifie: "day" | "list";
    urgence: "day" | "list";
  }>(() => {
    if (typeof window === "undefined") {
      return { planifie: "day", urgence: "list" };
    }
    try {
      const raw = window.localStorage.getItem(RONDE_DISPLAY_MODE_STORAGE_KEY);
      if (!raw) return { planifie: "day", urgence: "list" };
      const parsed = JSON.parse(raw) as Partial<Record<"planifie" | "urgence", "day" | "list">>;
      const planifie = parsed.planifie === "day" || parsed.planifie === "list" ? parsed.planifie : "day";
      const urgence = parsed.urgence === "day" || parsed.urgence === "list" ? parsed.urgence : "list";
      return { planifie, urgence };
    } catch {
      return { planifie: "day", urgence: "list" };
    }
  });
  const filters = useTableFilters();
  const [statusFilter, setStatusFilterRaw] = useState("");
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

  const ronde = useRondePresenter({ requesterRole, requesterUsername, onToast });
  const references = useRondeReferenceData(requesterRole, requesterUsername, onToast);

  const familyOptions = useMemo(
    () =>
      Array.from(
        new Set(references.sites.map((s) => (s.famille || "").trim()).filter((v) => v.length > 0))
      ).sort((a, b) => a.localeCompare(b)),
    [references.sites]
  );

  /** Compte des rondes planifiées (source PLANIFIE) pour aujourd'hui */
  const plannedTodayCount = useMemo(() => {
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return ronde.entries.filter((e) => e.source === "PLANIFIE" && e.requestDate === todayIso).length;
  }, [ronde.entries]);

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
    const query = filters.search.trim().toLowerCase();
    const effectiveDateTo = filters.dateTo || filters.dateFrom;
    const siteById = new Map(references.sites.map((s) => [s.id, s]));
    return ronde.entries
      .filter((entry) => {
        if (isContractualEntry(entry)) return false;
        if (filters.dateFrom && entry.requestDate < filters.dateFrom) return false;
        if (effectiveDateTo && entry.requestDate > effectiveDateTo) return false;
        if (statusFilter && entry.status !== statusFilter) return false;
        if (intervenantFilter && entry.intervenantId !== intervenantFilter) return false;
        if (familyFilter) {
          const site = entry.siteId ? siteById.get(entry.siteId) : null;
          if (!site || (site.famille || "") !== familyFilter) return false;
        }
        if (!query) return true;
        return (
          entry.siteDisplay.toLowerCase().includes(query) ||
          entry.intervenantName.toLowerCase().includes(query) ||
          entry.horairesDemandeObs.toLowerCase().includes(query) ||
          entry.report.toLowerCase().includes(query) ||
          entry.workOrderNumber.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const left = Date.parse(`${a.requestDate}T12:00:00`);
        const right = Date.parse(`${b.requestDate}T12:00:00`);
        return right - left;
      });
  }, [filters.dateFrom, filters.dateTo, filters.search, familyFilter, intervenantFilter, references.sites, ronde.entries, statusFilter]);

  const contractualEntries = useMemo(
    () =>
      ronde.entries
        .filter((entry) => isContractualEntry(entry))
        .sort((a, b) => b.requestDate.localeCompare(a.requestDate)),
    [ronde.entries]
  );
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const contractualRangeFrom = filters.dateFrom || todayIso;
  const contractualRangeTo = filters.dateTo || filters.dateFrom || todayIso;
  const plannedFallbackVirtualEntries = useMemo(() => {
    const dateRange = enumerateDateRangeInclusive(contractualRangeFrom, contractualRangeTo);
    if (!dateRange.length) return [];
    const holidayDateIsos = references.holidays.map((h) => h.dateIso);
    const intervenantById = new Map(references.intervenants.map((i) => [i.id, i.name]));
    const existingPlannedByDate = new Map<string, RondeEntry[]>();
    for (const entry of ronde.entries) {
      if (entry.source !== "PLANIFIE") continue;
      const current = existingPlannedByDate.get(entry.requestDate);
      if (current) current.push(entry);
      else existingPlannedByDate.set(entry.requestDate, [entry]);
    }
    const virtualRows: RondeEntry[] = [];
    for (const dateIso of dateRange) {
      const daySlots = buildApplicablePlannedSlots(references.plannedProfiles, dateIso, holidayDateIsos);
      const dayEntries = existingPlannedByDate.get(dateIso) || [];
      daySlots
        .filter((slot) => !findExistingPlannedEntryForSlot(dayEntries, dateIso, slot.slotKey, slot.profileId))
        .forEach((slot, index) => {
          virtualRows.push({
            id: `virtual-planned-${dateIso}-${slot.profileId}-${slot.slotKey}-${index}`,
            createdAt: "",
            updatedAt: "",
            source: "PLANIFIE" as const,
            originInterventionId: null,
            siteId: slot.siteId,
            siteDisplay: slot.siteDisplay,
            requestDate: dateIso,
            motifTypeId: slot.motifTypeId,
            motifTypeLabel: "",
            motifRequiresFreeText: false,
            motifDetail: "",
            horairesDemandeObs: slot.planningHint || "",
            originKind: "TELESURVEILLANCE" as const,
            originDetail: "Planifiée",
            intervenantId: slot.defaultIntervenantId,
            intervenantName: slot.defaultIntervenantId ? intervenantById.get(slot.defaultIntervenantId) || "" : "",
            arrivalTime: "",
            departureTime: "",
            durationMinutes: null,
            workOrderNumber: "",
            report: "",
            // Créneau virtuel de planification: jamais clôturé tant qu'aucune fiche réelle n'est créée.
            status: "EN_COURS" as const,
            cancellationReason: "",
            closedAt: null,
            plannedProfileId: slot.profileId,
            plannedRoundKind: slot.roundKind,
            plannedSlotKey: slot.slotKey,
            closureCustomValues: {},
            requestPlanningSnapshot: null,
            requestBatchId: null,
            requestPlanningSnapshotJson: null
          });
        });
    }
    return virtualRows;
  }, [
    contractualRangeFrom,
    contractualRangeTo,
    references.holidays,
    references.intervenants,
    references.plannedProfiles,
    ronde.entries
  ]);
  const contractualListEntries = useMemo(
    () => [...contractualEntries, ...plannedFallbackVirtualEntries],
    [contractualEntries, plannedFallbackVirtualEntries]
  );
  const filteredContractualListEntries = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const effectiveDateTo = filters.dateTo || filters.dateFrom;
    const siteById = new Map(references.sites.map((s) => [s.id, s]));
    return contractualListEntries
      .filter((entry) => {
        if (filters.dateFrom && entry.requestDate < filters.dateFrom) return false;
        if (effectiveDateTo && entry.requestDate > effectiveDateTo) return false;
        if (statusFilter && entry.status !== statusFilter) return false;
        if (intervenantFilter && entry.intervenantId !== intervenantFilter) return false;
        if (familyFilter) {
          const site = entry.siteId ? siteById.get(entry.siteId) : null;
          if (!site || (site.famille || "") !== familyFilter) return false;
        }
        if (!query) return true;
        return (
          entry.siteDisplay.toLowerCase().includes(query) ||
          entry.intervenantName.toLowerCase().includes(query) ||
          entry.horairesDemandeObs.toLowerCase().includes(query) ||
          entry.report.toLowerCase().includes(query) ||
          entry.workOrderNumber.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const left = Date.parse(`${a.requestDate}T12:00:00`);
        const right = Date.parse(`${b.requestDate}T12:00:00`);
        return right - left;
      });
  }, [contractualListEntries, familyFilter, filters.dateFrom, filters.dateTo, filters.search, intervenantFilter, references.sites, statusFilter]);
  const sharedListFiltersBar = (
    <TableFiltersBar
      search={filters.search}
      onSearchChange={filters.setSearch}
      dateFrom={filters.dateFrom}
      onDateFromChange={filters.setDateFrom}
      dateTo={filters.dateTo}
      onDateToChange={filters.setDateTo}
      searchPlaceholder="Site, prestataire, horaires demandés, compte rendu…"
      onReset={() => { filters.reset(); setStatusFilter(""); setFamilyFilter(""); setIntervenantFilter(""); }}
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
          <option value="EN_COURS">En cours</option>
          <option value="CLOTURE">Clôturé</option>
          <option value="ANNULE">Annulé</option>
        </select>
      </label>
    </TableFiltersBar>
  );

  const handleExportContractual = () => {
    if (!filteredContractualListEntries.length) {
      onToast?.("Aucune donnée à exporter avec les filtres actifs.");
      return;
    }
    try {
      exportRondeToExcel(filteredContractualListEntries, "Ronde contractuelle");
      onToast?.(`${filteredContractualListEntries.length} ligne(s) exportée(s) en Excel.`);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.");
    }
  };

  const handleExportExceptional = () => {
    if (!filteredEntries.length) {
      onToast?.("Aucune donnée à exporter avec les filtres actifs.");
      return;
    }
    try {
      exportRondeToExcel(filteredEntries, "Ronde exceptionnelle");
      onToast?.(`${filteredEntries.length} ligne(s) exportée(s) en Excel.`);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.");
    }
  };

  const handleExportRondeWord = async (entry: RondeEntry) => {
    try {
      await exportRondeEntryToWord(entry, { profiles: references.plannedProfiles });
      onToast?.("Document Word exporté.");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Word impossible.");
    }
  };

  const totalPages = filters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredEntries.length / filters.pageSize));
  const pagedEntries = filters.pageSize === 0
    ? filteredEntries
    : filteredEntries.slice((filters.currentPage - 1) * filters.pageSize, filters.currentPage * filters.pageSize);
  const liveActiveEntry = useMemo(() => {
    if (!activeEntry) return null;
    return ronde.entries.find((entry) => entry.id === activeEntry.id) || activeEntry;
  }, [activeEntry, ronde.entries]);

  useEffect(() => {
    if (filters.currentPage > totalPages) filters.setCurrentPage(totalPages);
  }, [filters.currentPage, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RONDE_DISPLAY_MODE_STORAGE_KEY, JSON.stringify(displayModeByService));
  }, [displayModeByService]);

  return (
    <>
      <section className="panel main-log-stats">
        <div className="stat-card">
          <span>Total</span>
          <strong>{ronde.stats.total}</strong>
        </div>
        <div className="stat-card">
          <span>En cours</span>
          <strong>{ronde.stats.inProgress}</strong>
        </div>
        <div className="stat-card">
          <span>Clôturées</span>
          <strong>{ronde.stats.closed}</strong>
        </div>
        <div className="stat-card">
          <span>Annulées</span>
          <strong>{ronde.stats.canceled}</strong>
        </div>
      </section>

      <div className="tabs">
        <button type="button" className={listView === "planifie" ? "tab active" : "tab"} onClick={() => setListView("planifie")}>
          Ronde contractuelle
          {plannedTodayCount > 0 && <span className="gard-tab-badge">{plannedTodayCount}</span>}
        </button>
        <button type="button" className={listView === "urgence" ? "tab active" : "tab"} onClick={() => setListView("urgence")}>
          Ronde exceptionnelle
        </button>
        {onUpsertRondePlannedProfile ? (
          <button type="button" className={listView === "gestion" ? "tab active" : "tab"} onClick={() => { setListView("gestion"); setOpenProfileRequest(null); }}>
            Programmations
          </button>
        ) : null}
      </div>

      {listView === "gestion" && onUpsertRondePlannedProfile ? (
        <RondeProfilesManageTab
          sites={references.sites}
          intervenants={references.intervenants}
          rondeMotifTypes={references.rondeMotifs}
          profiles={references.plannedProfiles}
          loading={references.loading}
          error={references.error}
          onReload={references.reload}
          requesterRole={requesterRole}
          onUpsertRondePlannedProfile={onUpsertRondePlannedProfile}
          onDeleteRondePlannedProfile={onDeleteRondePlannedProfile}
          onSetRondePlannedProfilePlanningEnd={onSetRondePlannedProfilePlanningEnd}
          onNotify={onToast}
          openProfileRequest={openProfileRequest}
        />
      ) : null}

      {listView === "planifie" ? (
        <>
          <section className="panel">
            <div className="main-courante-table-toolbar" style={{ justifyContent: "flex-end", gap: 8 }}>
              <div className="row-actions" style={{ display: "inline-flex" }}>
                <button
                  type="button"
                  className="btn-light"
                  title="Exporter Excel (filtres actifs)"
                  aria-label="Exporter données (filtres actifs)"
                  onClick={handleExportContractual}
                  disabled={displayModeByService.planifie !== "list"}
                >
                  Export données
                </button>
              </div>
              <div className="row-actions" style={{ display: "inline-flex" }}>
                <ToggleSwitch
                  checked={displayModeByService.planifie === "day"}
                  onChange={(checked) => setDisplayModeByService((prev) => ({ ...prev, planifie: checked ? "day" : "list" }))}
                  label={displayModeByService.planifie === "day" ? "Affichage jour" : "Affichage liste"}
                  labelFirst
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequestFixedOrigin("CONTRAT");
                  setRequestInitial(null);
                  setRequestPlanningReplay(null);
                  setLinkedDemandAnchorId(null);
                  setRequestModalOpen(true);
                }}
              >
                <Plus size={16} aria-hidden style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
                Planifier une ronde
              </button>
            </div>
            {displayModeByService.planifie === "list" ? sharedListFiltersBar : null}
          </section>

          <section className="panel main-courante-table-panel">
            {displayModeByService.planifie === "day" ? (
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
              <RondeTable
                entries={filteredContractualListEntries}
                onNotify={onToast}
                onExportWord={handleExportRondeWord}
                onOpen={(entry) => {
                  if (entry.id.startsWith("virtual-planned-")) {
                    if (!entry.siteId || !entry.plannedProfileId || !entry.plannedRoundKind || !entry.plannedSlotKey) {
                      onToast?.("Créneau planifié incomplet, ouverture impossible.");
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
                }}
                onFollowUp={(entry) => {
                  if (entry.id.startsWith("virtual-planned-")) {
                    if (!entry.siteId || !entry.plannedProfileId || !entry.plannedRoundKind || !entry.plannedSlotKey) {
                      onToast?.("Créneau planifié incomplet, ouverture impossible.");
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
                }}
              />
            )}
          </section>
        </>
      ) : null}

      {listView === "urgence" ? (
      <>
      <section className="panel">
        {references.error ? <p className="error">{references.error}</p> : null}
        <div className="main-courante-table-toolbar" style={{ justifyContent: "flex-end", gap: 8 }}>
          <div className="row-actions" style={{ display: "inline-flex" }}>
            <button
              type="button"
              className="btn-light"
              title="Exporter Excel (filtres actifs)"
              aria-label="Exporter données (filtres actifs)"
              onClick={handleExportExceptional}
              disabled={displayModeByService.urgence !== "list"}
            >
              Export données
            </button>
          </div>
          <div className="row-actions" style={{ display: "inline-flex" }}>
            <ToggleSwitch
              checked={displayModeByService.urgence === "day"}
              onChange={(checked) => setDisplayModeByService((prev) => ({ ...prev, urgence: checked ? "day" : "list" }))}
              label={displayModeByService.urgence === "day" ? "Affichage jour" : "Affichage liste"}
              labelFirst
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setRequestFixedOrigin("APPEL_CLIENT");
              setRequestInitial(null);
              setRequestPlanningReplay(null);
              setLinkedDemandAnchorId(null);
              setRequestModalOpen(true);
            }}
          >
            <Plus size={16} aria-hidden style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Nouvelle ronde
          </button>
        </div>
        {displayModeByService.urgence === "list" ? sharedListFiltersBar : null}
      </section>

      <section className="panel main-courante-table-panel">
        {ronde.loading ? <p className="muted">Chargement des rondes…</p> : null}
        {displayModeByService.urgence === "list" ? (
          <>
            <RondeTable
              entries={pagedEntries}
              onNotify={onToast}
              onExportWord={handleExportRondeWord}
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
            entries={filteredEntries}
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
      </section>
      </>
      ) : null}

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
        onOpenLinkedRequest={(row) => {
          if (row.source === "PLANIFIE" && row.plannedProfileId) {
            setModalOpen(false);
            setListView("gestion");
            setOpenProfileRequest({ id: row.plannedProfileId, nonce: Date.now() });
            return;
          }
          if (row.source === "URGENCE" || row.source === "LIEE_INTERVENTION") {
            if (row.anchorRondeId) setLinkedDemandAnchorId(row.anchorRondeId);
            const replay =
              row.planningSnapshot?.version === 1 ? row.planningSnapshot : syntheticPlanningSnapshotForLinkedDemand(row);
            setRequestFixedOrigin(
              row.originInterventionId
                ? "SUITE_INTERVENTION"
                : row.originKind === "CLIENT"
                  ? "APPEL_CLIENT"
                  : "AUTRE"
            );
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
          setLinkedDemandAnchorId(null);
          const origin: RequestOrigin =
            row.source === "PLANIFIE"
              ? "CONTRAT"
              : row.originInterventionId
                ? "SUITE_INTERVENTION"
                : row.originKind === "CLIENT"
                  ? "APPEL_CLIENT"
                  : "AUTRE";
          setRequestFixedOrigin(origin);
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
        }}
      />
      <RondeRequestModal
        isOpen={requestModalOpen}
        onClose={() => {
          setRequestModalOpen(false);
          setRequestPlanningReplay(null);
          setLinkedDemandAnchorId(null);
        }}
        fixedOrigin={requestFixedOrigin}
        initialRequestDate={requestInitial?.requestDate}
        initialMotifTypeId={requestInitial?.motifTypeId}
        initialConsigne={requestInitial?.consigne}
        initialSiteId={requestInitial?.siteId}
        initialIntervenantId={requestInitial?.intervenantId}
        initialInterventionId={requestInitial?.interventionId}
        replayPlanningSnapshot={requestPlanningReplay}
        requesterRole={requesterRole}
        linkedBatchEntries={linkedDemandAnchorId && linkedDemandGroup.length ? linkedDemandGroup : null}
        onSaveLinkedBatch={(payload) => ronde.updateBatchSharedFields(payload)}
        bulkCancelLinkedBatch={ronde.bulkCancelBatch}
        bulkDeleteLinkedBatch={
          ronde.bulkDeleteBatch
        }
        onOpenLinkedBatchRonde={(e) => {
          setRequestModalOpen(false);
          setRequestPlanningReplay(null);
          setLinkedDemandAnchorId(null);
          setCreatePreset(null);
          setActiveEntry(e);
          setModalMode("edit");
          setModalOpen(true);
        }}
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
          await Promise.resolve(onUpsertRondePlannedProfile(payload));
          await references.reload();
        }}
      />

    </>
  );
}
