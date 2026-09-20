/**
 * Service admin PostgreSQL : lecture / enregistrement config chiffrée, test et reconnexion.
 *
 * IPC Paramètres (`system:*PostgresConfig`) et bootstrap pre-login
 * (`system:*PostgresBootstrap*`). RBAC : directeur / responsable de station / DEV, hors bootstrap.
 *
 * @module electron/main/postgresAdminService
 */

const {
  getPublicPostgresConnectionConfig,
  getPostgresConnectionConfig,
  writeEncryptedPostgresConfig,
  readEncryptedPostgresConfig,
  hasEnvOverrides
} = require("../store/persistence/postgresConnectionConfig");
const { probePostgresLab } = require("../store/persistence/postgresLabProbe");
const { resetPostgresLabMonitor } = require("../store/persistence/postgresLabMonitor");

const BOOTSTRAP_ACTOR = "system:pg-bootstrap";

/**
 * Fabrique le service d'administration de la connexion PostgreSQL du poste.
 *
 * @param {object} deps
 * @param {() => import('../userStore')|null} deps.getUserStore
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @returns {{
 *   getPublicConfig: () => object,
 *   getBootstrapStatus: () => Promise<{ needsSetup: boolean, reachable: boolean, config: object }>,
 *   saveConfig: (payload: object) => Promise<object>,
 *   saveBootstrapConfig: (payload: object) => Promise<object>,
 *   testConfig: (payload?: object) => Promise<object>,
 *   testBootstrapConfig: (payload?: object) => Promise<object>,
 *   reconnect: () => Promise<object>
 * }}
 */
function createPostgresAdminService(deps) {
  const { getUserStore, canManageDatabase } = deps;

  /**
   * Indique si une config PostgreSQL valide est déjà persistée sur le poste.
   *
   * @returns {boolean}
   */
  function hasPersistedPostgresConfig() {
    const encrypted = readEncryptedPostgresConfig();
    return Boolean(encrypted?.host && encrypted?.database && encrypted?.user && encrypted?.password);
  }

  /**
   * Indique si ce poste n'a encore aucune config PG explicite (fichier chiffré ou env).
   * En développement non packagé : pas d'écran bootstrap (défauts Docker labo).
   *
   * @returns {boolean}
   */
  function needsBootstrapSetup() {
    if (hasEnvOverrides()) return false;
    try {
      const { app } = require("electron");
      if (app && !app.isPackaged) return false;
    } catch {
      return false;
    }
    return !hasPersistedPostgresConfig();
  }

  /**
   * @param {string} requesterUsername
   * @returns {void}
   * @throws {Error}
   */
  function assertCanManage(requesterUsername) {
    if (!canManageDatabase(requesterUsername)) {
      const err = new Error("Droits insuffisants pour gérer la connexion PostgreSQL.");
      err.code = "FORBIDDEN";
      throw err;
    }
  }

  /**
   * Autorise le bootstrap pre-login si aucune config n'existe encore,
   * ou si la config actuelle est injoignable (récupération IP / serveur).
   *
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async function assertBootstrapOrRecoveryAllowed() {
    if (needsBootstrapSetup()) return;
    const probe = await probePostgresLab();
    if (!probe.reachable) return;
    const err = new Error(
      "PostgreSQL est accessible avec la configuration actuelle. Pour changer d'adresse, utilisez le lien de récupération lorsque la base est injoignable."
    );
    err.code = "BOOTSTRAP_NOT_ALLOWED";
    throw err;
  }

  /**
   * Vue publique (sans mot de passe) pour l'UI admin / bootstrap.
   *
   * @returns {object}
   */
  function getPublicConfig() {
    return getPublicPostgresConnectionConfig();
  }

  /**
   * Statut bootstrap (appelable sans session) + sonde d'accessibilité.
   *
   * @returns {Promise<{ needsSetup: boolean, reachable: boolean, config: object }>}
   */
  async function getBootstrapStatus() {
    const needsSetup = needsBootstrapSetup();
    const config = getPublicConfig();
    const encrypted = readEncryptedPostgresConfig();

    let reachable = false;
    if (!needsSetup) {
      try {
        const probe = await probePostgresLab();
        reachable = Boolean(probe.reachable);
      } catch {
        reachable = false;
      }
    }

    // Sonde OK ≠ pool app ouvert (ex. Docker stop/start) : réattacher pour le login.
    if (reachable) {
      const store = getUserStore();
      if (store && typeof store.ensurePostgresAttached === "function") {
        const attached = await store.ensurePostgresAttached();
        reachable = Boolean(attached);
      }
    }

    if (needsSetup && !encrypted?.password) {
      return {
        needsSetup: true,
        reachable: false,
        config: { ...config, hasPassword: false }
      };
    }
    return {
      needsSetup,
      reachable,
      config
    };
  }

  /**
   * Enregistrement 1er lancement / récupération sans session (PG injoignable).
   *
   * @param {object} payload
   * @returns {Promise<{ success: boolean, config: object, reconnect: object }>}
   */
  async function saveBootstrapConfig(payload) {
    await assertBootstrapOrRecoveryAllowed();
    const result = await saveConfig({
      ...payload,
      requesterUsername: BOOTSTRAP_ACTOR
    });
    if (!result?.reconnect?.reachable) {
      const probe = await probePostgresLab();
      if (probe.reachable) {
        result.reconnect = { success: true, reachable: true, error: null };
      }
    }
    return result;
  }

  /**
   * Poste labo local (exe installé) : si Docker répond sur les défauts, enregistre
   * automatiquement la config comme en `npm run dev` (sans écran bootstrap).
   *
   * @returns {Promise<{ persisted: boolean }>}
   */
  async function tryAutoPersistLabDefaultsIfMissing() {
    if (!needsBootstrapSetup()) {
      return { persisted: false };
    }

    const defaults = getPostgresConnectionConfig();
    const probe = await probePostgresLab({
      host: defaults.host,
      port: defaults.port,
      database: defaults.database,
      user: defaults.user,
      password: defaults.password
    });
    if (!probe.reachable) {
      return { persisted: false };
    }

    writeEncryptedPostgresConfig({
      host: defaults.host,
      port: defaults.port,
      database: defaults.database,
      user: defaults.user,
      password: defaults.password
    });
    return { persisted: true };
  }

  /**
   * Enregistre la config chiffrée puis force une reconnexion du pool.
   * Si `password` est vide, conserve le mot de passe déjà stocké.
   *
   * @param {object} payload
   * @returns {Promise<{ success: boolean, config: object, reconnect: object }>}
   */
  async function saveConfig(payload) {
    const requesterUsername = String(payload?.requesterUsername || "").trim();
    const isBootstrap = requesterUsername === BOOTSTRAP_ACTOR;
    if (!isBootstrap) {
      assertCanManage(requesterUsername);
    }

    if (hasEnvOverrides()) {
      const err = new Error(
        "Des variables d'environnement GTS_PG_* sont actives : elles priment sur le fichier chiffré. Retirez-les pour enregistrer une config locale."
      );
      err.code = "ENV_OVERRIDE";
      throw err;
    }

    const host = String(payload?.host || "").trim();
    const port = Number(payload?.port) || 5432;
    const database = String(payload?.database || "").trim();
    const user = String(payload?.user || "").trim();
    let password = String(payload?.password || "");

    if (!host || !database || !user) {
      throw new Error("Hôte, nom de base et utilisateur sont obligatoires.");
    }
    if (port < 1 || port > 65535) {
      throw new Error("Port PostgreSQL invalide.");
    }

    if (!password) {
      const existing = readEncryptedPostgresConfig();
      password = existing?.password || getPostgresConnectionConfig().password || "";
    }
    if (!password) {
      throw new Error("Saisissez le mot de passe technique PostgreSQL.");
    }

    writeEncryptedPostgresConfig({ host, port, database, user, password });
    resetPostgresLabMonitor();

    const store = getUserStore();
    if (store) {
      try {
        store.logAudit({
          action: "POSTGRES_CONFIG_SAVE",
          status: "SUCCESS",
          actorUsername: requesterUsername,
          details: {
            after: { host, port, database, user }
          }
        });
      } catch {
        // L'audit ne doit pas bloquer l'enregistrement de config.
      }
    }

    const reconnectResult = await reconnect();
    return {
      success: true,
      config: getPublicConfig(),
      reconnect: reconnectResult
    };
  }

  /**
   * Teste la connexion (brouillon UI fusionné par `probePostgresLab`).
   *
   * @param {object} [payload]
   * @returns {Promise<{ reachable: boolean, host: string, port: number, database: string, error: string|null, checkedAt: string }>}
   */
  async function testConfig(payload = {}) {
    return probePostgresLab(payload);
  }

  /**
   * Force la réouverture du pool PostgreSQL (après save ou panne).
   *
   * @returns {Promise<{ success: boolean, reachable: boolean, error: string|null }>}
   */
  async function reconnect() {
    const store = getUserStore();
    if (!store) {
      const probe = await probePostgresLab();
      return {
        success: probe.reachable,
        reachable: probe.reachable,
        error: probe.error
      };
    }
    try {
      resetPostgresLabMonitor();
      await store.attachPostgresAuditLab({ forceReconnect: true });
      const reachable = Boolean(store.postgresPersistence);
      store.setAuditPostgresReachable(reachable);
      return { success: reachable, reachable, error: reachable ? null : "Pool PostgreSQL non ouvert." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      return { success: false, reachable: false, error: message };
    }
  }

  /**
   * Teste la connexion sans session (1er paramétrage ou récupération si PG injoignable).
   *
   * @param {object} [payload]
   * @returns {Promise<object>}
   */
  async function testBootstrapConfig(payload = {}) {
    await assertBootstrapOrRecoveryAllowed();
    return testConfig(payload);
  }

  return {
    getPublicConfig,
    getBootstrapStatus,
    saveConfig,
    saveBootstrapConfig,
    testConfig,
    testBootstrapConfig,
    reconnect,
    tryAutoPersistLabDefaultsIfMissing
  };
}

module.exports = {
  createPostgresAdminService
};
