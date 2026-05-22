/**
 * Page Paramètres : onglets opérateurs, données, modèles, variables, BDD, journal d’actions.
 *
 * Filtres audit paginés, droits station (directeur / superviseur). Pas d’affichage d’identifiants techniques en liste.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { CircleHelp, Download, FolderOpen, RotateCcw } from "lucide-react";
import { AuditTable } from "../components/AuditTable";
import { CreateUserModal } from "../components/CreateUserModal";
import { DataManagementPanel } from "../components/DataManagementPanel";
import { TemplatesManagementPanel } from "../components/TemplatesManagementPanel";
import { VariablesManagementPanel } from "../components/VariablesManagementPanel";
import { WriterConfigGeneratorPanel, type WriterConfigDraft } from "../components/WriterConfigGeneratorPanel";
import type { HelpTopicId } from "../../help/model/helpTopics";
import { UsersTable } from "../components/UsersTable";
import type { Role } from "../../../types";
import type { DataTab, SettingsTab } from "../model/settings.types";
import type { ArchiveStatus, DatabaseItem } from "../../../infrastructure/api/gtsApiClient";
import type {
  AnomalyTypeRef,
  AuditLog,
  FransorResponsableRef,
  HolidayRef,
  IntervenantRef,
  ManagerProfile,
  PageAccess,
  SiteRef,
  User
} from "../../../types";
import type { PendingInterventionSite } from "../../intervention/model/intervention.types";
import type { PendingInterventionIntervenant } from "../../intervention/model/intervention.types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import type { RondePlannedProfileRef } from "../../rondes/model/rondePlanned.types";
import { formatAuditActionLabel } from "../model/auditActionLabels";

const AUDIT_PAGE_SIZE = 100;

function resolveAuditFamily(action: string, label: string) {
  const bracketMatch = label.match(/^\[([^\]]+)\]\s*/);
  if (bracketMatch) return bracketMatch[1];
  if (action.startsWith("MAIN_COURANTE_")) return "Main courante";
  if (action.startsWith("INTERVENTION_")) return "Intervention";
  if (action.startsWith("RONDE_")) return "Rondes";
  if (action.startsWith("FRANSOR_")) return "Fransor";
  if (action.startsWith("DATA_")) return "Référentiels";
  if (action.startsWith("USER_") || action.startsWith("USERS_") || action.startsWith("AUTH_")) return "Utilisateurs";
  return "Système";
}

function formatAuditStatus(status: string) {
  const labels: Record<string, string> = {
    SUCCESS: "Succès",
    ERROR: "Erreur"
  };
  return labels[status] || status;
}

type SettingsPageProps = {
  session: Session | null;
  canManageUsers: boolean;
  /** Inclut le superviseur (réinit. MDP uniquement). */
  canAccessOperatorsTab: boolean;
  canEditPageAccess: boolean;
  canManageData: boolean;
  canDeleteData: boolean;
  requesterRole: Role;
  activeTab: SettingsTab;
  users: User[];
  activeUsernames: string[];
  auditLogs: AuditLog[];
  auditMetadata: { firstOccurredAt: string | null; lastOccurredAt: string | null; total: number };
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  anomalyTypes: AnomalyTypeRef[];
  holidays: HolidayRef[];
  rondeMotifTypes: RondeMotifTypeRef[];
  rondePlannedProfiles: RondePlannedProfileRef[];
  fransorResponsables: FransorResponsableRef[];
  interventionPendingSites: PendingInterventionSite[];
  interventionPendingIntervenants: PendingInterventionIntervenant[];
  databaseItems: DatabaseItem[];
  archiveStatus: ArchiveStatus | null;
  dbPath: string;
  currentUsername: string;
  hasArchiveSourceActive: boolean;
  archiveOpenedBy: string | null;
  writerConfigDraft: WriterConfigDraft;
  onTabChange: (next: SettingsTab) => void;
  activeDataTab: DataTab;
  onDataTabChange: (next: DataTab) => void;
  onOpenCreate: () => void;
  onChooseDbPath: () => void;
  onOpenWriterLogFolder: () => void;
  onExportAuditLogs: (logs?: AuditLog[]) => void;
  onDeleteUser: (username: string) => void;
  onUnlockUser: (username: string) => void;
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
  onRefreshImportedData: (target: DataTab) => Promise<void>;
  onResolvePendingSite: (payload: { pendingId: string; parc: string; famille: string }) => void | Promise<void>;
  onResolvePendingIntervenant: (payload: { pendingId: string; name: string }) => void | Promise<void>;
  onDeletePendingSiteSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onDeletePendingIntervenantSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onNotify: (message: string) => void;
  onRefreshDatabases: () => void;
  onSwitchDatabase: (dbPath: string) => void;
  onRefreshArchiveStatus: () => void;
  onRunArchiveNow: () => void;
  onRestoreLocalActiveDb: () => void;
  onWriterConfigDraftChange: (next: WriterConfigDraft) => void;
  onPrefillWriterNode: (target: "master" | "backup") => void;
  onGenerateWriterConfig: () => void;
  onOpenHelpTopic: (topicId: HelpTopicId) => void;
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onCreateFormChange: (next: {
    username: string;
    role: "RESPONSABLE" | "OPERATEUR";
    managerProfile: ManagerProfile;
    mustResetPassword: boolean;
    pageAccess: PageAccess;
  }) => void;
  createForm: {
    username: string;
    role: "RESPONSABLE" | "OPERATEUR";
    managerProfile: ManagerProfile;
    mustResetPassword: boolean;
    pageAccess: PageAccess;
  };
  onSubmitCreate: (e: FormEvent) => void;
  userModalMode: "create" | "edit";
  editingTechnicalUsername?: string;
};

export function SettingsPage(props: SettingsPageProps) {
  const [userFilter, setUserFilter] = useState<"active" | "inactive" | "all">("active");
  const [showUserHelpModal, setShowUserHelpModal] = useState(false);
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditFamilyFilter, setAuditFamilyFilter] = useState("all");
  const [auditStatusFilter, setAuditStatusFilter] = useState("all");
  const [auditTargetFilter, setAuditTargetFilter] = useState("all");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);

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
  const auditTotalPages = Math.max(1, Math.ceil(filteredAuditLogs.length / AUDIT_PAGE_SIZE));
  const auditPageSafe = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = useMemo(() => {
    const start = (auditPageSafe - 1) * AUDIT_PAGE_SIZE;
    return filteredAuditLogs.slice(start, start + AUDIT_PAGE_SIZE);
  }, [filteredAuditLogs, auditPageSafe]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditActorFilter, auditFamilyFilter, auditStatusFilter, auditTargetFilter, auditDateFrom, auditDateTo]);

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
          </button>
        )}
        {props.canManageData && (
          <button className={activeTab === "templates" ? "tab active" : "tab"} onClick={() => props.onTabChange("templates")}>
            Gestion modèles
          </button>
        )}
        {props.canManageData && (
          <button className={activeTab === "variables" ? "tab active" : "tab"} onClick={() => props.onTabChange("variables")}>
            Gestion variables
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

      {activeTab === "operators" && props.canAccessOperatorsTab && props.canManageUsers && (
        <>
          <section className="panel">
            <div className="row">
              <h3>Liste des utilisateurs</h3>
              <div className="row-actions users-header-actions">
                <button
                  type="button"
                  className="btn-light action-icon-btn"
                  title="Comment ça marche"
                  aria-label="Comment ça marche"
                  onClick={() => setShowUserHelpModal(true)}
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
                <button onClick={props.onOpenCreate}>Créer</button>
              </div>
            </div>
            <UsersTable
              variant="full"
              session={props.session}
              users={filteredUsers}
              activeUsernames={props.activeUsernames}
              onDeleteUser={props.onDeleteUser}
              onEditUser={props.onOpenEditUser}
              onUnlockUser={props.onUnlockUser}
              onRequestPasswordReset={props.onRequestPasswordReset}
            />
            {showUserHelpModal && (
              <div className="modal-overlay" onClick={() => setShowUserHelpModal(false)}>
                <section className="modal fransor-help-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="row">
                    <h3>Comment créer un utilisateur</h3>
                  </div>
                  <p className="muted">
                    Cette modale explique le flux complet pour créer un utilisateur et lui attribuer le bon profil métier.
                  </p>
                  <h4>Étapes de création (A à Z)</h4>
                  <ol className="muted">
                    <li>Clique sur le bouton <strong>Créer</strong> dans la section « Liste des utilisateurs ».</li>
                    <li>Renseigne le <strong>Nom affiché</strong> (nom visible dans l’application).</li>
                    <li>
                      Choisis le <strong>Rôle technique</strong> :
                      <br />- <strong>Opérateur</strong> : saisie/consultation selon droits.
                      <br />- <strong>Responsable</strong> : fonctions de pilotage selon profil.
                    </li>
                    <li>
                      Si le rôle est <strong>Responsable</strong>, sélectionne le <strong>Profil métier</strong> :
                      <br />- <strong>Superviseur</strong>
                      <br />- <strong>Responsable de station</strong>
                      <br />- <strong>Directeur de station</strong>
                    </li>
                    <li>
                      Configure les <strong>vues autorisées</strong> (si ton propre profil te donne ce droit), puis valide avec
                      <strong> Créer l&apos;utilisateur</strong>.
                    </li>
                    <li>
                      Le système génère un <strong>mot de passe temporaire</strong> : communique-le à l’utilisateur pour sa première connexion.
                    </li>
                    <li>
                      À la première connexion, l’utilisateur doit définir son mot de passe personnel.
                    </li>
                  </ol>
                  <h4>Modification d’un utilisateur existant</h4>
                  <ul className="muted">
                    <li>Utilise le bouton <strong>Modifier</strong> sur la ligne concernée.</li>
                    <li>Tu peux changer le nom, le rôle, le profil métier et les accès pages (selon droits).</li>
                    <li>Tu peux aussi cocher la demande de réinitialisation de mot de passe.</li>
                  </ul>
                  <div className="row-actions modal-actions">
                    <button type="button" className="btn-light" onClick={() => setShowUserHelpModal(false)}>
                      Fermer
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "operators" && props.canAccessOperatorsTab && !props.canManageUsers && (
        <section className="panel">
          <div className="row">
            <h3>Réinitialisation des mots de passe</h3>
          </div>
          <p className="muted">
            En tant que superviseur, vous pouvez demander une réinitialisation du mot de passe ou déverrouiller un compte lorsque la hiérarchie métier le permet (profils
            strictement inférieurs au vôtre). La création de comptes, la désactivation et la modification des accès aux pages restent réservées au directeur de station, au
            responsable de station ou au profil développement.
          </p>
          <div className="row-actions users-header-actions user-filter-bar">
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
            <button className={userFilter === "all" ? "tab active" : "tab"} type="button" onClick={() => setUserFilter("all")}>
              Tous
            </button>
          </div>
          <UsersTable
            variant="passwordDesk"
            session={props.session}
            users={filteredUsers}
            activeUsernames={props.activeUsernames}
            onDeleteUser={props.onDeleteUser}
            onEditUser={props.onOpenEditUser}
            onUnlockUser={props.onUnlockUser}
            onRequestPasswordReset={props.onRequestPasswordReset}
          />
        </section>
      )}

      {activeTab === "audit" && props.canManageUsers && (
        <section className="panel">
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
                title="Ouvrir le dossier des logs writer"
                aria-label="Ouvrir le dossier des logs writer"
                onClick={props.onOpenWriterLogFolder}
              >
                <FolderOpen size={14} />
              </button>
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
          <div className="pagination-row">
            <span className="muted">
              {filteredAuditLogs.length} résultat(s) - page {auditPageSafe}/{auditTotalPages} (100 max/page)
            </span>
            <div className="row-actions">
              <button
                className="btn-light"
                onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}
                disabled={auditPageSafe <= 1}
                title="Page précédente"
              >
                Précédent
              </button>
              <button
                className="btn-light"
                onClick={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
                disabled={auditPageSafe >= auditTotalPages}
                title="Page suivante"
              >
                Suivant
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "data" && props.canManageData && (
        <DataManagementPanel
          requesterRole={props.requesterRole}
          activeDataTab={props.activeDataTab}
          onDataTabChange={props.onDataTabChange}
          sites={props.sites}
          intervenants={props.intervenants}
          anomalyTypes={props.anomalyTypes}
          holidays={props.holidays}
          rondeMotifTypes={props.rondeMotifTypes}
          fransorResponsables={props.fransorResponsables}
          interventionPendingSites={props.interventionPendingSites}
          interventionPendingIntervenants={props.interventionPendingIntervenants}
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
        <TemplatesManagementPanel
          requesterRole={props.requesterRole}
          requesterUsername={props.currentUsername}
          sites={props.sites}
          onNotify={props.onNotify}
        />
      )}
      {activeTab === "variables" && props.canManageData && (
        <VariablesManagementPanel
          requesterRole={props.requesterRole}
          requesterUsername={props.currentUsername}
          sites={props.sites}
          rondePlannedProfiles={props.rondePlannedProfiles}
          onNotify={props.onNotify}
        />
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
              <button className="btn-light" onClick={props.onRefreshDatabases}>
                Rafraîchir les bases
              </button>
              <button className="btn-light" onClick={props.onRefreshArchiveStatus}>
                Rafraîchir l&apos;archivage
              </button>
              <button onClick={props.onRunArchiveNow}>Lancer archivage maintenant</button>
            </div>
          </div>
          <div className="db-box">
            <span className="muted">DB active: {props.dbPath || "Non configurée"}</span>
            {props.hasArchiveSourceActive && props.archiveOpenedBy ? (
              <span className="muted">Base de données ouverte sur : {props.archiveOpenedBy}</span>
            ) : null}
            <button className="btn-light" onClick={props.onChooseDbPath}>
              Changer emplacement DB
            </button>
          </div>
          <div className="db-box">
            <span className="muted">
              Dernier archivage:{" "}
              {props.archiveStatus?.lastLogicalRunAt ? new Date(props.archiveStatus.lastLogicalRunAt).toLocaleString("fr-FR") : "Jamais"}
            </span>
            <span className="muted">Jobs en file d&apos;attente: {props.archiveStatus?.pendingJobs ?? 0}</span>
            <span className="muted">Dernière erreur: {props.archiveStatus?.lastError || "-"}</span>
          </div>
          <div className="table-scroll-x">
            <table className="data-table-fixed data-table-sites">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Chemin</th>
                  <th>Dernière modification</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.databaseItems.map((item) => (
                  <tr key={item.path}>
                    <td>{item.name}</td>
                    <td>{item.path}</td>
                    <td>{new Date(item.lastModifiedAt).toLocaleString("fr-FR")}</td>
                    <td>{item.isActive ? "Active" : item.isSourceActive ? "Archive source active" : "Archive consultable"}</td>
                    <td>
                      {item.isSourceActive && props.hasArchiveSourceActive && props.archiveOpenedBy === props.currentUsername ? (
                        <button className="btn-light" onClick={props.onRestoreLocalActiveDb}>
                          Revenir à la base active locale
                        </button>
                      ) : item.isActive || item.isSourceActive ? (
                        <span className="muted">Utilisée</span>
                      ) : props.hasArchiveSourceActive && props.archiveOpenedBy !== props.currentUsername ? (
                        <span className="muted">Lecture seule</span>
                      ) : (
                        <button className="btn-light" onClick={() => props.onSwitchDatabase(item.path)}>
                          Basculer sur cette base
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!props.databaseItems.length && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Aucune base détectée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <WriterConfigGeneratorPanel
            draft={props.writerConfigDraft}
            onChange={props.onWriterConfigDraftChange}
            onPrefillNode={props.onPrefillWriterNode}
            onGenerate={props.onGenerateWriterConfig}
          />
        </section>
      )}

      <CreateUserModal
        isOpen={props.canManageUsers && props.showCreateModal}
        form={props.createForm}
        mode={props.userModalMode}
        editingTechnicalUsername={props.editingTechnicalUsername}
        canEditPageAccess={props.canEditPageAccess}
        onClose={props.onCloseCreateModal}
        onChange={props.onCreateFormChange}
        onSubmit={props.onSubmitCreate}
      />
    </>
  );
}
