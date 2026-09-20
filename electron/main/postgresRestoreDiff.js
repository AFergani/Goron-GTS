/**
 * Snapshot métier avant / après restauration PostgreSQL, puis rapport HTML.
 *
 * Compare les volumes (effectifs) et, si possible, la plage de dates.
 * Ce n'est pas un diff ligne à ligne du dump.
 *
 * @module electron/main/postgresRestoreDiff
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

/** Tables métier suivies (identifiants SQL figés, jamais interpolés depuis l'UI). */
const METRICS = [
  {
    table: "users",
    label: "Comptes utilisateurs",
    dateColumn: "created_at",
    labelSql: "COALESCE(full_name,'') || ' (' || COALESCE(username,'') || ')'"
  },
  {
    table: "data_sites",
    label: "Sites",
    dateColumn: "created_at",
    labelSql: "COALESCE(code,'') || ' — ' || COALESCE(name,'')"
  },
  {
    table: "data_intervenants",
    label: "Intervenants",
    dateColumn: "created_at",
    labelSql: "COALESCE(name,'')"
  },
  {
    table: "data_anomaly_types",
    label: "Types d'anomalie",
    dateColumn: "created_at",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "data_holidays",
    label: "Jours fériés",
    dateColumn: "date_iso",
    labelSql: "COALESCE(date_iso,'') || ' — ' || COALESCE(label,'')"
  },
  {
    table: "data_ronde_motif_types",
    label: "Motifs de ronde",
    dateColumn: "created_at",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "data_ronde_planned_profiles",
    label: "Profils de ronde contractuelle",
    dateColumn: "created_at",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "main_courante_entries",
    label: "Main courante",
    dateColumn: "created_at",
    labelSql: "COALESCE(site_display,'') || ' — ' || left(COALESCE(information,''), 90)"
  },
  {
    table: "intervention_entries",
    label: "Interventions",
    dateColumn: "created_at",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(request_date,'') || ' ' || COALESCE(request_time,'')"
  },
  {
    table: "ronde_entries",
    label: "Rondes",
    dateColumn: "created_at",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(created_at,'')"
  },
  {
    table: "gardiennage_entries",
    label: "Gardiennages",
    dateColumn: "created_at",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(intervenant_name,'')"
  },
  {
    table: "fransor_accompagnements",
    label: "Fransor — accompagnements",
    dateColumn: "date",
    labelSql: "COALESCE(date,'') || ' — responsable ' || COALESCE(responsable_id,'')"
  },
  {
    table: "fransor_closures",
    label: "Fransor — clôtures",
    dateColumn: "start_date",
    labelSql: "COALESCE(label,'') || ' (' || COALESCE(start_date,'') || ' → ' || COALESCE(end_date,'') || ')'"
  },
  {
    table: "audit_logs",
    label: "Journal d'actions",
    dateColumn: "occurred_at",
    labelSql: "COALESCE(occurred_at,'') || ' — ' || COALESCE(action,'')",
    includeInCompare: false
  }
];

/**
 * Client `pg` vers une base (snapshot restauration / comparaison).
 *
 * @param {object} cfg
 * @param {string} [database]
 * @returns {import('pg').Client}
 */
function createPgClient(cfg, database) {
  return new Client({
    host: cfg.host,
    port: cfg.port,
    database: String(database || cfg.database || "").trim() || cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis || 2500
  });
}

/**
 * Echappe le HTML des rapports (restauration / comparaison).
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Date/heure FR pour les rapports HTML (JJ/MM/AAAA HH:mm).
 *
 * @param {unknown} iso
 * @returns {string}
 */
function formatFrDate(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "—";
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw.length >= 10 ? raw.slice(0, 10).split("-").reverse().join("/") : raw;
  }
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Effectifs (et plage de dates) des tables métier, pour le rapport post-restauration.
 *
 * @param {object} cfg
 * @returns {Promise<{ capturedAt: string, error: string|null, rows: Array<object> }>}
 */
async function captureRestoreSnapshot(cfg) {
  const capturedAt = new Date().toISOString();
  const client = createPgClient(cfg);
  try {
    await client.connect();
  } catch (error) {
    return {
      capturedAt,
      error: error instanceof Error ? error.message : String(error || "Connexion impossible."),
      rows: METRICS.map((metric) => ({
        table: metric.table,
        label: metric.label,
        count: null,
        dateMin: null,
        dateMax: null
      }))
    };
  }

  const rows = [];
  try {
    for (const metric of METRICS) {
      try {
        const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM ${metric.table}`);
        let dateMin = null;
        let dateMax = null;
        if (metric.dateColumn) {
          const span = await client.query(
            `SELECT MIN(${metric.dateColumn}) AS dmin, MAX(${metric.dateColumn}) AS dmax FROM ${metric.table}`
          );
          dateMin = span.rows[0]?.dmin || null;
          dateMax = span.rows[0]?.dmax || null;
        }
        rows.push({
          table: metric.table,
          label: metric.label,
          count: Number(countRes.rows[0]?.n || 0),
          dateMin,
          dateMax
        });
      } catch {
        rows.push({
          table: metric.table,
          label: metric.label,
          count: null,
          dateMin: null,
          dateMax: null
        });
      }
    }
    return { capturedAt, error: null, rows };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * @param {number|null} n
 * @returns {string}
 */
function formatCount(n) {
  if (n == null || Number.isNaN(Number(n))) return "indisponible";
  return Number(n).toLocaleString("fr-FR");
}

/**
 * @param {object} beforeRow
 * @param {object} afterRow
 * @returns {{ label: string, before: string, after: string, delta: string, tone: string }}
 */
function diffRow(beforeRow, afterRow) {
  const beforeCount = beforeRow?.count;
  const afterCount = afterRow?.count;
  let delta = "—";
  let tone = "na";
  if (beforeCount != null && afterCount != null) {
    const gap = afterCount - beforeCount;
    if (gap === 0) {
      delta = "identique";
      tone = "same";
    } else if (gap > 0) {
      delta = `${gap.toLocaleString("fr-FR")} de plus`;
      tone = "up";
    } else {
      delta = `${Math.abs(gap).toLocaleString("fr-FR")} de moins`;
      tone = "down";
    }
  }
  const span = (row) => {
    if (!row || row.count == null) return formatCount(row?.count);
    if (row.dateMin || row.dateMax) {
      return `${formatCount(row.count)} (${formatFrDate(row.dateMin)} → ${formatFrDate(row.dateMax)})`;
    }
    return formatCount(row.count);
  };
  return {
    label: afterRow?.label || beforeRow?.label || "",
    before: span(beforeRow),
    after: span(afterRow),
    delta,
    tone
  };
}

/**
 * @param {object} before
 * @param {object} after
 * @returns {Array<object>}
 */
function buildDiffRows(before, after) {
  const afterByTable = new Map((after?.rows || []).map((row) => [row.table, row]));
  const beforeByTable = new Map((before?.rows || []).map((row) => [row.table, row]));
  const tables = METRICS.map((metric) => metric.table);
  return tables.map((table) => diffRow(beforeByTable.get(table), afterByTable.get(table)));
}

const LIMITATION_NOTE =
  "Impossible de récupérer le contenu des fiches perdues. Ce rapport indique seulement, par type de donnée, combien d'enregistrements ont disparu ou ont été ajoutés (volumes avant / après). Ce n'est pas un détail ligne à ligne.";

const GTS_REPORT_STYLES = `
    :root {
      --bg: #070f22;
      --surf: #0b1730;
      --card: #0e1e3d;
      --hover: #12264d;
      --border: #2b4774;
      --text: #e7f0fb;
      --text-2: #a8c1df;
      --accent: #1f5fcf;
      --ok: #1fb68b;
      --err: #e06262;
    }
    * { box-sizing: border-box; }
    html, body { background: var(--bg); color: var(--text); }
    body {
      margin: 0;
      padding: 28px 20px 40px;
      font-family: "Segoe UI", system-ui, sans-serif;
    }
    .wrap {
      max-width: 1080px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px 26px 22px;
    }
    .brand {
      margin: 0 0 6px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-2);
    }
    h1 {
      font-size: 22px;
      font-weight: 650;
      margin: 0 0 14px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--accent);
    }
    p, td, th { font-size: 14px; line-height: 1.45; }
    .meta { color: var(--text-2); margin: 0 0 16px; }
    .meta strong { color: var(--text); font-weight: 650; }
    .warn {
      margin: 0 0 18px;
      padding: 10px 12px;
      background: var(--surf);
      border: 1px solid var(--border);
      border-left: 3px solid var(--err);
      border-radius: 6px;
      color: var(--text);
    }
    table { border-collapse: collapse; width: 100%; background: var(--surf); }
    th, td { border: 1px solid var(--border); padding: 9px 11px; text-align: left; }
    th { background: var(--hover); color: var(--text); font-weight: 650; }
    tbody tr:nth-child(even) { background: rgba(18, 38, 77, 0.45); }
    .tone-up td:last-child { color: var(--ok); font-weight: 650; }
    .tone-down td:last-child { color: var(--err); font-weight: 650; }
    .tone-same td:last-child { color: var(--text-2); }
    .tone-warn { color: #e0b44a; font-weight: 650; }
    .note { margin: 16px 0 0; color: var(--text-2); }
    h2 { font-size: 16px; margin: 22px 0 8px; }
    ul { margin: 4px 0 10px; padding-left: 18px; }
    .muted { color: var(--text-2); }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
    .pill {
      background: var(--surf);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      min-width: 140px;
    }
    .pill span { display: block; color: var(--text-2); font-size: 12px; }
    .pill strong { display: block; font-size: 18px; margin-top: 2px; }
    .wrap--wide {
      max-width: none;
      width: 100%;
      margin: 0;
      border-radius: 0;
      min-height: calc(100vh - 32px);
    }
`;

/**
 * @param {{ title: string, warnText?: string, bodyHtml: string, wide?: boolean, extraCss?: string, extraScript?: string }} options
 * @returns {string}
 */
function wrapGtsReportHtml(options) {
  const title = options.title || "Rapport Goron GTS";
  const warn = options.warnText ? `<p class="warn">${escapeHtml(options.warnText)}</p>` : "";
  const wrapClass = options.wide ? "wrap wrap--wide" : "wrap";
  const extraCss = options.extraCss || "";
  const extraScript = options.extraScript ? `<script>\n${options.extraScript}\n</script>` : "";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(title)}</title>
  <style>
${GTS_REPORT_STYLES}
${extraCss}
  </style>
</head>
<body>
  <div class="${wrapClass}">
    <p class="brand">Goron GTS</p>
    <h1>${escapeHtml(title)}</h1>
    ${warn}
    ${options.bodyHtml || ""}
  </div>
  ${extraScript}
</body>
</html>
`;
}

/**
 * @param {object} options
 * @returns {string}
 */
function renderHtml(options) {
  const { dumpFileName, actorLabel, generatedAt, before, after, rows } = options;
  const body = rows
    .map(
      (row) => `<tr class="tone-${escapeHtml(row.tone)}">
  <td>${escapeHtml(row.label)}</td>
  <td>${escapeHtml(row.before)}</td>
  <td>${escapeHtml(row.after)}</td>
  <td>${escapeHtml(row.delta)}</td>
</tr>`
    )
    .join("\n");
  return wrapGtsReportHtml({
    title: "Écarts après restauration PostgreSQL",
    warnText: LIMITATION_NOTE,
    bodyHtml: `<p class="meta">
      Dump : <strong>${escapeHtml(dumpFileName)}</strong><br />
      Acteur : ${escapeHtml(actorLabel)}<br />
      Rapport : ${escapeHtml(formatFrDate(generatedAt))}<br />
      Snapshot avant : ${escapeHtml(formatFrDate(before?.capturedAt))}${before?.error ? ` — ${escapeHtml(before.error)}` : ""}<br />
      Snapshot après : ${escapeHtml(formatFrDate(after?.capturedAt))}${after?.error ? ` — ${escapeHtml(after.error)}` : ""}
    </p>
    <table>
      <thead>
        <tr><th>Donnée</th><th>Avant restauration</th><th>Après restauration</th><th>Écart</th></tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>
    <p class="note">« De moins » = entrées présentes avant la restauration et absentes ensuite. Le libellé des fiches perdues n’est pas disponible.</p>`
  });
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function formatReportStampKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Écrit le rapport HTML à côté du dump restauré.
 *
 * @param {object} options
 * @param {string} options.dumpPath
 * @param {string} options.actorLabel
 * @param {object} options.before
 * @param {object} options.after
 * @returns {{ htmlPath: string }}
 */
function writeRestoreDiffReports(options) {
  const dumpPath = path.resolve(String(options.dumpPath || ""));
  const stamp = new Date();
  const stampKey = formatReportStampKey(stamp);
  const parsed = path.parse(dumpPath);
  const htmlPath = path.join(parsed.dir, `${parsed.name}.ecarts-restauration-${stampKey}.html`);
  const payload = {
    dumpFileName: parsed.base,
    actorLabel: options.actorLabel || "Système",
    generatedAt: stamp.toISOString(),
    before: options.before,
    after: options.after,
    rows: buildDiffRows(options.before, options.after)
  };
  fs.writeFileSync(htmlPath, renderHtml(payload), "utf8");
  return { htmlPath };
}

module.exports = {
  METRICS,
  escapeHtml,
  formatFrDate,
  formatReportStampKey,
  wrapGtsReportHtml,
  createPgClient,
  captureRestoreSnapshot,
  writeRestoreDiffReports
};
