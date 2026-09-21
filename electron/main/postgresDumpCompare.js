/**
 * Comparaison base actuelle ↔ dump PostgreSQL (base temporaire, live intacte).
 *
 * Liste, par table, les fiches qui disparaîtraient, qui reviendraient, ou qui
 * seraient écrasées. Pas de fusion / récupération ligne à ligne.
 *
 * @module electron/main/postgresDumpCompare
 */

const fs = require("fs");
const path = require("path");
const {
  METRICS,
  escapeHtml,
  formatFrDate,
  formatReportStampKey,
  wrapGtsReportHtml,
  createPgClient
} = require("./postgresRestoreDiff");
const { runPostgresAdminSql } = require("./postgresBackupOps");

const COMPARE_DB = "goron_gts_compare";
/** Plafond de sécurité si une table explose (évite un HTML de dizaines de Mo). */
const FILE_LIST_CAP = 10000;
const COMPARE_METRICS = METRICS.filter((metric) => metric.includeInCompare !== false);
const COMPARE_NOTE =
  "La base en service n'est pas modifiée. Ce rapport compare les identifiants (id) : les fiches « perdues » disparaîtraient, celles « qui reviendraient » réapparaîtraient, celles « écrasées » prendraient le contenu du dump. Il n'y a pas de récupération fiche par fiche ni de fusion automatique.";

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
    // La comparaison a déjà produit le rapport si on arrive ici en finally.
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
 * @param {Array<{ label: string }|{ liveLabel?: string, dumpLabel?: string }>} items
 * @param {"lost"|"recovered"|"changed"} kind
 * @returns {string}
 */
function renderSampleList(items, kind) {
  if (!items.length) return `<p class="muted">Aucune.</p>`;
  const shown = items.slice(0, FILE_LIST_CAP);
  const extra = items.length - shown.length;
  const lis = shown
    .map((item) => {
      if (kind === "changed") {
        const live = item.liveLabel || item.id;
        const dump = item.dumpLabel || item.id;
        return live === dump
          ? `<li>${escapeHtml(live)}</li>`
          : `<li>${escapeHtml(live)} → ${escapeHtml(dump)}</li>`;
      }
      return `<li>${escapeHtml(item.label || item.id)}</li>`;
    })
    .join("");
  const more = extra > 0 ? `<p class="muted">… et ${extra.toLocaleString("fr-FR")} autre(s).</p>` : "";
  return `<ul>${lis}</ul>${more}`;
}

const COMPARE_HTML_CSS = `
    body { padding: 12px 16px 20px; }
    .table-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 14px;
    }
    .table-tab {
      background: var(--surf);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      min-height: 2.5rem;
      padding: 4px 12px;
      cursor: pointer;
      font: inherit;
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
    }
    .table-tab:hover { background: var(--hover); }
    .table-tab.is-active {
      background: var(--accent);
      border-color: var(--accent);
    }
    .table-tab .tab-counts {
      font-size: 12px;
      color: var(--text-2);
    }
    .table-tab.is-active .tab-counts { color: #d6e6ff; }
    .table-panel[hidden] { display: none !important; }
    .diff-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      align-items: start;
    }
    .diff-col {
      background: var(--surf);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      min-width: 0;
    }
    .diff-col h3 { margin: 0 0 8px; font-size: 14px; }
    .diff-col ul {
      margin: 0;
      padding-left: 18px;
      max-height: calc(100vh - 320px);
      overflow: auto;
    }
    @media (max-width: 960px) {
      .diff-grid { grid-template-columns: 1fr; }
      .diff-col ul { max-height: 50vh; }
    }
`;

const COMPARE_HTML_SCRIPT = `document.addEventListener("click", function (event) {
  var btn = event.target.closest(".table-tab");
  if (!btn) return;
  var id = btn.getAttribute("data-table");
  document.querySelectorAll(".table-panel").forEach(function (el) {
    el.hidden = el.getAttribute("data-table") !== id;
  });
  document.querySelectorAll(".table-tab").forEach(function (el) {
    var on = el.getAttribute("data-table") === id;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-selected", on ? "true" : "false");
  });
});`;

/**
 * @param {object} options
 * @returns {string}
 */
function renderCompareHtml(options) {
  const { dumpFileName, actorLabel, generatedAt, tables, totals, schemaWarning } = options;
  const defaultTable =
    tables.find((table) => table.lost.length + table.recovered.length + table.changed.length > 0) || tables[0];
  const defaultId = defaultTable ? defaultTable.table : "";
  const pills = `<div class="summary">
    <div class="pill"><span>Fiches qui disparaîtraient</span><strong class="tone-down">${totals.lost.toLocaleString("fr-FR")}</strong></div>
    <div class="pill"><span>Fiches qui reviendraient</span><strong class="tone-up">${totals.recovered.toLocaleString("fr-FR")}</strong></div>
    <div class="pill"><span>Fiches qui seraient écrasées</span><strong class="tone-warn">${totals.changed.toLocaleString("fr-FR")}</strong></div>
  </div>`;
  const schemaNote = schemaWarning
    ? `<p class="warn">Beaucoup de fiches « écrasées » avec peu de créations / suppressions : le schéma du dump et celui de la base actuelle diffèrent probablement (colonnes ajoutées). Ces écarts de contenu sont alors peu fiables.</p>`
    : "";
  const tabs = `<div class="table-tabs" role="tablist" aria-label="Tables comparées">
    ${tables
      .map((table) => {
        const gap = table.lost.length + table.recovered.length + table.changed.length;
        const active = table.table === defaultId ? " is-active" : "";
        return `<button type="button" class="table-tab${active}" role="tab" data-table="${escapeHtml(table.table)}" aria-selected="${table.table === defaultId ? "true" : "false"}">
          <span>${escapeHtml(table.label)}</span>
          <span class="tab-counts">${gap.toLocaleString("fr-FR")} écart${gap > 1 ? "s" : ""} · ${table.lost.length.toLocaleString("fr-FR")} / ${table.recovered.length.toLocaleString("fr-FR")} / ${table.changed.length.toLocaleString("fr-FR")}</span>
        </button>`;
      })
      .join("")}
  </div>`;
  const sections = tables
    .map((table) => {
      const hidden = table.table === defaultId ? "" : " hidden";
      if (!table.lost.length && !table.recovered.length && !table.changed.length) {
        return `<section class="table-panel" data-table="${escapeHtml(table.table)}"${hidden}>
          <h2>${escapeHtml(table.label)}</h2>
          <p class="muted">Aucun écart d'identifiant.</p>
        </section>`;
      }
      return `<section class="table-panel" data-table="${escapeHtml(table.table)}"${hidden}>
        <h2>${escapeHtml(table.label)}</h2>
        <div class="diff-grid">
          <div class="diff-col">
            <h3 class="tone-down">Disparaîtraient (${table.lost.length.toLocaleString("fr-FR")})</h3>
            ${renderSampleList(table.lost, "lost")}
          </div>
          <div class="diff-col">
            <h3 class="tone-up">Reviendraient (${table.recovered.length.toLocaleString("fr-FR")})</h3>
            ${renderSampleList(table.recovered, "recovered")}
          </div>
          <div class="diff-col">
            <h3 class="tone-warn">Seraient écrasées (${table.changed.length.toLocaleString("fr-FR")})</h3>
            ${renderSampleList(table.changed, "changed")}
          </div>
        </div>
      </section>`;
    })
    .join("\n");
  return wrapGtsReportHtml({
    title: "Comparaison base actuelle ↔ dump",
    warnText: COMPARE_NOTE,
    wide: true,
    extraCss: COMPARE_HTML_CSS,
    extraScript: COMPARE_HTML_SCRIPT,
    bodyHtml: `<p class="meta">
      Dump : <strong>${escapeHtml(dumpFileName)}</strong><br />
      Acteur : ${escapeHtml(actorLabel)}<br />
      Rapport : ${escapeHtml(formatFrDate(generatedAt))}
    </p>
    ${pills}
    ${schemaNote}
    ${tabs}
    ${sections}
    <p class="note">Une seule table métier est affichée à la fois. Le journal d'actions n'est pas listé (codes techniques sans le détail de la fiche). Les totaux portent sur toutes les fiches affichées. Plafond de sécurité : ${FILE_LIST_CAP.toLocaleString("fr-FR")} lignes par liste. Pour récupérer une fiche précise, il faut la recréer à la main (ou restaurer tout le dump, au prix des fiches « perdues »).</p>`
  });
}

/**
 * @param {object} options
 * @param {object} options.cfg
 * @param {string} options.dumpPath
 * @param {string} options.actorLabel
 * @param {(database: string) => Promise<void>} options.restoreIntoDatabase
 * @returns {Promise<{ htmlPath: string, totals: { lost: number, recovered: number, changed: number }, schemaWarning: boolean, dumpFileName: string, generatedAt: string, tables: object[] }>}
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
    const stamp = new Date();
    const stampKey = formatReportStampKey(stamp);
    const parsed = path.parse(dumpPath);
    const base = path.join(parsed.dir, `${parsed.name}.comparaison-${stampKey}`);
    const htmlPath = `${base}.html`;
    const payload = {
      dumpFileName: parsed.base,
      actorLabel: options.actorLabel || "Système",
      generatedAt: stamp.toISOString(),
      tables,
      totals,
      schemaWarning
    };
    fs.writeFileSync(htmlPath, renderCompareHtml(payload), "utf8");
    return {
      htmlPath,
      totals,
      schemaWarning,
      dumpFileName: parsed.base,
      generatedAt: stamp.toISOString(),
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
