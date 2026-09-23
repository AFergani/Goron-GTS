/**
 * Page Paramètres : onglets opérateurs, données, modèles et variables, BDD, journal
 * (logs applicatifs + logs techniques).
 *
 * Filtres audit paginés, droits station (directeur / responsable de station / Admin).
 * Pas d’affichage d’identifiants techniques en liste.
 */

import { useEffect, useMemo, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { Plus } from "lucide-react";
import { AuditTable } from "../components/AuditTable";
import { TechErrorLogsTable } from "../components/TechErrorLogsTable";
import { JournalFiltersBar, matchesJournalDateRange } from "../components/JournalFiltersBar";
import { CreateUserModal } from "../components/CreateUserModal";
import { DataManagementPanel } from "../components/DataManagementPanel";
import { TemplatesManagementPanel } from "../components/TemplatesManagementPanel";
import { VariablesManagementPanel } from "../components/VariablesManagementPanel";
import { PostgresBackupPanel } from "../components/PostgresBackupPanel";
import { UsersTable } from "../components/UsersTable";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import { ListExportButtons } from "../../common/components/ExportFileButtons";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { WORKSTATION_EXPORT_KEYS } from "../../common/utils/workstationExportPaths";
import type { SaveExportFileResult } from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import type { CreateUserFormState, DataRefreshTarget, DataTab, DocumentsTab, SettingsTab } from "../model/settings.types";
import type { NotifyToast } from "../../common/model/toast.types";
import type { TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
import type {
  AnomalyTypeRef,
  AuditLog,
  FransorResponsableRef,
  HolidayRef,
  IntervenantRef,
  SiteRef,
  User
} from "../../../types";
import type { PendingIntervenant, PendingSite } from "../../common/model/pendingRefs.types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import type { RondePlannedProfileRef } from "../../rondes/model/rondePlanned.types";
import {
  formatAuditActionLabel,
  formatAuditStatus,
  resolveAuditFamily
} from "../model/auditActionLabels";
import {
  formatTechStatusLabel,
  getTechStatusTone,
  resolveTechFamily
} from "../model/techErrorLogsDisplay";

type SettingsPageProps = {
  session: Session | null;
  canManageUsers: boolean;
  /** Inclut le superviseur, dont la portée est bornée par la hiérarchie. */
  canAccessOperatorsTab: boolean;
  canManageData: boolean;
  canDeleteData: boolean;
  requesterRole: Role;
  activeTab: SettingsTab;
  users: User[];
  activeUsernames: string[];
  auditLogs: AuditLog[];
  techErrorLogs: TechErrorLog[];
  auditMetadata: { firstOccurredAt: string | null; lastOccurredAt: string | null; total: number };
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  anomalyTypes: AnomalyTypeRef[];
  holidays: HolidayRef[];
  rondeMotifTypes: RondeMotifTypeRef[];
  rondePlannedProfiles: RondePlannedProfileRef[];
  fransorResponsables: FransorResponsableRef[];
  pendingSites: PendingSite[];
  pendingIntervenants: PendingIntervenant[];
  currentUsername: string;
  onTabChange: (next: SettingsTab) => void;
  activeDataTab: DataTab;
  onDataTabChange: (next: DataTab) => void;
  activeDocumentsTab: DocumentsTab;
  onDocumentsTabChange: (next: DocumentsTab) => void;
  onOpenCreate: () => void;
  onExportAuditLogs: (logs?: AuditLog[]) => Promise<SaveExportFileResult>;
  onExportTechErrorLogs: (logs?: TechErrorLog[]) => Promise<SaveExportFileResult>;
  onDeactivateUser: (user: User) => void;
  onReactivateUser: (user: User) => void;
  onUnlockUser: (user: User) => void;
  onRequestPasswordReset: (user: User) => void;
  onOpenEditUser: (user: User) => void;
  onCreateSite: (payload: { code: string; name: string; address: string; parc: string; famille: string }) => void;
  onUpdateSite: (payload: { id: string; code: string; name: string; address: string; parc: string; famille: string }) => void;
  onDeleteSite: (id: string, reason: string) => void;
  onCreateIntervenant: (name: string) => void;
  onUpdateIntervenant: (id: string, name: string) => void;
  onDeleteIntervenant: (id: string, reason: string) => void;
  onCreateType: (label: string, colorHex: string) => void;
  onUpdateType: (id: string, label: string, colorHex: string) => void;
  onDeleteType: (id: string, reason: string) => void;
  onCreateHoliday: (dateIso: string, label: string) => void;
  onUpdateHoliday: (id: string, dateIso: string, label: string) => void;
  onDeleteHoliday: (id: string, reason: string) => void;
  onCreateRondeMotifType: (label: string, colorHex: string) => void;
  onUpdateRondeMotifType: (id: string, label: string, colorHex: string) => void;
  onDeleteRondeMotifType: (id: string, reason: string) => void;
  onCreateFransorResponsable: (name: string) => void;
  onUpdateFransorResponsable: (id: string, name: string) => void;
  onDeleteFransorResponsable: (id: string, reason: string) => void;
  onImportSiteRow: (payload: { code: string; name: string; address: string; parc: string; famille: string }) => Promise<void>;
  onImportIntervenantRow: (name: string) => Promise<void>;
  onImportTypeRow: (label: string) => Promise<void>;
  onLogImportSummary: (payload: {
    target: "sites" | "intervenants" | "types";
    fileName: string;
    total: number;
    success: number;
    failed: number;
    errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
  }) => Promise<void>;
  onRefreshImportedData: (target: DataRefreshTarget) => Promise<void>;
  onResolvePendingSite: (payload: { pendingId: string; parc: string; famille: string; address: string }) => void | Promise<void>;
  onResolvePendingIntervenant: (payload: { pendingId: string; name: string }) => void | Promise<void>;
  onDeletePendingSiteSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onDeletePendingIntervenantSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onNotify: NotifyToast;
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onCreateFormChange: (next: CreateUserFormState) => void;
  createForm: CreateUserFormState;
  onSubmitCreate: () => void | Promise<void>;
  userModalMode: "create" | "edit";
  editingTechnicalUsername?: string;
};

export function SettingsPage(props: SettingsPageProps) {
  const [userFilter, setUserFilter] = useState<"active" | "inactive" | "all">("active");
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditFamilyFilter, setAuditFamilyFilter] = useState("all");
  const [auditStatusFilter, setAuditStatusFilter] = useState("all");
  const [auditTargetFilter, setAuditTargetFilter] = useState("all");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(50);
  const [auditJournalSubTab, setAuditJournalSubTab] = useState<"actions" | "tech">("actions");
  const [techDateFrom, setTechDateFrom] = useState("");
  const [techDateTo, setTechDateTo] = useState("");
  const [techFamilyFilter, setTechFamilyFilter] = useState("all");
  const [techStatusFilter, setTechStatusFilter] = useState("all");
  const [techPage, setTechPage] = useState(1);
  const [techPageSize, setTechPageSize] = useState(50);
  const workstationExports = useWorkstationExports();

  const filteredUsers = useMemo(() => {
    if (userFilter === "all") return props.users;
    if (userFilter === "inactive") return props.users.filter((u) => !u.isActive);
    return props.users.filter((u) => u.isActive);
  }, [props.users, userFilter]);

  const filteredAuditLogs = useMemo(() => {
    return props.auditLogs.filter((log) => {
      const actorOk = auditActorFilter === "all" || log.actorUsername === auditActorFilter;
      const family = resolveAuditFamily(log.action, formatAuditActionLabel(log.action));
      const familyOk = auditFamilyFilter === "all" || family === auditFamilyFilter;
      const statusOk = auditStatusFilter === "all" || log.status === auditStatusFilter;
      const targetValue = log.targetUsername || "-";
      const targetOk = auditTargetFilter === "all" || targetValue === auditTargetFilter;
      return actorOk && familyOk && statusOk && targetOk && matchesJournalDateRange(log.occurredAt, auditDateFrom, auditDateTo);
    });
  }, [props.auditLogs, auditActorFilter, auditFamilyFilter, auditStatusFilter, auditTargetFilter, auditDateFrom, auditDateTo]);

  const auditActors = useMemo(
    () => Array.from(new Set(props.auditLogs.map((log) => log.actorUsername))).sort((a, b) => a.localeCompare(b)),
    [props.auditLogs]
  );
  const auditFamilies = useMemo(
    () =>
      Array.from(new Set(props.auditLogs.map((log) => resolveAuditFamily(log.action, formatAuditActionLabel(log.action))))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [props.auditLogs]
  );
  const auditStatuses = useMemo(
    () => Array.from(new Set(props.auditLogs.map((log) => log.status))).sort((a, b) => a.localeCompare(b)),
    [props.auditLogs]
  );
  const auditTargets = useMemo(
    () => Array.from(new Set(props.auditLogs.map((log) => log.targetUsername || "-"))).sort((a, b) => a.localeCompare(b)),
    [props.auditLogs]
  );

  const filteredTechLogs = useMemo(() => {
    return props.techErrorLogs.filter((log) => {
      const family = resolveTechFamily(log.code, log.source);
      const status = getTechStatusTone(log.code);
      const familyOk = techFamilyFilter === "all" || family === techFamilyFilter;
      const statusOk = techStatusFilter === "all" || status === techStatusFilter;
      return familyOk && statusOk && matchesJournalDateRange(log.occurredAt, techDateFrom, techDateTo);
    });
  }, [props.techErrorLogs, techFamilyFilter, techStatusFilter, techDateFrom, techDateTo]);

  const techFamilies = useMemo(
    () =>
      Array.from(new Set(props.techErrorLogs.map((log) => resolveTechFamily(log.code, log.source)))).sort((a, b) => a.localeCompare(b)),
    [props.techErrorLogs]
  );
  const techStatuses = useMemo(
    () =>
      Array.from(new Set(props.techErrorLogs.map((log) => getTechStatusTone(log.code)))).sort((a, b) =>
        formatTechStatusLabel(a).localeCompare(formatTechStatusLabel(b), "fr")
      ),
    [props.techErrorLogs]
  );

  const activeTab = (() => {
    const t = props.activeTab;
    if (props.canManageUsers) return t;
    if (props.canAccessOperatorsTab && t === "operators") return "operators";
    if (props.canManageData && (t === "data" || t === "templates")) return t;
    return "data";
  })();
  const auditTotalPages = auditPageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const auditPageSafe = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = useMemo(() => {
    if (auditPageSize === 0) return filteredAuditLogs;
    const start = (auditPageSafe - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, auditPageSafe, auditPageSize]);

  const techTotalPages = techPageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredTechLogs.length / techPageSize));
  const techPageSafe = Math.min(techPage, techTotalPages);
  const pagedTechLogs = useMemo(() => {
    if (techPageSize === 0) return filteredTechLogs;
    const start = (techPageSafe - 1) * techPageSize;
    return filteredTechLogs.slice(start, start + techPageSize);
  }, [filteredTechLogs, techPageSafe, techPageSize]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditActorFilter, auditFamilyFilter, auditStatusFilter, auditTargetFilter, auditDateFrom, auditDateTo, auditPageSize]);

  useEffect(() => {
    if (auditPage > auditTotalPages) {
      setAuditPage(auditTotalPages);
    }
  }, [auditPage, auditTotalPages]);

  useEffect(() => {
    setTechPage(1);
  }, [techFamilyFilter, techStatusFilter, techDateFrom, techDateTo, techPageSize]);

  useEffect(() => {
    if (techPage > techTotalPages) {
      setTechPage(techTotalPages);
    }
  }, [techPage, techTotalPages]);

  return (
    <>
      <div className="tabs">
        {props.canAccessOperatorsTab && (
          <button className={activeTab === "operators" ? "tab active" : "tab"} onClick={() => props.onTabChange("operators")}>
            Gestion opérateur
          </button>
        )}
        {props.canManageData && (
          <button className={activeTab === "data" ? "tab active" : "tab"} onClick={() => props.onTabChange("data")}>
            Gestion des données
            {(props.pendingSites.length + props.pendingIntervenants.length) > 0 ? (
              <span className="tab-badge">
                {props.pendingSites.length + props.pendingIntervenants.length}
              </span>
            ) : null}
          </button>
        )}
        {props.canManageData && (
          <button className={activeTab === "templates" ? "tab active" : "tab"} onClick={() => props.onTabChange("templates")}>
            Modèles et variables
          </button>
        )}
        {props.canManageUsers && (
          <button className={activeTab === "database" ? "tab active" : "tab"} onClick={() => props.onTabChange("database")}>
            Gestion Base de données
          </button>
        )}
        {props.canManageUsers && (
          <button className={activeTab === "audit" ? "tab active" : "tab"} onClick={() => props.onTabChange("audit")}>
            Journal des actions
          </button>
        )}
      </div>

      {activeTab === "operators" && props.canAccessOperatorsTab && (
        <section className="panel">
          <div className="row settings-tab-toolbar">
            <div className="user-filter-bar" role="tablist" aria-label="Filtre utilisateurs">
              <button
                className={userFilter === "active" ? "tab active" : "tab"}
                type="button"
                role="tab"
                aria-selected={userFilter === "active"}
                onClick={() => setUserFilter("active")}
              >
                Actifs
              </button>
              <button
                className={userFilter === "inactive" ? "tab active" : "tab"}
                type="button"
                role="tab"
                aria-selected={userFilter === "inactive"}
                onClick={() => setUserFilter("inactive")}
              >
                Désactivés
              </button>
              <button
                className={userFilter === "all" ? "tab active" : "tab"}
                type="button"
                role="tab"
                aria-selected={userFilter === "all"}
                onClick={() => setUserFilter("all")}
              >
                Tous
              </button>
            </div>
            {props.canManageUsers ? (
              <div className="row-actions">
                <button type="button" className="mc-btn-primary" onClick={props.onOpenCreate}>
                  <Plus size={16} aria-hidden />
                  Nouvel utilisateur
                </button>
              </div>
            ) : null}
          </div>
          <UsersTable
            session={props.session}
            users={filteredUsers}
            directoryUsers={props.users}
            activeUsernames={props.activeUsernames}
            onDeactivateUser={props.onDeactivateUser}
            onReactivateUser={props.onReactivateUser}
            onEditUser={props.onOpenEditUser}
            onUnlockUser={props.onUnlockUser}
            onRequestPasswordReset={props.onRequestPasswordReset}
          />
        </section>
      )}

      {activeTab === "audit" && props.canManageUsers && (
        <section className="panel">
          <div className="row settings-tab-toolbar">
            <div className="user-filter-bar" role="tablist" aria-label="Type de journal">
              <button
                type="button"
                className={auditJournalSubTab === "actions" ? "tab active" : "tab"}
                role="tab"
                aria-selected={auditJournalSubTab === "actions"}
                onClick={() => setAuditJournalSubTab("actions")}
              >
                Logs applicatifs
              </button>
              <button
                type="button"
                className={auditJournalSubTab === "tech" ? "tab active" : "tab"}
                role="tab"
                aria-selected={auditJournalSubTab === "tech"}
                onClick={() => setAuditJournalSubTab("tech")}
              >
                Logs techniques
              </button>
            </div>
          </div>

          {auditJournalSubTab === "actions" ? (
            <>
          <p className="muted">
              Historique visibilité des actions jusqu&apos;à{" "}
              <strong>{props.auditMetadata.firstOccurredAt ? new Date(props.auditMetadata.firstOccurredAt).toLocaleString("fr-FR") : "Aucune donnée"}</strong>
          </p>
          <JournalFiltersBar
            dateFrom={auditDateFrom}
            dateTo={auditDateTo}
            onDateFromChange={setAuditDateFrom}
            onDateToChange={setAuditDateTo}
            actorFilter={auditActorFilter}
            actors={auditActors}
            onActorChange={setAuditActorFilter}
            familyFilter={auditFamilyFilter}
            families={auditFamilies}
            onFamilyChange={setAuditFamilyFilter}
            targetFilter={auditTargetFilter}
            targets={auditTargets}
            onTargetChange={setAuditTargetFilter}
            statusFilter={auditStatusFilter}
            statuses={auditStatuses}
            onStatusChange={setAuditStatusFilter}
            formatStatus={formatAuditStatus}
            onReset={() => {
              setAuditActorFilter("all");
              setAuditFamilyFilter("all");
              setAuditStatusFilter("all");
              setAuditTargetFilter("all");
              setAuditDateFrom("");
              setAuditDateTo("");
              setAuditPage(1);
            }}
            actions={
              <ListExportButtons
                exportDisabled={filteredAuditLogs.length === 0}
                canOpenLast={workstationExports.canOpenExcelTemporarily(WORKSTATION_EXPORT_KEYS.excelAudit)}
                lastFilePath={workstationExports.getLastPath(WORKSTATION_EXPORT_KEYS.excelAudit)}
                exportTitle="Exporter le journal en Excel"
                exportAriaLabel="Exporter le journal en Excel"
                onExport={() => {
                  void workstationExports.saveAndRemember(
                    WORKSTATION_EXPORT_KEYS.excelAudit,
                    () => props.onExportAuditLogs(filteredAuditLogs),
                    props.onNotify,
                    "Journal Excel enregistré."
                  ).catch((error: unknown) => {
                    props.onNotify(
                      error instanceof Error ? error.message : "Export Excel impossible.",
                      "error"
                    );
                  });
                }}
                onOpenLast={() => void workstationExports.openLastExport(WORKSTATION_EXPORT_KEYS.excelAudit, props.onNotify)}
              />
            }
          />
          <AuditTable logs={pagedAuditLogs} />
          <TablePaginationBar
            currentPage={auditPageSafe}
            totalPages={auditTotalPages}
            totalItems={filteredAuditLogs.length}
            pageSize={auditPageSize}
            onPageChange={setAuditPage}
            onPageSizeChange={setAuditPageSize}
            showCount={false}
          />
            </>
          ) : (
            <>
              <p className="muted">
                Événements techniques (ex. perte / reconnexion PostgreSQL labo). Hors logs applicatifs.
              </p>
              <JournalFiltersBar
                dateFrom={techDateFrom}
                dateTo={techDateTo}
                onDateFromChange={setTechDateFrom}
                onDateToChange={setTechDateTo}
                familyFilter={techFamilyFilter}
                families={techFamilies}
                onFamilyChange={setTechFamilyFilter}
                statusFilter={techStatusFilter}
                statuses={techStatuses}
                onStatusChange={setTechStatusFilter}
                formatStatus={(status) =>
                  status === "ok" || status === "error" || status === "warn" ? formatTechStatusLabel(status) : status
                }
                onReset={() => {
                  setTechFamilyFilter("all");
                  setTechStatusFilter("all");
                  setTechDateFrom("");
                  setTechDateTo("");
                  setTechPage(1);
                }}
                actions={
                  <ListExportButtons
                    exportDisabled={filteredTechLogs.length === 0}
                    canOpenLast={workstationExports.canOpenExcelTemporarily(WORKSTATION_EXPORT_KEYS.excelTechLogs)}
                    lastFilePath={workstationExports.getLastPath(WORKSTATION_EXPORT_KEYS.excelTechLogs)}
                    exportTitle="Exporter les logs techniques en Excel"
                    exportAriaLabel="Exporter les logs techniques en Excel"
                    onExport={() => {
                      void workstationExports.saveAndRemember(
                        WORKSTATION_EXPORT_KEYS.excelTechLogs,
                        () => props.onExportTechErrorLogs(filteredTechLogs),
                        props.onNotify,
                        "Logs techniques Excel enregistrés."
                      ).catch((error: unknown) => {
                        props.onNotify(
                          error instanceof Error ? error.message : "Export Excel impossible.",
                          "error"
                        );
                      });
                    }}
                    onOpenLast={() => void workstationExports.openLastExport(WORKSTATION_EXPORT_KEYS.excelTechLogs, props.onNotify)}
                  />
                }
              />
              <TechErrorLogsTable logs={pagedTechLogs} />
              <TablePaginationBar
                currentPage={techPageSafe}
                totalPages={techTotalPages}
                totalItems={filteredTechLogs.length}
                pageSize={techPageSize}
                onPageChange={setTechPage}
                onPageSizeChange={setTechPageSize}
                showCount={false}
              />
            </>
          )}
        </section>
      )}

      {activeTab === "data" && props.canManageData && (
        <DataManagementPanel
          activeDataTab={props.activeDataTab}
          onDataTabChange={props.onDataTabChange}
          sites={props.sites}
          intervenants={props.intervenants}
          anomalyTypes={props.anomalyTypes}
          holidays={props.holidays}
          rondeMotifTypes={props.rondeMotifTypes}
          fransorResponsables={props.fransorResponsables}
          pendingSites={props.pendingSites}
          pendingIntervenants={props.pendingIntervenants}
          onCreateSite={props.onCreateSite}
          onUpdateSite={props.onUpdateSite}
          onDeleteSite={props.onDeleteSite}
          canDeleteData={props.canDeleteData}
          onCreateIntervenant={props.onCreateIntervenant}
          onUpdateIntervenant={props.onUpdateIntervenant}
          onDeleteIntervenant={props.onDeleteIntervenant}
          onCreateType={props.onCreateType}
          onUpdateType={props.onUpdateType}
          onDeleteType={props.onDeleteType}
          onCreateHoliday={props.onCreateHoliday}
          onUpdateHoliday={props.onUpdateHoliday}
          onDeleteHoliday={props.onDeleteHoliday}
          onCreateRondeMotifType={(label, colorHex) => void props.onCreateRondeMotifType(label, colorHex)}
          onUpdateRondeMotifType={(id, label, colorHex) => void props.onUpdateRondeMotifType(id, label, colorHex)}
          onDeleteRondeMotifType={(id, reason) => void props.onDeleteRondeMotifType(id, reason)}
          onCreateFransorResponsable={props.onCreateFransorResponsable}
          onUpdateFransorResponsable={props.onUpdateFransorResponsable}
          onDeleteFransorResponsable={props.onDeleteFransorResponsable}
          onImportSiteRow={props.onImportSiteRow}
          onImportIntervenantRow={props.onImportIntervenantRow}
          onImportTypeRow={props.onImportTypeRow}
          onLogImportSummary={props.onLogImportSummary}
          onRefreshImportedData={props.onRefreshImportedData}
          onResolvePendingSite={props.onResolvePendingSite}
          onResolvePendingIntervenant={props.onResolvePendingIntervenant}
          onDeletePendingSiteSubmission={props.onDeletePendingSiteSubmission}
          onDeletePendingIntervenantSubmission={props.onDeletePendingIntervenantSubmission}
          onNotify={props.onNotify}
        />
      )}
      {activeTab === "templates" && props.canManageData && (
        <section className="panel">
          <div className="tabs">
            <button
              type="button"
              className={props.activeDocumentsTab === "templates" ? "tab active" : "tab"}
              onClick={() => props.onDocumentsTabChange("templates")}
            >
              Modèles Word
            </button>
            <button
              type="button"
              className={props.activeDocumentsTab === "variables" ? "tab active" : "tab"}
              onClick={() => props.onDocumentsTabChange("variables")}
            >
              Variables
            </button>
          </div>
          {props.activeDocumentsTab === "templates" ? (
            <TemplatesManagementPanel
              requesterRole={props.requesterRole}
              requesterUsername={props.currentUsername}
              sites={props.sites}
              onNotify={props.onNotify}
            />
          ) : (
            <VariablesManagementPanel
              requesterRole={props.requesterRole}
              requesterUsername={props.currentUsername}
              sites={props.sites}
              rondePlannedProfiles={props.rondePlannedProfiles}
              onNotify={props.onNotify}
            />
          )}
        </section>
      )}

      {activeTab === "database" && props.canManageUsers && (
        <section className="panel">
          <PostgresBackupPanel
            variant="admin"
            requesterRole={props.requesterRole}
            requesterUsername={props.currentUsername}
            onNotify={props.onNotify}
          />
        </section>
      )}

      <CreateUserModal
        isOpen={props.canAccessOperatorsTab && props.showCreateModal}
        form={props.createForm}
        mode={props.userModalMode}
        editingTechnicalUsername={props.editingTechnicalUsername}
        session={props.session}
        onClose={props.onCloseCreateModal}
        onChange={props.onCreateFormChange}
        onSubmit={props.onSubmitCreate}
      />
    </>
  );
}
