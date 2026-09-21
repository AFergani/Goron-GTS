/**
 * Noyau UserStore : connexion PostgreSQL, audit, auth et caches.
 *
 * Les délégations métier (référentiels, rondes, etc.) sont dans `electron/userStore.js`.
 *
 * @module electron/store/userStoreCore
 */

const { resolveAdminAccess } = require("./core/adminAccess");
const { AppError, failWithLog } = require("./core/errors");
const {
  getEntityChangeHistory: getEntityChangeHistoryCore,
  recordEntityChange: recordEntityChangeCore
} = require("./core/entityHistory");
const {
  ensureDataManagerRole: ensureDataManagerRoleRbac,
  ensureDataDeleteRole: ensureDataDeleteRoleRbac,
  ensureDataReaderRole: ensureDataReaderRoleRbac
} = require("./core/rbac");
const {
  tryOpenPostgresLabPersistence,
  createAuditPersistenceRouter
} = require("./persistence");
const {
  resolvePostgresEventLogPath: resolvePostgresEventLogPathHelper
} = require("./persistence/postgresEventLog");
const {
  auditLogs: auditLogsDomain,
  techErrorLogs: techErrorLogsDomain
} = require("./domains/journals");
const authUsersDomain = require("./domains/users/authUsers");
const userPreferencesDomain = require("./domains/users/userPreferences");
const presenceDomain = require("./domains/users/presence");
const {
  referentials: referentialsDomain,
  holidays: holidaysDomain,
  rondeMotifTypes: rondeMotifTypesDomain,
  importAudit: importAuditDomain
} = require("./domains/data");
const dbHealthDomain = require("./domains/dbHealth");

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
class UserStoreCore {
  /**
   * @param {{ isPackaged?: boolean, userDataPath?: string }} [options]
   */
  constructor(options = {}) {
    const adminAccess = resolveAdminAccess(options);
    this.devMasterCode = adminAccess.devMasterCode;
    this.adminAccessEnabled = adminAccess.adminAccessEnabled;

    /** @type {string} Dossier userData Electron (journaux locaux, pas de fichier base). */
    this.userDataPath = String(options.userDataPath || "").trim();

    /** @type {import('./persistence/persistenceContract').PersistenceAdapter|null} */
    this.postgresPersistence = null;

    /** Routeur audit_logs (PostgreSQL only ; skip soft si PG down). */
    this.auditRouter = createAuditPersistenceRouter({
      postgresPersistence: null
    });

    /**
     * Persistance référentiels + jours fériés : PostgreSQL only (null tant que PG non attaché / injoignable).
     * @type {import('./persistence/persistenceContract').PersistenceAdapter|null}
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
    /** Dedup des appels concurrents à `ensurePostgresAttached`. */
    this._pgEnsureInFlight = null;
    /**
     * Génération du pool courant : ignore les erreurs idle d'un pool déjà remplacé
     * (sinon `referentialsPersistence` est remis à null alors que PostgreSQL répond).
     */
    this._pgPoolGeneration = 0;

    /** Chemin local du journal d'événements PG (perte / retour connexion). */
    this._postgresEventLogPath = resolvePostgresEventLogPathHelper(options.userDataPath);

    // Compte admin DEV : créé côté PostgreSQL dans `attachPostgresAuditLab`.
  }

  /**
   * Adaptateur actif pour `audit_logs` (PostgreSQL uniquement ; `null` si injoignable).
   *
   * @returns {import('./persistence/persistenceContract').PersistenceAdapter|null}
   */
  getAuditPersistence() {
    return this.auditRouter.getActive();
  }

  /**
   * Adaptateur pour sites / intervenants / types / jours fériés / motifs,
   * Fransor, main courante, interventions, gardiennage, rondes (profils inclus),
   * variables / modèles Word et comptes (PostgreSQL only ; `null` si injoignable).
   *
   * @returns {import('./persistence/persistenceContract').PersistenceAdapter|null}
   */
  getReferentialsPersistence() {
    return this._syncLivePostgresPersistence();
  }

  /**
   * Adaptateur PostgreSQL pour `users` (même pool labo que les référentiels).
   *
   * @returns {import('./persistence/persistenceContract').PersistenceAdapter|null}
   */
  getUsersPersistence() {
    return this._syncLivePostgresPersistence();
  }

  /**
   * Réassocie le pool si une panne idle a mis `referentialsPersistence` à null
   * alors que `postgresPersistence` est encore ouvert (sonde TCP OK, login refusé).
   *
   * @returns {import('./persistence/persistenceContract').PersistenceAdapter|null}
   */
  _syncLivePostgresPersistence() {
    if (this.referentialsPersistence && this.referentialsPersistence.isOpen()) {
      return this.referentialsPersistence;
    }
    if (this.postgresPersistence && this.postgresPersistence.isOpen()) {
      this.referentialsPersistence = this.postgresPersistence;
      return this.postgresPersistence;
    }
    return null;
  }

  /**
   * Refuse l'accès Gestion des données (référentiels PG) si PostgreSQL n'est pas joignable.
   *
   * @returns {void}
   */
  assertPostgresAvailableForReferentials() {
    if (this._syncLivePostgresPersistence()) {
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
    if (this._syncLivePostgresPersistence()) {
      return;
    }
    this.fail(
      "users",
      "Base PostgreSQL inaccessible. La gestion des comptes et la connexion sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }

  /**
   * Réouvre le pool PostgreSQL si besoin (ex. Docker relancé après panne).
   * La sonde `SELECT 1` peut réussir alors que `referentialsPersistence` est encore null.
   *
   * @returns {Promise<boolean>} `true` si le pool utilisateurs est ouvert
   */
  async ensurePostgresAttached() {
    if (this._syncLivePostgresPersistence()) {
      return true;
    }
    if (this._pgEnsureInFlight) {
      return this._pgEnsureInFlight;
    }
    this._pgEnsureInFlight = (async () => {
      try {
        if (this._pgAttachPromise) {
          try {
            await this._pgAttachPromise;
          } catch {
            // Nouvelle tentative ci-dessous.
          }
          if (this._syncLivePostgresPersistence()) {
            return true;
          }
        }
        this._pgAttachPromise = this.attachPostgresAuditLab({ forceReconnect: true });
        const result = await this._pgAttachPromise;
        return Boolean(result?.attached) && Boolean(this._syncLivePostgresPersistence());
      } catch {
        this._pgAttachPromise = null;
        return false;
      } finally {
        this._pgEnsureInFlight = null;
      }
    })();
    return this._pgEnsureInFlight;
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
      this._pgPoolGeneration += 1;
      try {
        await this.postgresPersistence.close();
      } catch {
        // Pool déjà mort après docker stop : ignorer.
      }
      this.postgresPersistence = null;
      this.referentialsPersistence = null;
    }

    const poolGeneration = this._pgPoolGeneration + 1;
    this._pgPoolGeneration = poolGeneration;
    const pg = await tryOpenPostgresLabPersistence({
      onIdleClientError: () => {
        // Ignorer les erreurs d'un pool déjà fermé / remplacé (sinon login bloqué alors que la sonde est verte).
        if (poolGeneration !== this._pgPoolGeneration) return;
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
      const deadPool = this.postgresPersistence;
      this.postgresPersistence = null;
      this._pgPoolGeneration += 1;
      if (deadPool && typeof deadPool.close === "function") {
        void deadPool.close().catch(() => {});
      }
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
   * @returns {Promise<UserStoreCore>}
   */
  static async open(options = {}) {
    return new this(options);
  }

  /**
   * Ferme le pool PostgreSQL (arrêt propre / bascule).
   *
   * @returns {Promise<void>}
   */
  async close() {
    this._pgPoolGeneration += 1;
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
   * Confirme le mot de passe d'un responsable / directeur / Admin pour une restauration.
   *
   * @param {{ username?: string, fullName?: string, password: string }} payload
   * @returns {Promise<"ok"|"invalid"|"forbidden"|"dev-code-unavailable">}
   */
  async confirmStationAdminPassword({ username, fullName, password }) {
    await this.whenPostgresReady();
    await this.ensurePostgresAttached();
    return authUsersDomain.confirmStationAdminPassword(this, {
      username,
      fullName,
      password,
      roles: ROLE
    });
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
    await this.ensurePostgresAttached();
    return authUsersDomain.login(this, { username, password, role: ROLE });
  }

  async completeFirstLogin({ username, temporaryPassword, newPassword }) {
    await this.whenPostgresReady();
    await this.ensurePostgresAttached();
    return authUsersDomain.completeFirstLogin(this, { username, temporaryPassword, newPassword });
  }

  async resetPasswordWithPeerValidation({ fullName, validatorFullName, validatorPassword, reason }) {
    await this.whenPostgresReady();
    await this.ensurePostgresAttached();
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

}

module.exports = { UserStoreCore, ROLE, AppError };
