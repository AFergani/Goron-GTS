/**
 * Service admin PostgreSQL : lecture / enregistrement config chiffrée, test et reconnexion.
 *
 * Appelé par les IPC `system:getPostgresConfig` / `savePostgresConfig` / `testPostgresConfig`
 * (Paramètres → Base de données) et par le bootstrap pre-login
 * (`getPostgresBootstrapStatus` / `savePostgresBootstrapConfig` / `testPostgresBootstrapConfig`).
 * RBAC : `canManageDatabase` (directeur / responsable / DEV) hors bootstrap.
 *
 * @module electron/main/postgresAdminService
 */

const {
  getPublicPostgresConnectionConfig,
  getPostgresConnectionConfig,
  writeEncryptedPostgresConfig,
  readEncryptedPostgresConfig,
  resolvePgEncFilePath,
  hasEnvOverrides
} = require("../store/persistence/postgresConnectionConfig");
const { probePostgresLab } = require("../store/persistence/postgresLabProbe");
const { resetPostgresLabMonitor } = require("../store/persistence/postgresLabMonitor");

/**
 * @param {object} deps
 * @param {() => import('../userStore')|null} deps.getUserStore
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @returns {{
 *   getPublicConfig: () => object,
 *   getBootstrapStatus: () => { needsSetup: boolean, config: object },
 *   needsBootstrapSetup: () => boolean,
 *   saveConfig: (payload: object) => Promise<object>,
 *   saveBootstrapConfig: (payload: object) => Promise<object>,
 *   testConfig: (payload?: object) => Promise<object>,
 *   testBootstrapConfig: (payload?: object) => Promise<object>,
 *   reconnect: () => Promise<object>,
 *   resolvePgEncFilePath: (userDataPath?: string) => string
 * }}
 */
function createPostgresAdminService(deps) {
  const { getUserStore, canManageDatabase } = deps;

  /**
   * Fenêtre bootstrap ouverte tant qu'aucune config chiffrée n'existait au démarrage,
   * ou tant que le 1er enregistrement n'a pas abouti à une base joignable.
   * Évite de bloquer l'écran si l'hôte LAN est incorrect au premier essai.
   * @type {boolean}
   */
  let bootstrapWindowOpen = false;

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
   * Indique si ce poste n'a encore aucune config PG explicite (fichier chiffré ou env).
   * Dans ce cas l'écran de premier paramétrage doit s'afficher avant le login.
   *
   * En développement (`npm run dev`, appli non packagée), les valeurs labo Docker
   * (`127.0.0.1` / `goron_gts` / `goron_gts_app`) suffisent : pas d'écran à chaque lancement.
   * En build packagé, une config chiffrée (ou `GTS_PG_*`) reste obligatoire.
   *
   * @returns {boolean}
   */
  function needsBootstrapSetup() {
    if (hasEnvOverrides()) return false;
    try {
      const { app } = require("electron");
      if (app && !app.isPackaged) return false;
    } catch {
      // Hors Electron (tests Node) : pas d'écran bootstrap.
      return false;
    }
    const encrypted = readEncryptedPostgresConfig();
    return !(encrypted && encrypted.host && encrypted.database && encrypted.user && encrypted.password);
  }

  // Ouverture initiale de la fenêtre bootstrap (évaluée une fois à la création du service).
  bootstrapWindowOpen = needsBootstrapSetup();

  /**
   * Vue publique (sans mot de passe) pour l'UI admin / bootstrap.
   *
   * @returns {object}
   */
  function getPublicConfig() {
    return getPublicPostgresConnectionConfig();
  }

  /**
   * Statut bootstrap (appelable sans session).
   *
   * @returns {{ needsSetup: boolean, config: object }}
   */
  function getBootstrapStatus() {
    const needsSetup = bootstrapWindowOpen || needsBootstrapSetup();
    const config = getPublicConfig();
    const encrypted = readEncryptedPostgresConfig();
    // Avant 1er enregistrement, les défauts labo ne sont pas un secret stocké sur le poste.
    if (needsSetup && !encrypted?.password) {
      return {
        needsSetup: true,
        config: { ...config, hasPassword: false }
      };
    }
    return {
      needsSetup,
      config
    };
  }

  /**
   * Enregistrement 1er lancement sans session (uniquement si aucune config chiffrée / env).
   *
   * @param {object} payload
   * @returns {Promise<{ success: boolean, config: object, reconnect: object }>}
   */
  async function saveBootstrapConfig(payload) {
    if (!bootstrapWindowOpen && !needsBootstrapSetup()) {
      const err = new Error(
        "Une connexion PostgreSQL est déjà configurée sur ce poste. Connectez-vous pour la modifier dans Paramètres."
      );
      err.code = "BOOTSTRAP_NOT_ALLOWED";
      throw err;
    }
    const result = await saveConfig({
      ...payload,
      requesterUsername: "system:pg-bootstrap"
    });
    if (result?.reconnect?.reachable) {
      bootstrapWindowOpen = false;
    } else {
      bootstrapWindowOpen = true;
    }
    return result;
  }

  /**
   * Enregistre la config chiffrée puis force une reconnexion du pool.
   * Si `password` est vide, conserve le mot de passe déjà stocké.
   *
   * @param {object} payload
   * @param {string} payload.requesterUsername
   * @param {string} payload.host
   * @param {number|string} payload.port
   * @param {string} payload.database
   * @param {string} payload.user
   * @param {string} [payload.password]
   * @returns {Promise<{ success: boolean, config: object, reconnect: object }>}
   */
  async function saveConfig(payload) {
    const requesterUsername = String(payload?.requesterUsername || "").trim();
    const isBootstrap = requesterUsername === "system:pg-bootstrap";
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

    // Pour le bootstrap, l'autorisation est déjà gérée dans saveBootstrapConfig (fenêtre ouverte).
    if (isBootstrap && !bootstrapWindowOpen && !needsBootstrapSetup()) {
      const err = new Error(
        "Une connexion PostgreSQL est déjà configurée sur ce poste. Connectez-vous pour la modifier dans Paramètres."
      );
      err.code = "BOOTSTRAP_NOT_ALLOWED";
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
      password = existing?.password || "";
      if (!password) {
        // Repli labo uniquement si aucune config chiffrée (premier enregistrement sans mdp saisi).
        password = getPostgresConnectionConfig().password || "";
      }
    }
    if (!password) {
      throw new Error("Saisissez le mot de passe technique PostgreSQL.");
    }

    writeEncryptedPostgresConfig({ host, port, database, user, password });
    resetPostgresLabMonitor();

    const store = getUserStore();
    if (store && typeof store.logAudit === "function") {
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
   * Teste la connexion (brouillon UI ou config courante).
   * Un brouillon avec mot de passe vide réutilise le secret déjà stocké.
   *
   * @param {object} [payload]
   * @param {string} [payload.host]
   * @param {number|string} [payload.port]
   * @param {string} [payload.database]
   * @param {string} [payload.user]
   * @param {string} [payload.password]
   * @returns {Promise<{ reachable: boolean, host: string, port: number, database: string, error: string|null, checkedAt: string }>}
   */
  async function testConfig(payload = {}) {
    const current = getPostgresConnectionConfig();
    const host = String(payload.host != null ? payload.host : current.host).trim() || current.host;
    const port = Number(payload.port != null ? payload.port : current.port) || current.port;
    const database =
      String(payload.database != null ? payload.database : current.database).trim() || current.database;
    const user = String(payload.user != null ? payload.user : current.user).trim() || current.user;
    let password = String(payload.password != null ? payload.password : "");
    if (!password) {
      password = current.password || "";
    }

    const { Client } = require("pg");
    const checkedAt = new Date().toISOString();
    const client = new Client({
      host,
      port,
      database,
      user,
      password,
      connectionTimeoutMillis: current.connectionTimeoutMillis || 2500
    });
    try {
      await client.connect();
      await client.query("SELECT 1 AS ok");
      return { reachable: true, host, port, database, error: null, checkedAt };
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Connexion PostgreSQL impossible.";
      return { reachable: false, host, port, database, error: message, checkedAt };
    } finally {
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Force la réouverture du pool PostgreSQL (après save ou panne).
   *
   * @returns {Promise<{ success: boolean, reachable: boolean, error: string|null }>}
   */
  async function reconnect() {
    const store = getUserStore();
    if (!store || typeof store.attachPostgresAuditLab !== "function") {
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
      if (typeof store.setAuditPostgresReachable === "function") {
        store.setAuditPostgresReachable(reachable);
      }
      return { success: reachable, reachable, error: reachable ? null : "Pool PostgreSQL non ouvert." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      return { success: false, reachable: false, error: message };
    }
  }

  /**
   * Teste la connexion sans session (écran de premier paramétrage uniquement).
   *
   * @param {object} [payload]
   * @returns {Promise<object>}
   */
  async function testBootstrapConfig(payload = {}) {
    if (!bootstrapWindowOpen && !needsBootstrapSetup()) {
      const err = new Error(
        "Une connexion PostgreSQL est déjà configurée. Connectez-vous pour tester depuis Paramètres."
      );
      err.code = "BOOTSTRAP_NOT_ALLOWED";
      throw err;
    }
    return testConfig(payload);
  }

  return {
    getPublicConfig,
    getBootstrapStatus,
    needsBootstrapSetup,
    saveConfig,
    saveBootstrapConfig,
    testConfig,
    testBootstrapConfig,
    reconnect,
    resolvePgEncFilePath
  };
}

module.exports = {
  createPostgresAdminService
};
