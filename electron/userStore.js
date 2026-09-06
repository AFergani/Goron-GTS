/**
 * Orchestrateur d'accès données pour Goron-GTS (PostgreSQL only).
 *
 * Persistance métier exclusive via le pool PostgreSQL
 * (`attachPostgresAuditLab` / `referentialsPersistence`).
 * Chaque méthode publique délègue vers `store/domains/*` ou `store/core/*` —
 * pas de règle métier volumineuse ici. Appelants principaux : IPC (`main.js`).
 *
 * @module electron/userStore
 */

const { resolveAdminAccess } = require("./store/core/adminAccess");
const { AppError, failWithLog } = require("./store/core/errors");
const {
  getEntityChangeHistory: getEntityChangeHistoryCore,
  recordEntityChange: recordEntityChangeCore
} = require("./store/core/entityHistory");
const {
  ensureDataManagerRole: ensureDataManagerRoleRbac,
  ensureDataDeleteRole: ensureDataDeleteRoleRbac,
  ensureDataReaderRole: ensureDataReaderRoleRbac
} = require("./store/core/rbac");
const {
  tryOpenPostgresLabPersistence,
  createAuditPersistenceRouter
} = require("./store/persistence");
const {
  resolvePostgresEventLogPath: resolvePostgresEventLogPathHelper
} = require("./store/persistence/postgresEventLog");
const {
  auditLogs: auditLogsDomain,
  techErrorLogs: techErrorLogsDomain
} = require("./store/domains/journals");
const authUsersDomain = require("./store/domains/users/authUsers");
const userPreferencesDomain = require("./store/domains/users/userPreferences");
const presenceDomain = require("./store/domains/users/presence");
const {
  referentials: referentialsDomain,
  holidays: holidaysDomain,
  rondeMotifTypes: rondeMotifTypesDomain,
  importAudit: importAuditDomain,
  formVariables: formVariablesDomain,
  templateAssignments: templateAssignmentsDomain,
  pendingSites: pendingSitesDomain,
  pendingIntervenants: pendingIntervenantsDomain
} = require("./store/domains/data");
const fransorDomain = require("./store/domains/fransor");
const mainCouranteDomain = require("./store/domains/mainCourante");
const dbHealthDomain = require("./store/domains/dbHealth");
const gardiennageDomain = require("./store/domains/gardiennage");
const interventionDomain = require("./store/domains/intervention");
const rondeDomain = require("./store/domains/ronde");
const rondePlannedProfilesDomain = require("./store/domains/ronde/plannedProfiles");

/** Rôles applicatifs transmis aux domaines et au RBAC (`store/core/rbac`). */
const ROLE = {
  RESPONSABLE: "RESPONSABLE",
  OPERATEUR: "OPERATEUR",
  DEV: "DEV"
};

/**
 * Façade données PostgreSQL : audit, caches et délégation vers les domaines métier.
 * Brancher PG via `attachPostgresAuditLab`.
 */
class UserStore {
  /**
   * @param {{ isPackaged?: boolean, userDataPath?: string }} [options]
   */
  constructor(options = {}) {
    const adminAccess = resolveAdminAccess(options);
    this.devMasterCode = adminAccess.devMasterCode;
    this.adminAccessEnabled = adminAccess.adminAccessEnabled;

    /** @type {string} Dossier userData Electron (journaux locaux, pas de fichier base). */
    this.userDataPath = String(options.userDataPath || "").trim();

    /** @type {import('./store/persistence/persistenceContract').PersistenceAdapter|null} */
    this.postgresPersistence = null;

    /** Routeur audit_logs (PostgreSQL only ; skip soft si PG down). */
    this.auditRouter = createAuditPersistenceRouter({
      postgresPersistence: null
    });

    /**
     * Persistance référentiels + jours fériés : PostgreSQL only (null tant que PG non attaché / injoignable).
     * @type {import('./store/persistence/persistenceContract').PersistenceAdapter|null}
     */
    this.referentialsPersistence = null;

    /**
     * Cache des dates fériées (ISO) pour planification sync (rondes / gardiennage).
     * @type {string[]|null}
     */
    this._holidayDateIsosCache = null;

    /**
     * Cache comptes utilisateurs (username → ligne) pour session / RBAC sync.
     * @type {Map<string, object>|null}
     */
    this._usersByUsernameCache = null;

    /** File sérialisée des écritures audit (callers sync sans await). */
    this._auditWriteChain = Promise.resolve();

    /** Promesse de branchement PG labo (démarrage / bascule). */
    this._pgAttachPromise = null;

    /** Chemin local du journal d'événements PG (perte / retour connexion). */
    this._postgresEventLogPath = resolvePostgresEventLogPathHelper(options.userDataPath);

    // Compte admin DEV : créé côté PostgreSQL dans `attachPostgresAuditLab`.
  }

  /**
   * Adaptateur actif pour `audit_logs` (PostgreSQL uniquement ; `null` si injoignable).
   *
   * @returns {import('./store/persistence/persistenceContract').PersistenceAdapter|null}
   */
  getAuditPersistence() {
    return this.auditRouter.getActive();
  }

  /**
   * Adaptateur pour sites / intervenants / types / jours fériés / motifs,
   * Fransor, main courante, interventions, gardiennage, rondes (profils inclus),
   * variables / modèles Word et comptes (PostgreSQL only ; `null` si injoignable).
   *
   * @returns {import('./store/persistence/persistenceContract').PersistenceAdapter|null}
   */
  getReferentialsPersistence() {
    return this.referentialsPersistence;
  }

  /**
   * Adaptateur PostgreSQL pour `users` (même pool labo que les référentiels).
   *
   * @returns {import('./store/persistence/persistenceContract').PersistenceAdapter|null}
   */
  getUsersPersistence() {
    return this.referentialsPersistence;
  }

  /**
   * Refuse l'accès Gestion des données (référentiels PG) si PostgreSQL n'est pas joignable.
   *
   * @returns {void}
   */
  assertPostgresAvailableForReferentials() {
    if (this.referentialsPersistence && this.referentialsPersistence.isOpen()) {
      return;
    }
    this.fail(
      "data:referentials",
      "Base PostgreSQL inaccessible. Les référentiels Paramètres et les domaines métier migrés (Fransor, main courante, interventions, gardiennage, rondes) ne peuvent pas être consultés ni modifiés tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }

  /**
   * Refuse auth / comptes / préférences si PostgreSQL n'est pas joignable.
   *
   * @returns {void}
   */
  assertPostgresAvailableForUsers() {
    if (this.referentialsPersistence && this.referentialsPersistence.isOpen()) {
      return;
    }
    this.fail(
      "users",
      "Base PostgreSQL inaccessible. La gestion des comptes et la connexion sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }

  /**
   * Branche le pool PostgreSQL labo : audit_logs + référentiels + jours fériés (PG only).
   * No-op si Docker/PG injoignable — référentiels / audit PG restent indisponibles.
   *
   * @param {{ forceReconnect?: boolean }} [options] - Si true, ferme l'ancien pool (panne Docker) avant de rouvrir.
   * @returns {Promise<{ attached: boolean, engine: "postgres"|"none" }>}
   */
  async attachPostgresAuditLab(options = {}) {
    const forceReconnect = Boolean(options.forceReconnect);
    if (forceReconnect && this.postgresPersistence) {
      try {
        await this.postgresPersistence.close();
      } catch {
        // Pool déjà mort après docker stop : ignorer.
      }
      this.postgresPersistence = null;
      this.referentialsPersistence = null;
    }

    const pg = await tryOpenPostgresLabPersistence({
      onIdleClientError: () => {
        // Panne idle (docker stop, etc.) : bascule badge / référentiels sans boîte Windows.
        this.setAuditPostgresReachable(false);
      }
    });
    if (!pg) {
      this.postgresPersistence = null;
      this.referentialsPersistence = null;
      this.auditRouter = createAuditPersistenceRouter({
        postgresPersistence: null
      });
      return { attached: false, engine: "none" };
    }
    this.postgresPersistence = pg;
    this.referentialsPersistence = pg;
    this.auditRouter = createAuditPersistenceRouter({
      postgresPersistence: pg
    });
    try {
      await holidaysDomain.refreshHolidayDateIsosCache(this);
      await referentialsDomain.ensureSystemAnomalyType(this);
      await rondeMotifTypesDomain.ensureSystemRondeMotifType(this);
      await authUsersDomain.ensureDevUser(this, { roles: ROLE });
      await authUsersDomain.refreshUsersCache(this);
    } catch (error) {
      void this.logError({
        source: "users:migrate",
        code: "USERS_PG_BOOTSTRAP_FAILED",
        messageFr: "Initialisation des comptes PostgreSQL impossible après branchement labo.",
        details: { reason: error instanceof Error ? error.message : String(error || "") }
      });
    }
    return { attached: true, engine: this.auditRouter.getEngine() };
  }

  /**
   * Met à jour la joignabilité PG pour audit + référentiels (badge / sonde labo).
   * À la reconnexion (false → true) : nouveau pool (l'ancien est souvent mort après `docker stop`).
   * La journalisation perte/reconnexion est faite par `postgresLabMonitor` uniquement.
   *
   * @param {boolean} reachable
   * @returns {void}
   */
  setAuditPostgresReachable(reachable) {
    const wasReachable =
      this.auditRouter && typeof this.auditRouter.getEngine === "function"
        ? this.auditRouter.getEngine() === "postgres"
        : false;

    if (!reachable) {
      if (this.auditRouter && typeof this.auditRouter.setPostgresReachable === "function") {
        this.auditRouter.setPostgresReachable(false);
      }
      this.referentialsPersistence = null;
      return;
    }

    if (wasReachable) {
      if (this.auditRouter && typeof this.auditRouter.setPostgresReachable === "function") {
        this.auditRouter.setPostgresReachable(true);
      }
      if (this.postgresPersistence && this.postgresPersistence.isOpen()) {
        this.referentialsPersistence = this.postgresPersistence;
      }
      return;
    }

    // Sortie de panne : reconnecter le pool puis resynchroniser le one-shot labo si besoin.
    void this.attachPostgresAuditLab({ forceReconnect: true }).catch((error) => {
      void this.logError({
        source: "audit:migrate",
        code: "AUDIT_PG_COPY_FAILED",
        messageFr: "Reconnecter PostgreSQL après panne impossible.",
        details: { reason: error instanceof Error ? error.message : String(error || "") }
      });
    });
  }

  /**
   * Ouverture async recommandée : instance PG-only (branchement via `attachPostgresAuditLab`).
   *
   * @param {{ isPackaged?: boolean, userDataPath?: string }} [options]
   * @returns {Promise<UserStore>}
   */
  static async open(options = {}) {
    return new UserStore(options);
  }

  /**
   * Ferme le pool PostgreSQL (arrêt propre / bascule).
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.postgresPersistence && typeof this.postgresPersistence.close === "function") {
      try {
        await this.postgresPersistence.close();
      } catch {
        // ignore
      }
      this.postgresPersistence = null;
    }
    this.referentialsPersistence = null;
  }

  /**
   * Chemin du journal local des événements PostgreSQL (`gts-pg-events.log`).
   *
   * @returns {string}
   */
  resolvePostgresEventLogPath() {
    return this._postgresEventLogPath;
  }

  /**
   * Garantit le compte technique Admin (DEV) côté PostgreSQL.
   *
   * @returns {Promise<void>}
   */
  async ensureDevUser() {
    return authUsersDomain.ensureDevUser(this, { roles: ROLE });
  }

  /**
   * Compte actif depuis le cache PG (sessions IPC / contrôles sync).
   *
   * @param {string} username
   * @returns {object|null}
   */
  getCachedUserRow(username) {
    return authUsersDomain.getCachedUserRow(this, username);
  }

  /**
   * Droit de gérer la connexion PostgreSQL du poste (DEV, directeur ou responsable de station).
   *
   * @param {string} username
   * @returns {boolean}
   */
  canManagePostgresConfig(username) {
    return authUsersDomain.isStationAdminRequester(this.getCachedUserRow(username), ROLE);
  }

  /**
   * Journal technique — no-op (les événements PG vont dans `gts-pg-events.log`).
   * Conservé pour que `failWithLog` / callers sync restent stables.
   *
   * @param {object} _entry
   * @returns {Promise<void>}
   */
  logError(_entry) {
    return Promise.resolve();
  }

  /** Lève une `AppError` après log (messages utilisateur en français). */
  fail(source, userMessage, code, details = {}) {
    failWithLog(this, source, userMessage, code, details);
  }

  /**
   * Écriture dans `audit_logs` (PostgreSQL only ; no-op soft si PG indisponible).
   * File sérialisée : safe depuis un domaine sync sans `await`.
   *
   * @param {object} entry
   * @returns {Promise<void>}
   */
  logAudit({ actorUsername, action, targetUsername = null, status = "SUCCESS", details = null }) {
    const payload = { actorUsername, action, targetUsername, status, details };
    const job = () =>
      this.auditRouter.write(payload).catch((error) => {
        void this.logError({
          source: "audit:write",
          code: "AUDIT_WRITE_FAILED",
          messageFr: "Échec d'écriture du journal d'actions.",
          details: {
            action: String(action || ""),
            reason: error instanceof Error ? error.message : String(error || "")
          }
        });
      });
    this._auditWriteChain = this._auditWriteChain.then(job, job);
    return this._auditWriteChain;
  }

  logBulkImportAudit({
    requesterRole,
    requesterUsername,
    target,
    fileName,
    total,
    success,
    failed,
    errorEntries = []
  }) {
    return importAuditDomain.logBulkImportAudit(this, {
      requesterRole,
      requesterUsername,
      target,
      fileName,
      total,
      success,
      failed,
      errorEntries
    });
  }

  /**
   * Enregistre un snapshot d'entité référentielle (historique pour audit UPDATE).
   *
   * @param {{ entityType: string, entityId: string, changedBy?: string, snapshot?: object }} payload
   * @returns {Promise<void>}
   */
  async recordEntityChange(payload) {
    await recordEntityChangeCore(this.getReferentialsPersistence(), payload);
  }

  /**
   * Retourne les derniers snapshots connus d'une entité référentielle.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @param {number} [limit=3]
   * @returns {Promise<Array<{ changedAt: string, changedBy: string, snapshot: object }>>}
   */
  async getEntityChangeHistory(entityType, entityId, limit = 3) {
    return getEntityChangeHistoryCore(this.getReferentialsPersistence(), entityType, entityId, limit);
  }

  /**
   * Attend la fin du branchement PostgreSQL labo (démarrage / bascule DB).
   *
   * @returns {Promise<{ attached?: boolean, engine?: string }|void>}
   */
  async whenPostgresReady() {
    if (this._pgAttachPromise) {
      return this._pgAttachPromise;
    }
    return undefined;
  }

  // --- Authentification et comptes (`authUsers`) ---

  async login({ username, password }) {
    await this.whenPostgresReady();
    return authUsersDomain.login(this, { username, password, role: ROLE });
  }

  async completeFirstLogin({ username, temporaryPassword, newPassword }) {
    await this.whenPostgresReady();
    return authUsersDomain.completeFirstLogin(this, { username, temporaryPassword, newPassword });
  }

  async resetPasswordWithPeerValidation({ fullName, validatorFullName, validatorPassword, reason }) {
    await this.whenPostgresReady();
    return authUsersDomain.resetPasswordWithPeerValidation(this, {
      fullName,
      validatorFullName,
      validatorPassword,
      reason,
      role: ROLE
    });
  }

  async listUsers({ requesterRole, requesterUsername }) {
    await this.whenPostgresReady();
    return authUsersDomain.listUsers(this, { requesterRole, requesterUsername, role: ROLE });
  }

  async createUser({ requesterRole, requesterUsername, username, fullName, role, managerProfile, pageAccess }) {
    await this.whenPostgresReady();
    return authUsersDomain.createUser(this, {
      requesterRole,
      requesterUsername,
      username,
      fullName,
      role,
      managerProfile,
      pageAccess,
      roles: ROLE
    });
  }

  async updateUserProfile({
    requesterRole,
    requesterUsername,
    username,
    fullName,
    newRole,
    managerProfile,
    pageAccess,
    mustResetPassword,
    reason,
    expectedUpdatedAt
  }) {
    await this.whenPostgresReady();
    return authUsersDomain.updateUserProfile(this, {
      requesterRole,
      requesterUsername,
      username,
      fullName,
      newRole,
      managerProfile,
      pageAccess,
      mustResetPassword,
      reason,
      expectedUpdatedAt,
      role: ROLE
    });
  }

  async deactivateUser({ requesterRole, requesterUsername, username, reason }) {
    await this.whenPostgresReady();
    return authUsersDomain.deactivateUser(this, { requesterRole, requesterUsername, username, reason, role: ROLE });
  }

  async reactivateUser({ requesterRole, requesterUsername, username, reason, fullName }) {
    await this.whenPostgresReady();
    return authUsersDomain.reactivateUser(this, {
      requesterRole,
      requesterUsername,
      username,
      reason,
      fullName,
      role: ROLE
    });
  }

  async unlockUser({ requesterRole, requesterUsername, username, reason }) {
    await this.whenPostgresReady();
    return authUsersDomain.unlockUser(this, { requesterRole, requesterUsername, username, reason, role: ROLE });
  }

  // --- Audit, santé base, préférences, modèles Word ---

  getDbHealth() {
    return dbHealthDomain.getDbHealth(this);
  }

  async listAuditLogs({ requesterRole, requesterUsername, limit = 200 }) {
    return auditLogsDomain.listAuditLogs(this, { requesterRole, requesterUsername, limit, role: ROLE });
  }

  async getAuditMetadata({ requesterRole, requesterUsername }) {
    return auditLogsDomain.getAuditMetadata(this, { requesterRole, requesterUsername, role: ROLE });
  }

  /**
   * Journal technique local (`gts-pg-events.log`) — transitions PG du poste.
   * Réservé Admin / Responsable de station / Directeur de station.
   */
  async listTechErrorLogs({ requesterRole, requesterUsername, limit = 200 }) {
    return techErrorLogsDomain.listTechErrorLogs(this, { requesterRole, requesterUsername, limit, role: ROLE });
  }

  /**
   * Enregistre / rafraîchit la présence multi-postes (PostgreSQL).
   *
   * @param {{ username: string, sessionToken: string, hostname?: string|null }} payload
   * @returns {Promise<{ written: boolean }>}
   */
  async upsertUserPresence(payload) {
    return presenceDomain.upsertPresence(this, payload);
  }

  /**
   * Heartbeat présence (même écriture que upsert).
   *
   * @param {{ requesterUsername: string, sessionToken: string, hostname?: string|null }} payload
   * @returns {Promise<{ written: boolean }>}
   */
  async touchUserPresence({ requesterUsername, sessionToken, hostname = null }) {
    return presenceDomain.upsertPresence(this, {
      username: requesterUsername,
      sessionToken,
      hostname
    });
  }

  /**
   * Efface la présence (logout).
   *
   * @param {{ sessionToken?: string|null, username?: string|null }} payload
   * @returns {Promise<{ cleared: boolean }>}
   */
  async clearUserPresence(payload) {
    return presenceDomain.clearPresence(this, payload);
  }

  /**
   * Usernames techniques présents sur le LAN (TTL présence PG).
   *
   * @returns {Promise<string[]>}
   */
  async listActivePresenceUsernames() {
    return presenceDomain.listActivePresenceUsernames(this);
  }

  async getUserPreferences({ requesterRole, requesterUsername }) {
    await this.whenPostgresReady();
    return userPreferencesDomain.getUserPreferences(this, { requesterRole, requesterUsername });
  }

  async setUserPreferences({ requesterRole, requesterUsername, themeMode }) {
    await this.whenPostgresReady();
    return userPreferencesDomain.setUserPreferences(this, { requesterRole, requesterUsername, themeMode });
  }

  // --- RBAC (délégation `store/core/rbac`) ---

  ensureDataManagerRole(requesterRole) {
    ensureDataManagerRoleRbac(requesterRole, this.fail.bind(this));
  }

  ensureDataDeleteRole(requesterRole) {
    ensureDataDeleteRoleRbac(requesterRole, this.fail.bind(this));
  }

  /** Lecture des référentiels (saisie opérateur, main courante, etc.) */
  ensureDataReaderRole(requesterRole) {
    ensureDataReaderRoleRbac(requesterRole, this.fail.bind(this));
  }

  // --- Référentiels (async via PostgreSQL / referentialsPersistence) ---

  async listSites({ requesterRole }) {
    return referentialsDomain.listSites(this, { requesterRole });
  }

  async createSite({ requesterRole, requesterUsername, code, name, address, parc, famille, auditMode = "single" }) {
    return referentialsDomain.createSite(this, {
      requesterRole,
      requesterUsername,
      code,
      name,
      address,
      parc,
      famille,
      auditMode
    });
  }

  async updateSite({
    requesterRole,
    requesterUsername,
    id,
    code,
    name,
    address,
    parc,
    famille,
    expectedUpdatedAt,
    auditMode = "single"
  }) {
    return referentialsDomain.updateSite(this, {
      requesterRole,
      requesterUsername,
      id,
      code,
      name,
      address,
      parc,
      famille,
      expectedUpdatedAt,
      auditMode
    });
  }

  async deleteSite({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteSite(this, { requesterRole, requesterUsername, id, reason });
  }

  async listIntervenants({ requesterRole }) {
    return referentialsDomain.listIntervenants(this, { requesterRole });
  }

  async createIntervenant({ requesterRole, requesterUsername, name, auditMode = "single" }) {
    return referentialsDomain.createIntervenant(this, { requesterRole, requesterUsername, name, auditMode });
  }

  async updateIntervenant({ requesterRole, requesterUsername, id, name, expectedUpdatedAt, auditMode = "single" }) {
    return referentialsDomain.updateIntervenant(this, {
      requesterRole,
      requesterUsername,
      id,
      name,
      expectedUpdatedAt,
      auditMode
    });
  }

  async deleteIntervenant({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteIntervenant(this, { requesterRole, requesterUsername, id, reason });
  }

  async listPendingSites({ requesterRole }) {
    await this.whenPostgresReady();
    return pendingSitesDomain.listPendingSites(this, { requesterRole });
  }

  async createPendingSite(payload) {
    await this.whenPostgresReady();
    return pendingSitesDomain.createPendingSite(this, payload);
  }

  async resolvePendingSite(payload) {
    await this.whenPostgresReady();
    return pendingSitesDomain.resolvePendingSite(this, payload);
  }

  async deletePendingSite(payload) {
    await this.whenPostgresReady();
    return pendingSitesDomain.deletePendingSite(this, payload);
  }

  async listPendingIntervenants({ requesterRole }) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.listPendingIntervenants(this, { requesterRole });
  }

  async createPendingIntervenant(payload) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.createPendingIntervenant(this, payload);
  }

  async resolvePendingIntervenant(payload) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.resolvePendingIntervenant(this, payload);
  }

  async deletePendingIntervenant(payload) {
    await this.whenPostgresReady();
    return pendingIntervenantsDomain.deletePendingIntervenant(this, payload);
  }

  async listAnomalyTypes({ requesterRole }) {
    return referentialsDomain.listAnomalyTypes(this, { requesterRole });
  }

  async createAnomalyType({ requesterRole, requesterUsername, label, colorHex, auditMode = "single" }) {
    return referentialsDomain.createAnomalyType(this, { requesterRole, requesterUsername, label, colorHex, auditMode });
  }

  async updateAnomalyType({
    requesterRole,
    requesterUsername,
    id,
    label,
    colorHex,
    expectedUpdatedAt,
    auditMode = "single"
  }) {
    return referentialsDomain.updateAnomalyType(this, {
      requesterRole,
      requesterUsername,
      id,
      label,
      colorHex,
      expectedUpdatedAt,
      auditMode
    });
  }

  async deleteAnomalyType({ requesterRole, requesterUsername, id, reason }) {
    return referentialsDomain.deleteAnomalyType(this, { requesterRole, requesterUsername, id, reason });
  }

  // --- Fransor (PostgreSQL only, dossier domains/fransor) ---

  async listFransorResponsables({ requesterRole }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorResponsables(this, { requesterRole });
  }

  async createFransorResponsable({ requesterRole, requesterUsername, name }) {
    await this.whenPostgresReady();
    return fransorDomain.createFransorResponsable(this, { requesterRole, requesterUsername, name });
  }

  async updateFransorResponsable({ requesterRole, requesterUsername, id, name }) {
    await this.whenPostgresReady();
    return fransorDomain.updateFransorResponsable(this, {
      requesterRole,
      requesterUsername,
      id,
      name
    });
  }

  async deleteFransorResponsable({ requesterRole, requesterUsername, id, reason }) {
    await this.whenPostgresReady();
    return fransorDomain.deleteFransorResponsable(this, {
      requesterRole,
      requesterUsername,
      id,
      reason
    });
  }

  async listFransorClosures({ requesterRole, month }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorClosures(this, { requesterRole, month });
  }

  async upsertFransorClosure({ id, requesterRole, requesterUsername, startDate, endDate, label, mode = "CLOSED" }) {
    await this.whenPostgresReady();
    return fransorDomain.upsertFransorClosure(this, {
      id,
      requesterRole,
      requesterUsername,
      startDate,
      endDate,
      label,
      mode
    });
  }

  async deleteFransorClosure({ requesterRole, requesterUsername, id, reason }) {
    await this.whenPostgresReady();
    return fransorDomain.deleteFransorClosure(this, { requesterRole, requesterUsername, id, reason });
  }

  async listFransorEntriesByMonth({ requesterRole, month }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorEntriesByMonth(this, { requesterRole, month });
  }

  async upsertFransorEntry({ requesterRole, requesterUsername, date, responsableId, ouvertureDone, fermetureDone }) {
    await this.whenPostgresReady();
    return fransorDomain.upsertFransorEntry(this, {
      requesterRole,
      requesterUsername,
      date,
      responsableId,
      ouvertureDone,
      fermetureDone
    });
  }

  async listFransorMonthlyRecap({ requesterRole, month }) {
    await this.whenPostgresReady();
    return fransorDomain.listFransorMonthlyRecap(this, { requesterRole, month });
  }

  // --- Main courante (PostgreSQL only, dossier domains/mainCourante) ---

  async listMainCouranteEntries({ requesterRole }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.listMainCouranteEntries(this, { requesterRole });
  }

  async createMainCouranteEntry({
    requesterRole,
    requesterUsername,
    id,
    operatorName,
    siteId,
    siteDisplay,
    anomalyTypeId,
    anomalyTypeLabel,
    information
  }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.createMainCouranteEntry(this, {
      requesterRole,
      requesterUsername,
      id,
      operatorName,
      siteId,
      siteDisplay,
      anomalyTypeId,
      anomalyTypeLabel,
      information
    });
  }

  async updateMainCouranteEntryOperator({
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    siteId,
    siteDisplay,
    anomalyTypeId,
    anomalyTypeLabel,
    information,
    requesterFullName
  }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.updateMainCouranteEntryOperator(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      siteId,
      siteDisplay,
      anomalyTypeId,
      anomalyTypeLabel,
      information,
      requesterFullName
    });
  }

  async applyMainCouranteManagerAction({
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    managerName,
    managerObservation,
    decision
  }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.applyMainCouranteManagerAction(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      managerName,
      managerObservation,
      decision,
      role: ROLE
    });
  }

  async reopenMainCouranteEntry({ requesterRole, requesterUsername, id, expectedUpdatedAt, managerName }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.reopenMainCouranteEntry(this, {
      requesterRole,
      requesterUsername,
      id,
      expectedUpdatedAt,
      managerName,
      role: ROLE
    });
  }

  async getMainCouranteUnconsultedCount({ requesterRole }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.getMainCouranteUnconsultedCount(this, { requesterRole, role: ROLE });
  }

  async getMainCouranteOperatorResponseCount({ requesterRole, requesterUsername }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.getMainCouranteOperatorResponseCount(this, {
      requesterRole,
      requesterUsername,
      role: ROLE
    });
  }

  async markMainCouranteEntryConsulted({ requesterRole, requesterUsername, id }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.markMainCouranteEntryConsulted(this, {
      requesterRole,
      requesterUsername,
      id,
      role: ROLE
    });
  }

  async markMainCouranteEntryConsultedByOperator({ requesterRole, requesterUsername, id }) {
    await this.whenPostgresReady();
    return mainCouranteDomain.markMainCouranteEntryConsultedByOperator(this, {
      requesterRole,
      requesterUsername,
      id,
      role: ROLE
    });
  }

  // --- Interventions (PostgreSQL only, dossier domains/intervention) ---

  async listInterventions({ requesterRole }) {
    await this.whenPostgresReady();
    return interventionDomain.listInterventions(this, { requesterRole });
  }

  async getInterventionOpenCount({ requesterRole }) {
    await this.whenPostgresReady();
    return interventionDomain.getInterventionOpenCount(this, { requesterRole });
  }

  async createIntervention(payload) {
    await this.whenPostgresReady();
    return interventionDomain.createIntervention(this, payload);
  }

  async updateIntervention(payload) {
    await this.whenPostgresReady();
    return interventionDomain.updateIntervention(this, payload);
  }

  async setInterventionStatus(payload) {
    await this.whenPostgresReady();
    return interventionDomain.setInterventionStatus(this, payload);
  }

  async setInterventionBillingStatus(payload) {
    await this.whenPostgresReady();
    return interventionDomain.setInterventionBillingStatus(this, payload);
  }

  // --- Rondes (PostgreSQL only, dossier domains/ronde) ---

  async listRondes({ requesterRole }) {
    await this.whenPostgresReady();
    return rondeDomain.listRondes(this, { requesterRole });
  }

  async getRondeTodayInProgressCounts({ requesterRole, todayIso }) {
    await this.whenPostgresReady();
    return rondeDomain.getRondeTodayInProgressCounts(this, { requesterRole, todayIso });
  }

  async autoCloseExpiredExceptionalRondes(options) {
    await this.whenPostgresReady();
    return rondeDomain.autoCloseExpiredExceptionalRondes(this, options);
  }

  async createRondeEntry(payload) {
    await this.whenPostgresReady();
    return rondeDomain.createRonde(this, payload);
  }

  async updateRondeEntry(payload) {
    await this.whenPostgresReady();
    return rondeDomain.updateRonde(this, payload);
  }

  async setRondeStatus(payload) {
    await this.whenPostgresReady();
    return rondeDomain.setRondeStatus(this, payload);
  }

  async updateRondeBatchSharedFields(payload) {
    await this.whenPostgresReady();
    return rondeDomain.updateRondeBatchSharedFields(this, payload);
  }

  async bulkCancelRondeBatch(payload) {
    await this.whenPostgresReady();
    return rondeDomain.bulkCancelRondeBatch(this, payload);
  }

  async bulkDeleteRondeBatch(payload) {
    await this.whenPostgresReady();
    return rondeDomain.bulkDeleteRondeBatch(this, payload);
  }

  listRondeMotifTypes({ requesterRole }) {
    return rondeMotifTypesDomain.listRondeMotifTypes(this, { requesterRole });
  }

  async createRondeMotifType(payload) {
    await this.whenPostgresReady();
    return rondeMotifTypesDomain.createRondeMotifType(this, payload);
  }

  async updateRondeMotifType(payload) {
    await this.whenPostgresReady();
    return rondeMotifTypesDomain.updateRondeMotifType(this, payload);
  }

  async deleteRondeMotifType(payload) {
    await this.whenPostgresReady();
    return rondeMotifTypesDomain.deleteRondeMotifType(this, payload);
  }

  async listRondePlannedProfiles(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.listRondePlannedProfiles(this, payload);
  }

  async upsertRondePlannedProfile(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.upsertRondePlannedProfile(this, payload);
  }

  async deleteRondePlannedProfile(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.deleteRondePlannedProfile(this, payload);
  }

  async requestRondePlannedProfileCancellation(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.requestRondePlannedProfileCancellation(this, {
      ...payload,
      role: ROLE
    });
  }

  async reviewRondePlannedProfileCancellationRequest(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.reviewRondePlannedProfileCancellationRequest(this, {
      ...payload,
      role: ROLE
    });
  }

  async setRondePlannedProfilePlanningEnd(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.setRondePlannedProfilePlanningEnd(this, {
      ...payload,
      role: ROLE
    });
  }

  async setRondePlannedProfileValidated(payload) {
    await this.whenPostgresReady();
    return rondePlannedProfilesDomain.setRondePlannedProfileValidated(this, payload);
  }

  listHolidays(payload) {
    return holidaysDomain.listHolidays(this, payload);
  }

  async createHoliday(payload) {
    await this.whenPostgresReady();
    return holidaysDomain.createHoliday(this, payload);
  }

  async updateHoliday(payload) {
    await this.whenPostgresReady();
    return holidaysDomain.updateHoliday(this, payload);
  }

  async deleteHoliday(payload) {
    await this.whenPostgresReady();
    return holidaysDomain.deleteHoliday(this, payload);
  }

  async listFormVariables(payload) {
    await this.whenPostgresReady();
    return formVariablesDomain.listFormVariables(this, payload);
  }

  async saveFormVariables(payload) {
    await this.whenPostgresReady();
    return formVariablesDomain.saveFormVariables(this, payload);
  }

  async listTemplateAssignments(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.listTemplateAssignments(this, payload);
  }

  async upsertTemplateAssignment(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.upsertTemplateAssignment(this, payload);
  }

  async deleteTemplateAssignment(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.deleteTemplateAssignment(this, payload);
  }

  async resolveTemplateFileForContext(payload) {
    await this.whenPostgresReady();
    return templateAssignmentsDomain.resolveTemplateFileForContext(this, payload);
  }

  // --- Gardiennage (PostgreSQL only, dossier domains/gardiennage) ---

  async listGardiennages({ requesterRole }) {
    await this.whenPostgresReady();
    return gardiennageDomain.listGardiennages(this, { requesterRole });
  }

  async getGardiennageTodayInProgressCount({ requesterRole, todayIso }) {
    await this.whenPostgresReady();
    return gardiennageDomain.getGardiennageTodayInProgressCount(this, { requesterRole, todayIso });
  }

  async extendOpenEndedGardiennageHorizons(options) {
    await this.whenPostgresReady();
    return gardiennageDomain.extendOpenEndedGardiennageHorizons(this, options);
  }

  async autoCloseExpiredGardiennages(options) {
    await this.whenPostgresReady();
    return gardiennageDomain.autoCloseExpiredGardiennageEntries(this, options);
  }

  async createGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.createGardiennage(this, payload);
  }

  async updateGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.updateGardiennage(this, payload);
  }

  async setGardiennageStatus(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.setGardiennageStatus(this, payload);
  }

  async closeGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.closeGardiennage(this, payload);
  }

  async reopenGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.reopenGardiennage(this, payload);
  }

  async deleteGardiennage(payload) {
    await this.whenPostgresReady();
    return gardiennageDomain.deleteGardiennage(this, payload);
  }
}

/** @typedef {import('./store/core/errors').AppError} AppError */

module.exports = { UserStore, ROLE, AppError };
