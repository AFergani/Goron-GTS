/**
 * Service admin PostgreSQL : lecture / enregistrement config chiffrée, test et reconnexion.
 *
 * IPC bootstrap pre-login (`system:*PostgresBootstrap*`).
 * La modification une fois connecté n'existe plus : si la base est injoignable, l'appli est bloquée
 * et la récupération se fait avant le login.
 *
 * @module electron/main/postgresAdminService
 */

const { timingSafeEqualUtf8 } = require("../store/core/password");
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
 * @returns {{
 *   getBootstrapStatus: () => Promise<{ needsSetup: boolean, reachable: boolean, config: object }>,
 *   saveBootstrapConfig: (payload: object) => Promise<object>,
 *   testBootstrapConfig: (payload?: object) => Promise<object>,
 *   reconnect: () => Promise<object>
 * }}
 */
function createPostgresAdminService(deps) {
  const { getUserStore } = deps;

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
   * Vue publique (sans mot de passe) pour l'écran de connexion.
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
   * Une config déjà enregistrée ne se remplace qu'en prouvant la connaissance
   * du mot de passe technique actuel (stocké chiffré sur le poste).
   *
   * @param {object} payload
   * @returns {void}
   * @throws {Error}
   */
  function assertRecoveryKnowsCurrentPassword(payload) {
    const existing = readEncryptedPostgresConfig();
    if (!existing?.password) return;
    const currentPassword = String(payload?.currentPassword || "");
    if (payload && typeof payload === "object") {
      payload.currentPassword = "";
    }
    if (!timingSafeEqualUtf8(currentPassword, existing.password)) {
      const err = new Error(
        "Mot de passe technique actuel incorrect. Il est demandé pour modifier une configuration déjà enregistrée sur ce poste."
      );
      err.code = "BOOTSTRAP_PASSWORD_REQUIRED";
      throw err;
    }
  }

  /**
   * Enregistrement 1er lancement / récupération sans session (PG injoignable).
   * Si une config existe déjà, `currentPassword` doit correspondre au secret technique du poste.
   *
   * @param {object} payload
   * @returns {Promise<{ success: boolean, config: object, reconnect: object }>}
   */
  async function saveBootstrapConfig(payload) {
    await assertBootstrapOrRecoveryAllowed();
    assertRecoveryKnowsCurrentPassword(payload);
    const configPayload = { ...(payload || {}) };
    delete configPayload.currentPassword;
    const result = await saveConfig({
      ...configPayload,
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
    if (requesterUsername !== BOOTSTRAP_ACTOR) {
      const err = new Error("La configuration PostgreSQL se modifie uniquement avant la connexion, lorsque la base est injoignable.");
      err.code = "FORBIDDEN";
      throw err;
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
    getBootstrapStatus,
    saveBootstrapConfig,
    testBootstrapConfig,
    reconnect,
    tryAutoPersistLabDefaultsIfMissing
  };
}

module.exports = {
  createPostgresAdminService
};
