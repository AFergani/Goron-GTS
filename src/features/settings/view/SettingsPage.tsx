/**
 * Page Paramètres : onglets opérateurs, données, modèles et variables, BDD, journal
 * (actions métier + logs techniques).
 *
 * Filtres audit paginés, droits station (directeur / responsable de station / Admin).
 * Pas d’affichage d’identifiants techniques en liste.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { CircleHelp, Download, RotateCcw } from "lucide-react";
import { AuditTable } from "../components/AuditTable";
import { TechErrorLogsTable } from "../components/TechErrorLogsTable";
import { CreateUserModal } from "../components/CreateUserModal";
import { DataManagementPanel } from "../components/DataManagementPanel";
import { TemplatesManagementPanel } from "../components/TemplatesManagementPanel";
import { VariablesManagementPanel } from "../components/VariablesManagementPanel";
import { PostgresConnectionPanel, type PostgresBusyPhase, type PostgresConfigDraft } from "../components/PostgresConnectionPanel";
import type { HelpTopicId } from "../../help/model/helpTopics";
import { UsersTable } from "../components/UsersTable";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { Role } from "../../../types";
import type { CreateUserFormState, DataRefreshTarget, DataTab, DocumentsTab, SettingsTab } from "../model/settings.types";
import type { NotifyToast } from "../../common/model/toast.types";
import type { PublicPostgresConfig, PostgresTestResult, TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
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

type SettingsPageProps = {
  session: Session | null;
  canManageUsers: boolean;
  /** Inclut le superviseur, dont la portée est bornée par la hiérarchie. */
  canAccessOperatorsTab: boolean;
  canEditPageAccess: boolean;
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
  postgresConfig: PublicPostgresConfig | null;
  postgresDraft: PostgresConfigDraft;
  postgresTestResult: PostgresTestResult | null;
  postgresBusyPhase: PostgresBusyPhase;
  onTabChange: (next: SettingsTab) => void;
  activeDataTab: DataTab;
  onDataTabChange: (next: DataTab) => void;
  activeDocumentsTab: DocumentsTab;
  onDocumentsTabChange: (next: DocumentsTab) => void;
  onOpenCreate: () => void;
  onExportAuditLogs: (logs?: AuditLog[]) => void;
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
  onResolvePendingSite: (payload: { pendingId: string; parc: string; famille: string }) => void | Promise<void>;
  onResolvePendingIntervenant: (payload: { pendingId: string; name: string }) => void | Promise<void>;
  onDeletePendingSiteSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onDeletePendingIntervenantSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onNotify: NotifyToast;
  onPostgresDraftChange: (next: PostgresConfigDraft) => void;
  onSavePostgresConfig: () => void;
  onTestPostgresConfig: () => void;
  onReconnectPostgres: () => void;
  onOpenHelpTopic: (topicId: HelpTopicId) => void;
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onCreateFormChange: (next: CreateUserFormState) => void;
  createForm: CreateUserFormState;
  onSubmitCreate: (e: FormEvent) => void;
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
      const logDate = new Date(log.occurredAt);
      const fromOk = !auditDateFrom || logDate >= new Date(`${auditDateFrom}T00:00:00`);
      const toOk = !auditDateTo || logDate <= new Date(`${auditDateTo}T23:59:59`);
      return actorOk && familyOk && statusOk && targetOk && fromOk && toOk;
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

  const activeTab = (() => {
    const t = props.activeTab;
    if (props.canManageUsers) return t;
    if (props.canAccessOperatorsTab && t === "operators") return "operators";
    if (t === "database" && props.canManageData) return "database";
    return "data";
  })();
  const auditTotalPages = auditPageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const auditPageSafe = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = useMemo(() => {
    if (auditPageSize === 0) return filteredAuditLogs;
    const start = (auditPageSafe - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, auditPageSafe, auditPageSize]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditActorFilter, auditFamilyFilter, auditStatusFilter, auditTargetFilter, auditDateFrom, auditDateTo, auditPageSize]);

  useEffect(() => {
    if (auditPage > auditTotalPages) {
      setAuditPage(auditTotalPages);
    }
  }, [auditPage, auditTotalPages]);

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
        {props.canManageData && (
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
        <>
          <section className="panel">
            <div className="row">
              <h3>Liste des utilisateurs</h3>
              <div className="row-actions users-header-actions">
                <button
                  type="button"
                  className="btn-light action-icon-btn"
                  title="Aide — gestion opérateur"
                  aria-label="Aide — gestion opérateur"
                  onClick={() => props.onOpenHelpTopic("settings-operators")}
                >
                  <CircleHelp size={14} />
                </button>
                <div className="user-filter-bar">
                  <button
                    className={userFilter === "active" ? "tab active" : "tab"}
                    type="button"
                    onClick={() => setUserFilter("active")}
                  >
                    Actifs
                  </button>
                  <button
                    className={userFilter === "inactive" ? "tab active" : "tab"}
                    type="button"
                    onClick={() => setUserFilter("inactive")}
                  >
                    Désactivés
                  </button>
                  <button
                    className={userFilter === "all" ? "tab active" : "tab"}
                    type="button"
                    onClick={() => setUserFilter("all")}
                  >
                    Tous
                  </button>
                </div>
                {props.canManageUsers && <button onClick={props.onOpenCreate}>Créer</button>}
              </div>
            </div>
            <p className="muted">
              Vous pouvez gérer les comptes de niveau hiérarchique inférieur ou égal au vôtre. Chaque modification,
              réinitialisation, déverrouillage, désactivation ou réactivation exige un motif tracé dans le journal des
              actions.
            </p>
            <UsersTable
              session={props.session}
              users={filteredUsers}
              activeUsernames={props.activeUsernames}
              onDeactivateUser={props.onDeactivateUser}
              onReactivateUser={props.onReactivateUser}
              onEditUser={props.onOpenEditUser}
              onUnlockUser={props.onUnlockUser}
              onRequestPasswordReset={props.onRequestPasswordReset}
            />
          </section>
        </>
      )}

      {activeTab === "audit" && props.canManageUsers && (
        <section className="panel">
          <div className="row">
            <h3>Journal</h3>
            <div className="user-filter-bar" role="tablist" aria-label="Type de journal">
              <button
                type="button"
                className={auditJournalSubTab === "actions" ? "tab active" : "tab"}
                role="tab"
                aria-selected={auditJournalSubTab === "actions"}
                onClick={() => setAuditJournalSubTab("actions")}
              >
                Actions métier
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
          <div className="row">
            <h3>Journal des actions</h3>
            <span className="muted">
              Historique visibilité des actions jusqu&apos;à{" "}
              <strong>{props.auditMetadata.firstOccurredAt ? new Date(props.auditMetadata.firstOccurredAt).toLocaleString("fr-FR") : "Aucune donnée"}</strong>
              {" "}({props.auditMetadata.total} entrée(s))
            </span>
          </div>
          <div className="audit-filters">
            <div className="main-log-filters-date-range" role="group" aria-label="Période du journal">
              <label className="main-log-filter-field--date">
                Date du
                <input type="date" value={auditDateFrom} onChange={(e) => setAuditDateFrom(e.target.value)} />
              </label>
              <label className="main-log-filter-field--date">
                Date au
                <input type="date" value={auditDateTo} onChange={(e) => setAuditDateTo(e.target.value)} />
              </label>
            </div>
            <label>
              Acteur
              <select value={auditActorFilter} onChange={(e) => setAuditActorFilter(e.target.value)}>
                <option value="all">Tous</option>
                {auditActors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Famille
              <select value={auditFamilyFilter} onChange={(e) => setAuditFamilyFilter(e.target.value)}>
                <option value="all">Toutes</option>
                {auditFamilies.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cible
              <select value={auditTargetFilter} onChange={(e) => setAuditTargetFilter(e.target.value)}>
                <option value="all">Toutes</option>
                {auditTargets.map((target) => (
                  <option key={target} value={target}>
                    {target === "-" ? "Aucune cible" : target}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Statut
              <select value={auditStatusFilter} onChange={(e) => setAuditStatusFilter(e.target.value)}>
                <option value="all">Tous</option>
                {auditStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatAuditStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <div className="audit-filter-actions">
              <button
                type="button"
                className="btn-light action-icon-btn audit-reset-icon-btn"
                title="Exporter le journal en Excel"
                aria-label="Exporter le journal en Excel"
                onClick={() => props.onExportAuditLogs(filteredAuditLogs)}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                className="btn-light action-icon-btn audit-reset-icon-btn"
                title="Réinitialiser les filtres"
                aria-label="Réinitialiser les filtres"
                onClick={() => {
                  setAuditActorFilter("all");
                  setAuditFamilyFilter("all");
                  setAuditStatusFilter("all");
                  setAuditTargetFilter("all");
                  setAuditDateFrom("");
                  setAuditDateTo("");
                  setAuditPage(1);
                }}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          <AuditTable logs={pagedAuditLogs} />
          <TablePaginationBar
            currentPage={auditPageSafe}
            totalPages={auditTotalPages}
            totalItems={filteredAuditLogs.length}
            pageSize={auditPageSize}
            onPageChange={setAuditPage}
            onPageSizeChange={setAuditPageSize}
          />
            </>
          ) : (
            <>
              <p className="muted">
                Événements techniques (ex. perte / reconnexion PostgreSQL labo). Hors actions métier.
                {" "}
                ({props.techErrorLogs.length} entrée(s) chargée(s))
              </p>
              <TechErrorLogsTable logs={props.techErrorLogs} />
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

      {activeTab === "database" && props.canManageData && (
        <section className="panel">
          <div className="row">
            <h3>Base de données</h3>
            <div className="row-actions">
              <button
                type="button"
                className="btn-light action-icon-btn"
                title="Aide — gestion de la base de données"
                aria-label="Aide — gestion de la base de données"
                onClick={() => props.onOpenHelpTopic("settings-database")}
              >
                <CircleHelp size={14} />
              </button>
            </div>
          </div>

          {props.canManageUsers ? (
            <PostgresConnectionPanel
              config={props.postgresConfig}
              draft={props.postgresDraft}
              onDraftChange={props.onPostgresDraftChange}
              onSave={props.onSavePostgresConfig}
              onTest={props.onTestPostgresConfig}
              onReconnect={props.onReconnectPostgres}
              testResult={props.postgresTestResult}
              busyPhase={props.postgresBusyPhase}
            />
          ) : (
            <p className="muted">
              La configuration PostgreSQL est réservée au directeur de station, responsable de station ou profil Admin.
            </p>
          )}
        </section>
      )}

      <CreateUserModal
        isOpen={props.canAccessOperatorsTab && props.showCreateModal}
        form={props.createForm}
        mode={props.userModalMode}
        editingTechnicalUsername={props.editingTechnicalUsername}
        canEditPageAccess={props.canEditPageAccess}
        session={props.session}
        onClose={props.onCloseCreateModal}
        onChange={props.onCreateFormChange}
        onSubmit={props.onSubmitCreate}
      />
    </>
  );
}
