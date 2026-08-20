/**
 * Adaptateur de persistance PostgreSQL (async) pour Goron-GTS.
 *
 * Contrat : `run` / `get` / `all` / `exec` / `transaction` / `open` / `close` / `isOpen`.
 * Convertit les placeholders `?` en `$1…$n` (SQL métier historique).
 * Fabriqué par `openPostgresPersistence` ; consommé via `UserStore` / domaines.
 *
 * @module electron/store/persistence/postgresPersistence
 */

const { Pool } = require("pg");

const DEFAULT_CONNECTION_TIMEOUT_MS = 2500;
const DEFAULT_POOL_MAX = 4;

/**
 * Remplace les `?` positionnels par des placeholders PostgreSQL `$1`, `$2`, …
 *
 * @param {string} sql
 * @returns {string}
 */
function toPgPlaceholders(sql) {
  let index = 0;
  return String(sql || "").replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

/**
 * Normalise les paramètres pour PostgreSQL.
 * Les booléens JS deviennent `0`/`1` : le schéma métier stocke ces flags en
 * `INTEGER` (`is_locked`, `is_active`, etc.) — sinon `pg` envoie `"false"` et PG refuse.
 *
 * @param {unknown[]} [params]
 * @returns {unknown[]}
 */
function normalizePgParams(params = []) {
  return (Array.isArray(params) ? params : []).map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  });
}

/**
 * Découpe un script SQL en instructions (commentaires SQL ignorés).
 *
 * @param {string} sql
 * @returns {string[]}
 */
function splitSqlStatements(sql) {
  const withoutBlockComments = String(sql || "").replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return withoutLineComments
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
async function queryOn(client, sql, params = []) {
  return client.query(toPgPlaceholders(sql), normalizePgParams(params));
}

/**
 * Exécute un script (plusieurs instructions) sur un client / pool.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} sql
 * @returns {Promise<void>}
 */
async function execOn(client, sql) {
  for (const statement of splitSqlStatements(sql)) {
    await client.query(statement);
  }
}

/**
 * API `run` / `get` / `all` liée à un client (pool ou connexion de transaction).
 *
 * @param {() => import('pg').Pool|import('pg').PoolClient} getClient
 * @returns {{
 *   run: (sql: string, params?: unknown[]) => Promise<import('./persistenceContract').PersistenceRunResult>,
 *   get: (sql: string, params?: unknown[]) => Promise<object|undefined>,
 *   all: (sql: string, params?: unknown[]) => Promise<object[]>
 * }}
 */
function bindQueryApi(getClient) {
  return {
    async run(sql, params = []) {
      const result = await queryOn(getClient(), sql, params);
      return { changes: Number(result.rowCount || 0) };
    },
    async get(sql, params = []) {
      const result = await queryOn(getClient(), sql, params);
      return result.rows[0];
    },
    async all(sql, params = []) {
      const result = await queryOn(getClient(), sql, params);
      return Array.isArray(result.rows) ? result.rows : [];
    }
  };
}

/**
 * Crée un adaptateur PostgreSQL à partir d'une config de connexion.
 *
 * @param {object} config
 * @param {string} config.host
 * @param {number} config.port
 * @param {string} config.database
 * @param {string} config.user
 * @param {string} config.password
 * @param {number} [config.connectionTimeoutMillis]
 * @param {number} [config.max]
 * @param {(error: unknown) => void} [config.onIdleClientError] - Callback optionnel (panne idle / admin PG).
 * @returns {import('./persistenceContract').PersistenceAdapter}
 */
function createPostgresPersistence(config) {
  /** @type {import('pg').Pool|null} */
  let pool = null;
  let openPromise = null;

  /**
   * @returns {import('pg').Pool}
   */
  function requirePool() {
    if (!pool) {
      throw new Error("Adaptateur PostgreSQL fermé ou non ouvert.");
    }
    return pool;
  }

  /**
   * Ouvre le pool de connexions.
   *
   * @returns {Promise<void>}
   */
  async function open() {
    if (pool) return;
    if (openPromise) {
      await openPromise;
      return;
    }
    openPromise = Promise.resolve().then(() => {
      pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        connectionTimeoutMillis: config.connectionTimeoutMillis || DEFAULT_CONNECTION_TIMEOUT_MS,
        max: config.max || DEFAULT_POOL_MAX
      });
      // Obligatoire : un client idle tué par PG (docker stop, reload) émet `error`
      // hors requête — sans listener Node/Electron affiche la boîte « Uncaught Exception ».
      pool.on("error", (error) => {
        const message = error instanceof Error ? error.message : String(error || "");
        console.warn("[postgres] Client idle du pool déconnecté:", message);
        if (typeof config.onIdleClientError === "function") {
          try {
            config.onIdleClientError(error);
          } catch {
            // Ne jamais remonter une erreur depuis ce listener.
          }
        }
      });
    });
    try {
      await openPromise;
      await requirePool().query("SELECT 1 AS ok");
    } catch (error) {
      if (pool) {
        try {
          await pool.end();
        } catch {
          // ignore
        }
        pool = null;
      }
      throw error;
    } finally {
      openPromise = null;
    }
  }

  /**
   * Ferme le pool.
   *
   * @returns {Promise<void>}
   */
  async function close() {
    if (!pool) return;
    const current = pool;
    pool = null;
    await current.end();
  }

  /**
   * @returns {boolean}
   */
  function isOpen() {
    return Boolean(pool);
  }

  /**
   * Exécute un script SQL (plusieurs instructions séparées par `;`).
   *
   * @param {string} sql
   * @returns {Promise<void>}
   */
  async function exec(sql) {
    await execOn(requirePool(), sql);
  }

  const { run, get, all } = bindQueryApi(requirePool);

  /**
   * Transaction sur une connexion dédiée du pool.
   *
   * @param {(tx: import('./persistenceContract').PersistenceTransaction) => Promise<*>} fn
   * @returns {Promise<*>}
   */
  async function transaction(fn) {
    const client = await requirePool().connect();
    try {
      await client.query("BEGIN");
      const tx = {
        exec: (sql) => execOn(client, sql),
        ...bindQueryApi(() => client)
      };
      const value = await fn(tx);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    engine: "postgres",
    open,
    close,
    isOpen,
    exec,
    run,
    get,
    all,
    transaction
  };
}

module.exports = {
  createPostgresPersistence
};
