/**
 * Tables métier et helpers partagés pour la comparaison dump ↔ base actuelle.
 *
 * Utilisé par `postgresDumpCompare.js` (indexation, rapport HTML d’archive).
 *
 * @module electron/main/postgresRestoreDiff
 */

const { Client } = require("pg");

/** Tables métier suivies (identifiants SQL figés, jamais interpolés depuis l'UI). */
const METRICS = [
  {
    table: "users",
    label: "Comptes utilisateurs",
    labelSql: "COALESCE(full_name,'') || ' (' || COALESCE(username,'') || ')'"
  },
  {
    table: "data_sites",
    label: "Sites",
    labelSql: "COALESCE(code,'') || ' — ' || COALESCE(name,'')"
  },
  {
    table: "data_intervenants",
    label: "Intervenants",
    labelSql: "COALESCE(name,'')"
  },
  {
    table: "data_anomaly_types",
    label: "Types d'anomalie",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "data_holidays",
    label: "Jours fériés",
    labelSql: "COALESCE(date_iso,'') || ' — ' || COALESCE(label,'')"
  },
  {
    table: "data_ronde_motif_types",
    label: "Motifs de ronde",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "data_ronde_planned_profiles",
    label: "Profils de ronde contractuelle",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "main_courante_entries",
    label: "Main courante",
    labelSql: "COALESCE(site_display,'') || ' — ' || left(COALESCE(information,''), 90)"
  },
  {
    table: "intervention_entries",
    label: "Interventions",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(request_date,'') || ' ' || COALESCE(request_time,'')"
  },
  {
    table: "ronde_entries",
    label: "Rondes",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(created_at,'')"
  },
  {
    table: "gardiennage_entries",
    label: "Gardiennages",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(intervenant_name,'')"
  },
  {
    table: "fransor_accompagnements",
    label: "Fransor — accompagnements",
    labelSql: "COALESCE(date,'') || ' — responsable ' || COALESCE(responsable_id,'')"
  },
  {
    table: "fransor_closures",
    label: "Fransor — clôtures",
    labelSql: "COALESCE(label,'') || ' (' || COALESCE(start_date,'') || ' → ' || COALESCE(end_date,'') || ')'"
  },
  {
    table: "audit_logs",
    label: "Journal d'actions",
    labelSql: "COALESCE(occurred_at,'') || ' — ' || COALESCE(action,'')",
    includeInCompare: false
  }
];

/**
 * Client `pg` vers une base (comparaison dump / live).
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
 * Echappe le HTML des rapports de comparaison.
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
    p { font-size: 14px; line-height: 1.45; }
    .meta { color: var(--text-2); margin: 0 0 16px; }
    .meta strong { color: var(--text); font-weight: 650; }
    .warn {
      margin: 0 0 18px;
      padding: 10px 12px;
      background: var(--surf);
      border: 1px solid var(--border);
      border-left: 3px solid #e06262;
      border-radius: 6px;
      color: var(--text);
    }
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
 * @param {Date} [date]
 * @returns {string}
 */
function formatReportStampKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}`;
}

module.exports = {
  METRICS,
  escapeHtml,
  formatFrDate,
  formatReportStampKey,
  wrapGtsReportHtml,
  createPgClient
};
