import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, StopCircle, Trash2 } from "lucide-react";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { RondeMotifTypeRef } from "../model/ronde.types";
import type {
  RondePlannedProfilePayload,
  RondePlannedProfileRef
} from "../model/rondePlanned.types";
import { summarizeRondePlannedProfile } from "../model/rondePlannedSummary";
import { formatLocalDateIso } from "../model/rondeCalendarLocal";
import { RondeRequestModal } from "./RondeRequestModal";
import { RondePlannedStopPlanningModal } from "../../settings/components/RondePlannedStopPlanningModal";
import { ConfirmModal } from "../../common/components/ConfirmModal";

type RondeProfilesManageTabProps = {
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  rondeMotifTypes: RondeMotifTypeRef[];
  profiles: RondePlannedProfileRef[];
  loading: boolean;
  error: string;
  requesterRole: Role;
  onReload: () => void | Promise<void>;
  onUpsertRondePlannedProfile: (payload: RondePlannedProfilePayload) => void | Promise<void>;
  onDeleteRondePlannedProfile?: (id: string, reason: string) => void | Promise<void>;
  onSetRondePlannedProfilePlanningEnd?: (id: string, planningEndDate: string, reason: string) => void | Promise<void>;
  onNotify?: (message: string) => void;
  openProfileRequest?: { id: string; nonce: number } | null;
};

export function RondeProfilesManageTab({
  sites,
  intervenants,
  rondeMotifTypes,
  profiles,
  loading,
  error,
  requesterRole,
  onReload,
  onUpsertRondePlannedProfile,
  onDeleteRondePlannedProfile,
  onSetRondePlannedProfilePlanningEnd,
  onNotify,
  openProfileRequest
}: RondeProfilesManageTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<RondePlannedProfileRef | null>(null);
  const [stopTarget, setStopTarget] = useState<RondePlannedProfileRef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RondePlannedProfileRef | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const tableFilters = useTableFilters();
  const [familyFilter, setFamilyFilterRaw] = useState("");
  const [intervenantFilter, setIntervenantFilterRaw] = useState("");
  const setFamilyFilter = (v: string) => { setFamilyFilterRaw(v); tableFilters.setCurrentPage(1); };
  const setIntervenantFilter = (v: string) => { setIntervenantFilterRaw(v); tableFilters.setCurrentPage(1); };

  const canDelete = requesterRole === "RESPONSABLE" || requesterRole === "DEV";

  const familyOptions = useMemo(
    () =>
      Array.from(
        new Set(sites.map((s) => (s.famille || "").trim()).filter((v) => v.length > 0))
      ).sort((a, b) => a.localeCompare(b)),
    [sites]
  );

  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const filteredProfiles = useMemo(() => {
    const q = tableFilters.search.trim().toLowerCase();
    const effectiveDateTo = tableFilters.dateTo || tableFilters.dateFrom;
    return [...profiles]
      .filter((p) => {
        if (q && !(
          (p.label || "").toLowerCase().includes(q) ||
          (p.siteDisplay || "").toLowerCase().includes(q) ||
          (p.intervenantDisplay || "").toLowerCase().includes(q)
        )) return false;
        if (familyFilter && p.siteId) {
          const site = siteById.get(p.siteId);
          if (!site || (site.famille || "") !== familyFilter) return false;
        } else if (familyFilter && !p.siteId) return false;
        if (intervenantFilter && p.intervenantId !== intervenantFilter) return false;
        if (tableFilters.dateFrom) {
          if (p.planningValidTo && p.planningValidTo < tableFilters.dateFrom) return false;
        }
        if (effectiveDateTo) {
          if (p.planningValidFrom && p.planningValidFrom > effectiveDateTo) return false;
        }
        return true;
      })
      .sort((a, b) => (a.label || "").localeCompare(b.label || "", "fr", { sensitivity: "base" }));
  }, [profiles, tableFilters.search, tableFilters.dateFrom, tableFilters.dateTo, familyFilter, intervenantFilter, siteById]);

  const totalPages = tableFilters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredProfiles.length / tableFilters.pageSize));
  const pagedProfiles = useMemo(
    () => tableFilters.pageSize === 0
      ? filteredProfiles
      : filteredProfiles.slice((tableFilters.currentPage - 1) * tableFilters.pageSize, tableFilters.currentPage * tableFilters.pageSize),
    [filteredProfiles, tableFilters.currentPage, tableFilters.pageSize]
  );

  /* Nonce du dernier openProfileRequest consommé — évite les réouvertures causées par le rechargement de `profiles`. */
  const lastConsumedNonce = useRef<number | null>(null);

  useEffect(() => {
    if (!openProfileRequest?.id) return;
    if (lastConsumedNonce.current === openProfileRequest.nonce) return;
    const target = profiles.find((p) => p.id === openProfileRequest.id) ?? null;
    if (!target) {
      onNotify?.("Demande liée introuvable (planification).");
      return;
    }
    lastConsumedNonce.current = openProfileRequest.nonce;
    setModalMode("edit");
    setEditing(target);
    setModalOpen(true);
  }, [openProfileRequest?.nonce, openProfileRequest?.id, profiles, onNotify]);

  return (
    <>
      <section className="panel">
        <TableFiltersBar
          search={tableFilters.search}
          onSearchChange={tableFilters.setSearch}
          dateFrom={tableFilters.dateFrom}
          onDateFromChange={tableFilters.setDateFrom}
          dateTo={tableFilters.dateTo}
          onDateToChange={tableFilters.setDateTo}
          searchPlaceholder="Profil, site, prestataire…"
          onReset={() => { tableFilters.reset(); setFamilyFilter(""); setIntervenantFilter(""); }}
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
              {intervenants.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </label>
        </TableFiltersBar>
      </section>

      {/* Panel tableau */}
      <section className="panel main-courante-table-panel">
        <div className="main-courante-table-toolbar" style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => { setModalMode("create"); setEditing(null); setModalOpen(true); }}
          >
            <Plus size={16} aria-hidden style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
            Planifier une ronde
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p className="muted">Chargement…</p> : null}

        <div className="table-scroll-x">
          <table className="data-table-fixed">
            <thead>
              <tr>
                <th>Profil</th>
                <th>Prestataire</th>
                <th>En cours</th>
                <th>Résumé</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!pagedProfiles.length && !loading ? (
                <tr>
                  <td colSpan={5} className="muted">Aucune programmation.</td>
                </tr>
              ) : (
                pagedProfiles.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div>{row.label}</div>
                      {row.siteDisplay ? <div className="muted" style={{ fontSize: "0.82em" }}>{row.siteDisplay}</div> : null}
                    </td>
                    <td>{row.intervenantDisplay ?? "—"}</td>
                    <td>
                      <span className={`mc-status-badge mc-status-badge--${row.isActive ? "info" : "default"}`}>
                        <span className="mc-status-badge__dot" />
                        <span className="mc-status-badge__label">{row.isActive ? "Actif" : "Inactif"}</span>
                      </span>
                    </td>
                    <td className="muted" title={summarizeRondePlannedProfile(row)}>
                      {summarizeRondePlannedProfile(row)}
                    </td>
                    <td>
                      <div className="row-actions mc-row-actions-wrap">
                        <button
                          type="button"
                          className="action-icon-btn btn-light"
                          title="Modifier"
                          aria-label={`Modifier ${row.label}`}
                          onClick={() => { setModalMode("edit"); setEditing(row); setModalOpen(true); }}
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                        {onSetRondePlannedProfilePlanningEnd ? (
                          <button
                            type="button"
                            className="action-icon-btn btn-light"
                            title="Arrêter le flux (date de fin)"
                            aria-label={`Arrêter le flux ${row.label}`}
                            onClick={() => setStopTarget(row)}
                          >
                            <StopCircle size={16} aria-hidden />
                          </button>
                        ) : null}
                        {canDelete && onDeleteRondePlannedProfile ? (
                          <button
                            type="button"
                            className="action-icon-btn btn-danger"
                            title="Supprimer / désactiver la programmation"
                            aria-label={`Supprimer la programmation ${row.label}`}
                            onClick={() => { setDeleteTarget(row); setDeleteReason(""); }}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          currentPage={tableFilters.currentPage}
          totalPages={totalPages}
          totalItems={filteredProfiles.length}
          pageSize={tableFilters.pageSize}
          onPageChange={tableFilters.setCurrentPage}
          onPageSizeChange={tableFilters.setPageSize}
        />
      </section>

      <RondeRequestModal
        isOpen={modalOpen}
        editProfile={modalMode === "edit" ? editing : null}
        sites={sites}
        intervenants={intervenants}
        rondeMotifs={rondeMotifTypes}
        requesterRole={requesterRole}
        onNotify={onNotify}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onCreateProfile={async (payload) => {
          await Promise.resolve(onUpsertRondePlannedProfile(payload));
          setModalOpen(false);
          setEditing(null);
          await onReload();
        }}
      />

      <RondePlannedStopPlanningModal
        isOpen={Boolean(stopTarget)}
        profileLabel={stopTarget?.label || ""}
        defaultEndDate={stopTarget?.planningValidTo || formatLocalDateIso(new Date())}
        onClose={() => setStopTarget(null)}
        onConfirm={async (planningEndDate, reason) => {
          if (!stopTarget || !onSetRondePlannedProfilePlanningEnd) return;
          await Promise.resolve(onSetRondePlannedProfilePlanningEnd(stopTarget.id, planningEndDate, reason));
          setStopTarget(null);
          await onReload();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Supprimer la programmation"
        message={
          deleteTarget
            ? `Programmation: "${deleteTarget.label}". Si des rondes clôturées sont liées, la programmation sera désactivée (historique préservé). Sinon, elle sera supprimée avec toutes ses rondes en cours.`
            : ""
        }
        confirmLabel={deleteSubmitting ? "Suppression…" : "Confirmer"}
        confirmClassName="btn-danger"
        confirmDisabled={deleteSubmitting || !deleteReason.trim()}
        onCancel={() => { if (!deleteSubmitting) setDeleteTarget(null); }}
        onConfirm={async () => {
          if (!deleteTarget || !onDeleteRondePlannedProfile) return;
          const reason = deleteReason.trim();
          if (!reason) {
            onNotify?.("Le motif est obligatoire.");
            return;
          }
          try {
            setDeleteSubmitting(true);
            const result = await Promise.resolve(onDeleteRondePlannedProfile(deleteTarget.id, reason)) as { action?: string } | undefined;
            setDeleteTarget(null);
            setDeleteReason("");
            await onReload();
            const action = (result as { action?: string } | null)?.action;
            onNotify?.(action === "deactivated" ? "Programmation désactivée (rondes clôturées conservées)." : "Programmation supprimée.");
          } catch (err) {
            onNotify?.(err instanceof Error ? err.message : "Opération impossible.");
          } finally {
            setDeleteSubmitting(false);
          }
        }}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
            Motif (obligatoire) <span style={{ color: "var(--danger, #e55)" }}>*</span>
          </span>
          <textarea
            className="mc-textarea"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={3}
            placeholder="Ex.: prestation annulée par le client"
            disabled={deleteSubmitting}
            autoFocus
          />
        </label>
      </ConfirmModal>
    </>
  );
}
