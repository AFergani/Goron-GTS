/**
 * Page Interventions : liste filtrée, statistiques, modale, exports, liens ronde/gardiennage.
 *
 * Deep-link `focusInterventionId` depuis AppShell (ronde liée). Permissions ronde/gardiennage
 * pour créer des fiches liées depuis une intervention clôturée.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Role } from "../../../types";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { InterventionEntry } from "../model/intervention.types";
import { useInterventionPresenter } from "../presenter/useInterventionPresenter";
import { useInterventionReferenceData } from "../presenter/useInterventionReferenceData";
import { InterventionEntryModal } from "../components/InterventionEntryModal";
import { InterventionTable } from "../components/InterventionTable";
import { exportInterventionToExcel } from "../export/interventionExcelExport";
import { exportInterventionEntryToWord } from "../export/interventionWordExport";
import { RondeRequestModal } from "../../rondes/components/RondeRequestModal";
import type { RondeMotifTypeRef, RondeSavePayload } from "../../rondes/model/ronde.types";
import { GardiennageEntryModal } from "../../gardiennage/components/GardiennageEntryModal";
import type { GardiennageSavePayload } from "../../gardiennage/model/gardiennage.types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
type InterventionPageProps = {
  requesterRole: Role;
  requesterUsername: string;
  /** Aligné sur la permission d’accès à la page Rondes (bouton ronde liée). */
  canAccessRondes?: boolean;
  /** Aligné sur la permission d'accès à la page Gardiennage (bouton gardiennage lié). */
  canAccessGardiennage?: boolean;
  onToast?: (message: string) => void;
  /** Id intervention à ouvrir (navigation depuis une ronde liée). */
  focusInterventionId?: string | null;
  onFocusInterventionConsumed?: () => void;
};

function makeRondeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ronde-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeGardiennageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gard-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function InterventionPage({
  requesterRole,
  requesterUsername,
  canAccessRondes = false,
  canAccessGardiennage = false,
  onToast,
  focusInterventionId,
  onFocusInterventionConsumed
}: InterventionPageProps) {
  const filters = useTableFilters();
  const [statusFilter, setStatusFilterRaw] = useState("");
  const [familyFilter, setFamilyFilterRaw] = useState("");
  const [intervenantFilter, setIntervenantFilterRaw] = useState("");

  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); filters.setCurrentPage(1); };
  const setFamilyFilter = (v: string) => { setFamilyFilterRaw(v); filters.setCurrentPage(1); };
  const setIntervenantFilter = (v: string) => { setIntervenantFilterRaw(v); filters.setCurrentPage(1); };
  const [modalMode, setModalMode] = useState<"create" | "edit" | "facturation">("create");
  const [activeEntry, setActiveEntry] = useState<InterventionEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [linkedRondeOpen, setLinkedRondeOpen] = useState(false);
  const [linkedInterventionForRonde, setLinkedInterventionForRonde] = useState<InterventionEntry | null>(null);
  const [rondeMotifsForModal, setRondeMotifsForModal] = useState<RondeMotifTypeRef[]>([]);
  const [linkedGardiennageOpen, setLinkedGardiennageOpen] = useState(false);
  const [linkedInterventionForGardiennage, setLinkedInterventionForGardiennage] = useState<InterventionEntry | null>(null);

  const intervention = useInterventionPresenter({ requesterRole, requesterUsername, onToast });
  const references = useInterventionReferenceData(requesterRole, requesterUsername, onToast);
  const isResponsable = requesterRole === "RESPONSABLE" || requesterRole === "DEV";

  useEffect(() => {
    if (!canAccessRondes) {
      setRondeMotifsForModal([]);
      return;
    }
    let cancelled = false;
    void gtsApiClient
      .listRondeMotifTypes({ requesterRole })
      .then((rows) => {
        if (!cancelled) setRondeMotifsForModal(rows);
      })
      .catch(() => {
        if (!cancelled) setRondeMotifsForModal([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canAccessRondes, requesterRole]);

  useEffect(() => {
    if (!focusInterventionId) return;
    let cancelled = false;
    void (async () => {
      const rows = await intervention.loadEntries(true);
      if (cancelled) return;
      const found = rows.find((e) => e.id === focusInterventionId);
      if (found) {
        setActiveEntry(found);
        setModalMode(isResponsable && found.status === "CLOTURE" ? "facturation" : "edit");
        setModalOpen(true);
      } else {
        onToast?.("Intervention liée introuvable dans la liste.");
      }
      onFocusInterventionConsumed?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [focusInterventionId]); // eslint-disable-line react-hooks/exhaustive-deps -- ouverture déclenchée uniquement depuis une ronde liée

  const filteredEntries = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    /* Si seul dateFrom est renseigné, on filtre sur cette date exacte */
    const effectiveDateTo = filters.dateTo || filters.dateFrom;
    const siteById = new Map(references.sites.map((site) => [site.id, site]));
    return intervention.entries
      .filter((entry) => {
        if (filters.dateFrom && entry.requestDate < filters.dateFrom) return false;
        if (effectiveDateTo && entry.requestDate > effectiveDateTo) return false;
        if (statusFilter && entry.status !== statusFilter) return false;
        if (familyFilter) {
          const site = entry.siteId ? siteById.get(entry.siteId) : null;
          if (!site || (site.famille || "") !== familyFilter) return false;
        }
        if (intervenantFilter && entry.intervenantId !== intervenantFilter) return false;
        if (!query) return true;
        return (
          entry.siteDisplay.toLowerCase().includes(query) ||
          entry.requestReason.toLowerCase().includes(query) ||
          entry.intervenantName.toLowerCase().includes(query) ||
          entry.workOrderNumber.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const left = Date.parse(`${a.requestDate}T${a.requestTime || "00:00"}:00`);
        const right = Date.parse(`${b.requestDate}T${b.requestTime || "00:00"}:00`);
        return right - left;
      });
  }, [filters.dateFrom, filters.dateTo, filters.search, familyFilter, intervention.entries, intervenantFilter, references.sites, statusFilter]);

  const familyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          references.sites
            .map((site) => (site.famille || "").trim())
            .filter((value) => value.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [references.sites]
  );

  const totalPages = filters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredEntries.length / filters.pageSize));
  const pagedEntries = filters.pageSize === 0
    ? filteredEntries
    : filteredEntries.slice((filters.currentPage - 1) * filters.pageSize, filters.currentPage * filters.pageSize);
  const liveActiveEntry = useMemo(() => {
    if (!activeEntry) return null;
    return intervention.entries.find((entry) => entry.id === activeEntry.id) || activeEntry;
  }, [activeEntry, intervention.entries]);

  useEffect(() => {
    if (filters.currentPage > totalPages) filters.setCurrentPage(totalPages);
  }, [filters.currentPage, totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setModalMode("create");
    setActiveEntry(null);
    setModalOpen(true);
  };

  const handleExportExcel = () => {
    if (filteredEntries.length === 0) return;
    try {
      exportInterventionToExcel(filteredEntries);
      onToast?.("Export Excel téléchargé.");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Excel impossible.");
    }
  };

  const handleExportWord = async (entry: InterventionEntry) => {
    try {
      await exportInterventionEntryToWord(entry);
      onToast?.("Document Word téléchargé.");
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Export Word impossible.");
    }
  };

  const createLinkedRonde = async (
    payload: RondeSavePayload & { source: "URGENCE" | "LIEE_INTERVENTION"; originInterventionId?: string | null }
  ) => {
    try {
      const { source, originInterventionId, ...body } = payload;
      await gtsApiClient.createRondeEntry({
        requesterRole,
        requesterUsername,
        id: makeRondeId(),
        source,
        originInterventionId: originInterventionId ?? null,
        ...body
      });
      onToast?.("Ronde créée.");
      return true;
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Création de ronde impossible.");
      return false;
    }
  };

  const createLinkedGardiennage = async (payload: GardiennageSavePayload) => {
    try {
      await gtsApiClient.createGardiennage({
        requesterRole,
        requesterUsername,
        id: makeGardiennageId(),
        ...payload
      });
      onToast?.("Gardiennage créé.");
      return true;
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Création de gardiennage impossible.");
      return false;
    }
  };

  return (
    <>
      <section className="panel main-log-stats">
        <div className="stat-card">
          <span>Total</span>
          <strong>{intervention.stats.total}</strong>
        </div>
        <div className="stat-card">
          <span>En cours</span>
          <strong>{intervention.stats.inProgress}</strong>
        </div>
        <div className="stat-card">
          <span>Clôturées</span>
          <strong>{intervention.stats.closed}</strong>
        </div>
        <div className="stat-card">
          <span>Annulées</span>
          <strong>{intervention.stats.canceled}</strong>
        </div>
      </section>

      <section className="panel">
        {references.error ? <p className="error">{references.error}</p> : null}
        <TableFiltersBar
          search={filters.search}
          onSearchChange={filters.setSearch}
          dateFrom={filters.dateFrom}
          onDateFromChange={filters.setDateFrom}
          dateTo={filters.dateTo}
          onDateToChange={filters.setDateTo}
          searchPlaceholder="Site, motif, prestataire, bon inter…"
          onReset={() => {
            filters.reset();
            setStatusFilter("");
            setFamilyFilter("");
            setIntervenantFilter("");
          }}
        >
          <label>
            Famille
            <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}>
              <option value="">Toutes</option>
              {familyOptions.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prestataire
            <select value={intervenantFilter} onChange={(e) => setIntervenantFilter(e.target.value)}>
              <option value="">Tous</option>
              {references.intervenants.map((intervenant) => (
                <option key={intervenant.id} value={intervenant.id}>
                  {intervenant.name}
                </option>
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
      </section>

      <section className="panel main-courante-table-panel">
        <div className="main-courante-table-toolbar">
          <button
            type="button"
            className="btn-light"
            disabled={intervention.loading || filteredEntries.length === 0}
            onClick={handleExportExcel}
          >
            Exporter données
          </button>
          <button type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Nouvelle intervention
          </button>
        </div>
        {intervention.loading ? <p className="muted">Chargement des interventions…</p> : null}
        <InterventionTable
          entries={pagedEntries}
          onNotify={onToast}
          onOpen={(entry) => {
            setActiveEntry(entry);
            setModalMode(isResponsable ? "facturation" : "edit");
            setModalOpen(true);
          }}
          onFollowUp={(entry) => {
            setActiveEntry(entry);
            setModalMode("edit");
            setModalOpen(true);
          }}
          onPrint={(entry) => void handleExportWord(entry)}
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

      <InterventionEntryModal
        isOpen={modalOpen}
        mode={modalMode}
        entry={liveActiveEntry}
        sites={references.sites}
        intervenants={references.intervenants}
        requesterRole={requesterRole}
        isResponsable={isResponsable}
        onClose={() => setModalOpen(false)}
        onCreate={intervention.createEntry}
        onUpdate={intervention.updateEntry}
        onSetStatus={intervention.setStatus}
        onSetBillingStatus={intervention.setBillingStatus}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        onNotify={onToast}
        onAfterReopen={() => setModalMode("edit")}
        canOpenLinkedRonde={Boolean(canAccessRondes && liveActiveEntry && liveActiveEntry.status === "EN_COURS")}
        onOpenLinkedRonde={() => {
          if (!liveActiveEntry) return;
          setLinkedInterventionForRonde(liveActiveEntry);
          setLinkedRondeOpen(true);
        }}
        canOpenLinkedGardiennage={Boolean(canAccessGardiennage && liveActiveEntry && liveActiveEntry.status === "EN_COURS")}
        onOpenLinkedGardiennage={() => {
          if (!liveActiveEntry) return;
          setLinkedInterventionForGardiennage(liveActiveEntry);
          setLinkedGardiennageOpen(true);
        }}
      />

      <RondeRequestModal
        isOpen={linkedRondeOpen}
        fixedOrigin="SUITE_INTERVENTION"
        initialInterventionId={linkedInterventionForRonde?.id ?? null}
        initialSiteId={linkedInterventionForRonde?.siteId ?? null}
        initialSiteDisplay={linkedInterventionForRonde?.siteDisplay ?? null}
        initialIntervenantId={linkedInterventionForRonde?.intervenantId ?? null}
        initialIntervenantName={linkedInterventionForRonde?.intervenantName ?? null}
        sites={references.sites}
        intervenants={references.intervenants}
        rondeMotifs={rondeMotifsForModal}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        onNotify={onToast}
        onClose={() => {
          setLinkedRondeOpen(false);
          setLinkedInterventionForRonde(null);
        }}
        onCreateEntry={createLinkedRonde}
        onCreateProfile={async () => {
          throw new Error("La planification de profil depuis une intervention n'est pas autorisée.");
        }}
      />
      <GardiennageEntryModal
        isOpen={linkedGardiennageOpen}
        mode="create"
        entry={null}
        sites={references.sites}
        intervenants={references.intervenants}
        requesterRole={requesterRole}
        createPreset={
          linkedInterventionForGardiennage
            ? {
                siteId: linkedInterventionForGardiennage.siteId,
                siteDisplay: linkedInterventionForGardiennage.siteDisplay,
                intervenantId: linkedInterventionForGardiennage.intervenantId,
                intervenantName: linkedInterventionForGardiennage.intervenantName,
                linkedInterventionId: linkedInterventionForGardiennage.id
              }
            : null
        }
        onClose={() => {
          setLinkedGardiennageOpen(false);
          setLinkedInterventionForGardiennage(null);
        }}
        onCreate={createLinkedGardiennage}
        onUpdate={async () => null}
        onNotify={onToast}
      />

    </>
  );
}
