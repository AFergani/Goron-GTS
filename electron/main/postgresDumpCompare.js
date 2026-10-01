/**
 * Comparaison base actuelle ↔ dump PostgreSQL (base temporaire, live intacte).
 *
 * Liste, par table, les fiches qui disparaîtraient, qui reviendraient, ou qui
 * seraient écrasées. Pas de fusion / récupération ligne à ligne.
 *
 * @module electron/main/postgresDumpCompare
 */

const path = require("path");
const { METRICS, createPgClient } = require("./postgresRestoreDiff");
const { runPostgresAdminSql } = require("./postgresBackupOps");

const COMPARE_DB = "goron_gts_compare";
/** Plafond de sécurité si une table explose (évite un envoi IPC trop lourd). */
const FILE_LIST_CAP = 10000;
const COMPARE_METRICS = METRICS.filter((metric) => metric.includeInCompare !== false);

/**
 * Identifiant SQL figé (jamais interpolé depuis l'UI).
 *
 * @param {string} name
 * @returns {string}
 */
function quoteIdent(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error("Identifiant PostgreSQL invalide.");
  }
  return `"${name}"`;
}

/**
 * Littéral SQL d'un identifiant déjà validé (datname, etc.).
 *
 * @param {string} name
 * @returns {string}
 */
function quoteLiteral(name) {
  quoteIdent(name);
  return `'${name}'`;
}

/**
 * Coupe les sessions sur la base temporaire (best-effort).
 *
 * @param {object} cfg
 * @param {string} databaseName
 * @returns {Promise<void>}
 */
async function terminateCompareBackends(cfg, databaseName) {
  try {
    await runPostgresAdminSql(
      cfg,
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteLiteral(databaseName)} AND pid <> pg_backend_pid()`
    );
  } catch {
    // Rien à couper, ou droit insuffisant : le DROP tentera ensuite.
  }
}

/**
 * Recrée `goron_gts_compare` (vide) sans toucher à la base en service.
 *
 * @param {object} cfg
 * @returns {Promise<void>}
 */
async function recreateCompareDatabase(cfg) {
  if (String(cfg.database || "") === COMPARE_DB) {
    throw new Error("La base en service porte le nom réservé à la comparaison. Impossible de continuer.");
  }
  const db = quoteIdent(COMPARE_DB);
  const owner = quoteIdent(String(cfg.user || "").trim());
  try {
    await terminateCompareBackends(cfg, COMPARE_DB);
    await runPostgresAdminSql(cfg, `DROP DATABASE IF EXISTS ${db}`);
    await runPostgresAdminSql(cfg, `CREATE DATABASE ${db} OWNER ${owner}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/permission denied|must be owner|CREATEDB/i.test(message)) {
      throw new Error(
        "Le compte technique n'a pas le droit de créer une base temporaire (CREATEDB). Sur Docker labo, démarrez le conteneur PostgreSQL (goron-pg18) ; sur un PostgreSQL d'exploitation, accordez CREATEDB ou lancez la comparaison depuis le PC hôte."
      );
    }
    throw new Error(message || "Impossible de préparer la base temporaire de comparaison.");
  }
}

/**
 * Supprime la base temporaire après comparaison (best-effort).
 *
 * @param {object} cfg
 * @returns {Promise<void>}
 */
async function dropCompareDatabase(cfg) {
  try {
    await terminateCompareBackends(cfg, COMPARE_DB);
    await runPostgresAdminSql(cfg, `DROP DATABASE IF EXISTS ${quoteIdent(COMPARE_DB)}`);
  } catch {
    // La comparaison est déjà renvoyée à l'application si on arrive ici en finally.
  }
}

/**
 * Indexe les identifiants d'une table métier pour le diff live ↔ dump.
 *
 * @param {import('pg').Client} client
 * @param {object} metric
 * @returns {Promise<Map<string, { id: string, label: string, hash: string }>>}
 */
async function loadIndex(client, metric) {
  const res = await client.query(
    `SELECT id::text AS id, (${metric.labelSql}) AS label, md5(t::text) AS row_hash FROM ${metric.table} t`
  );
  const map = new Map();
  for (const row of res.rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    map.set(id, {
      id,
      label: String(row.label || "").trim() || id,
      hash: String(row.row_hash || "")
    });
  }
  return map;
}

/**
 * @param {Map<string, { id: string, label: string, hash: string }>} liveMap
 * @param {Map<string, { id: string, label: string, hash: string }>} dumpMap
 */
function diffMaps(liveMap, dumpMap) {
  const lost = [];
  const recovered = [];
  const changed = [];
  for (const [id, live] of liveMap) {
    const dump = dumpMap.get(id);
    if (!dump) {
      lost.push(live);
    } else if (live.hash && dump.hash && live.hash !== dump.hash) {
      changed.push({
        id,
        liveLabel: live.label,
        dumpLabel: dump.label
      });
    }
  }
  for (const [id, dump] of dumpMap) {
    if (!liveMap.has(id)) recovered.push(dump);
  }
  return { lost, recovered, changed };
}

/**
 * Compare le dump à la base actuelle et renvoie le résultat pour la fenêtre de l'application.
 * Aucun fichier HTML n'est écrit.
 *
 * @param {object} options
 * @param {object} options.cfg
 * @param {string} options.dumpPath
 * @param {string} options.actorLabel
 * @param {(database: string) => Promise<void>} options.restoreIntoDatabase
 * @returns {Promise<{ totals: { lost: number, recovered: number, changed: number }, schemaWarning: boolean, dumpFileName: string, generatedAt: string, tables: object[] }>}
 */
async function runDumpCompare(options) {
  const cfg = options.cfg;
  const dumpPath = path.resolve(String(options.dumpPath || ""));
  await recreateCompareDatabase(cfg);
  const live = createPgClient(cfg, cfg.database);
  const dump = createPgClient(cfg, COMPARE_DB);
  try {
    await options.restoreIntoDatabase(COMPARE_DB);
    await live.connect();
    await dump.connect();
    const tables = [];
    const totals = { lost: 0, recovered: 0, changed: 0 };
    for (const metric of COMPARE_METRICS) {
      try {
        const [liveMap, dumpMap] = await Promise.all([loadIndex(live, metric), loadIndex(dump, metric)]);
        const diff = diffMaps(liveMap, dumpMap);
        totals.lost += diff.lost.length;
        totals.recovered += diff.recovered.length;
        totals.changed += diff.changed.length;
        tables.push({
          table: metric.table,
          label: metric.label,
          ...diff
        });
      } catch {
        tables.push({
          table: metric.table,
          label: metric.label,
          lost: [],
          recovered: [],
          changed: []
        });
      }
    }
    const schemaWarning =
      totals.changed > 40 && totals.lost + totals.recovered < Math.max(8, Math.floor(totals.changed / 10));
    const parsed = path.parse(dumpPath);
    return {
      totals,
      schemaWarning,
      dumpFileName: parsed.base,
      generatedAt: new Date().toISOString(),
      tables: tables.map((table) => ({
        key: table.table,
        label: table.label,
        counts: {
          lost: table.lost.length,
          recovered: table.recovered.length,
          changed: table.changed.length
        },
        lost: table.lost.slice(0, FILE_LIST_CAP).map((item) => ({ label: String(item.label || "").trim() })),
        recovered: table.recovered.slice(0, FILE_LIST_CAP).map((item) => ({ label: String(item.label || "").trim() })),
        changed: table.changed.slice(0, FILE_LIST_CAP).map((item) => ({
          liveLabel: String(item.liveLabel || "").trim(),
          dumpLabel: String(item.dumpLabel || "").trim()
        }))
      }))
    };
  } finally {
    await live.end().catch(() => {});
    await dump.end().catch(() => {});
    await dropCompareDatabase(cfg);
  }
}

module.exports = {
  runDumpCompare
};
