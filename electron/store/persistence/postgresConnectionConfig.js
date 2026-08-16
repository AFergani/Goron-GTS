/**
 * Configuration de connexion PostgreSQL (hôte, port, base, utilisateur, mot de passe).
 *
 * Priorité de résolution :
 * 1. Variables d'environnement `GTS_PG_*` (labo / CI — écrasent le fichier chiffré) ;
 * 2. Fichier chiffré `{userData}/gts-pg.enc` via `safeStorage` (DPAPI) ;
 * 3. Valeurs labo par défaut (Docker `goron-pg18`).
 *
 * Le mot de passe n'est jamais renvoyé en clair à l'UI (`getPublicPostgresConnectionConfig`).
 *
 * @module electron/store/persistence/postgresConnectionConfig
 */

const fs = require("fs");
const path = require("path");

/** Nom du fichier chiffré dans `userData`. */
const PG_ENC_FILE_NAME = "gts-pg.enc";

/** Timeout connexion client `pg` (ms). */
const DEFAULT_CONNECTION_TIMEOUT_MS = 2500;

/**
 * @typedef {{
 *   host: string,
 *   port: number,
 *   database: string,
 *   user: string,
 *   password: string,
 *   connectionTimeoutMillis: number,
 *   source: "env"|"encrypted"|"defaults"
 * }} PostgresConnectionConfig
 */

/**
 * @typedef {{
 *   host: string,
 *   port: number,
 *   database: string,
 *   user: string,
 *   hasPassword: boolean,
 *   source: "env"|"encrypted"|"defaults",
 *   encryptionAvailable: boolean,
 *   envOverridesActive: boolean
 * }} PublicPostgresConnectionConfig
 */

/**
 * Valeurs labo Docker (sans secret en dur côté UI — utilisé seulement en repli technique).
 *
 * @returns {Omit<PostgresConnectionConfig, "source">}
 */
function getLabDefaults() {
  return {
    host: "127.0.0.1",
    port: 5432,
    database: "goron_gts",
    user: "goron_gts_app",
    password: "dev_app_secret",
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS
  };
}

/**
 * Indique si au moins une variable `GTS_PG_*` est définie (hors timeout).
 *
 * @returns {boolean}
 */
function hasEnvOverrides() {
  return Boolean(
    process.env.GTS_PG_HOST ||
      process.env.GTS_PG_PORT ||
      process.env.GTS_PG_DATABASE ||
      process.env.GTS_PG_USER ||
      process.env.GTS_PG_PASSWORD
  );
}

/**
 * Résout le chemin du fichier chiffré PG.
 *
 * @param {string} [encFilePath] - Chemin forcé (tests) ; sinon `{userData}/gts-pg.enc`.
 * @returns {string}
 */
function resolvePgEncFilePath(encFilePath) {
  if (encFilePath) return path.resolve(encFilePath);
  try {
    const { app } = require("electron");
    return path.join(app.getPath("userData"), PG_ENC_FILE_NAME);
  } catch {
    return path.join(process.cwd(), "data", PG_ENC_FILE_NAME);
  }
}

/**
 * Lit la config chiffrée depuis le disque.
 *
 * @param {string} [encFilePath]
 * @returns {{ host: string, port: number, database: string, user: string, password: string }|null}
 */
function readEncryptedPostgresConfig(encFilePath) {
  try {
    const { safeStorage } = require("electron");
    if (!safeStorage.isEncryptionAvailable()) return null;
    const filePath = resolvePgEncFilePath(encFilePath);
    if (!fs.existsSync(filePath)) return null;
    const encryptedBase64 = fs.readFileSync(filePath, "utf-8").trim();
    if (!encryptedBase64) return null;
    const plain = safeStorage.decryptString(Buffer.from(encryptedBase64, "base64"));
    const parsed = JSON.parse(String(plain || "{}"));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      host: String(parsed.host || "").trim(),
      port: Number(parsed.port) || 5432,
      database: String(parsed.database || "").trim(),
      user: String(parsed.user || "").trim(),
      password: String(parsed.password || "")
    };
  } catch {
    return null;
  }
}

/**
 * Enregistre la config PostgreSQL chiffrée (DPAPI / `safeStorage`).
 *
 * @param {object} config
 * @param {string} config.host
 * @param {number|string} config.port
 * @param {string} config.database
 * @param {string} config.user
 * @param {string} config.password - Mot de passe en clair (obligatoire à la première saisie).
 * @param {string} [encFilePath]
 * @returns {void}
 * @throws {Error} Si le chiffrement système est indisponible.
 */
function writeEncryptedPostgresConfig(config, encFilePath) {
  const { safeStorage } = require("electron");
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Le chiffrement système (safeStorage) n'est pas disponible sur ce poste.");
  }
  const payload = {
    host: String(config.host || "").trim() || "127.0.0.1",
    port: Number(config.port) || 5432,
    database: String(config.database || "").trim() || "goron_gts",
    user: String(config.user || "").trim() || "goron_gts_app",
    password: String(config.password || "")
  };
  if (!payload.password) {
    throw new Error("Le mot de passe technique PostgreSQL est obligatoire.");
  }
  const encryptedBuffer = safeStorage.encryptString(JSON.stringify(payload));
  const filePath = resolvePgEncFilePath(encFilePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encryptedBuffer.toString("base64"), "utf-8");
}

/**
 * Indique si `safeStorage` est utilisable sur ce poste.
 *
 * @returns {boolean}
 */
function isPostgresEncryptionAvailable() {
  try {
    const { safeStorage } = require("electron");
    return Boolean(safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

/**
 * Résout la config complète (avec mot de passe) pour le driver `pg`.
 *
 * @param {object} [options]
 * @param {string} [options.encFilePath] - Chemin fichier chiffré (tests).
 * @returns {PostgresConnectionConfig}
 */
function getPostgresConnectionConfig(options = {}) {
  const defaults = getLabDefaults();
  const envActive = hasEnvOverrides();

  if (envActive) {
    return {
      host: String(process.env.GTS_PG_HOST || defaults.host).trim() || defaults.host,
      port: Number(process.env.GTS_PG_PORT || defaults.port) || defaults.port,
      database: String(process.env.GTS_PG_DATABASE || defaults.database).trim() || defaults.database,
      user: String(process.env.GTS_PG_USER || defaults.user).trim() || defaults.user,
      password: String(
        process.env.GTS_PG_PASSWORD !== undefined ? process.env.GTS_PG_PASSWORD : defaults.password
      ),
      connectionTimeoutMillis: defaults.connectionTimeoutMillis,
      source: "env"
    };
  }

  const encrypted = readEncryptedPostgresConfig(options.encFilePath);
  if (encrypted && encrypted.host && encrypted.database && encrypted.user) {
    return {
      host: encrypted.host || defaults.host,
      port: encrypted.port || defaults.port,
      database: encrypted.database || defaults.database,
      user: encrypted.user || defaults.user,
      password: encrypted.password || "",
      connectionTimeoutMillis: defaults.connectionTimeoutMillis,
      source: "encrypted"
    };
  }

  return {
    ...defaults,
    source: "defaults"
  };
}

/**
 * Vue publique pour l'UI admin (sans mot de passe).
 *
 * @param {object} [options]
 * @param {string} [options.encFilePath]
 * @returns {PublicPostgresConnectionConfig}
 */
function getPublicPostgresConnectionConfig(options = {}) {
  const cfg = getPostgresConnectionConfig(options);
  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    hasPassword: Boolean(cfg.password),
    source: cfg.source,
    encryptionAvailable: isPostgresEncryptionAvailable(),
    envOverridesActive: cfg.source === "env"
  };
}

module.exports = {
  PG_ENC_FILE_NAME,
  getLabDefaults,
  getPostgresConnectionConfig,
  getPublicPostgresConnectionConfig,
  readEncryptedPostgresConfig,
  writeEncryptedPostgresConfig,
  isPostgresEncryptionAvailable,
  resolvePgEncFilePath,
  hasEnvOverrides
};
