/**
 * Tableau des logs techniques (`error_logs`) — même présentation que le journal d’actions.
 */

export type TechErrorLogRow = {
  occurredAt: string;
  source: string;
  code: string;
  codeLabel: string;
  messageFr: string;
  details: Record<string, unknown> | null;
};

/**
 * Famille affichée en badge (colonne alignée sur « Famille » du journal métier).
 *
 * @param code - Code technique (`PG_LAB_*`, etc.).
 * @param source - Canal / source (`system:postgresLab`, …).
 */
function resolveTechFamily(code: string, source: string): string {
  const c = String(code || "").toUpperCase();
  const s = String(source || "").toLowerCase();
  if (c.startsWith("PG_LAB_") || c.startsWith("AUDIT_PG_") || c.startsWith("REF_PG_") || s.includes("postgres"))
    return "PostgreSQL";
  if (s.startsWith("auth:") || c.startsWith("AUTH_")) return "Auth";
  if (s.startsWith("data:") || c.startsWith("DATA_")) return "Données";
  return "Système";
}

function techFamilyBadgeTone(family: string): string {
  const normalized = family.trim().toLowerCase();
  if (normalized === "postgresql") return "postgres";
  if (normalized === "auth") return "users";
  if (normalized === "données" || normalized === "donnees") return "data";
  return "system";
}

/**
 * Ton du statut : reconnexion = ok, perte / sync KO = erreur, reste = info.
 * Les codes `*_FALLBACK` / `*_CATCHUP_OK` ne sont plus émis (historique dual-write).
 */
function getTechStatusTone(code: string): "ok" | "error" | "warn" {
  const c = String(code || "").toUpperCase();
  if (c === "PG_LAB_CONNECTION_RESTORED" || c === "AUDIT_PG_CATCHUP_OK" || c === "REF_PG_CATCHUP_OK") return "ok";
  if (
    c === "PG_LAB_CONNECTION_LOST" ||
    c === "PG_LAB_UNREACHABLE" ||
    c === "AUDIT_PG_COPY_FAILED" ||
    c === "REF_PG_COPY_FAILED" ||
    c === "PG_UNAVAILABLE"
  )
    return "error";
  if (c === "AUDIT_PG_WRITE_FALLBACK" || c === "REF_PG_WRITE_FALLBACK") return "warn";
  return "warn";
}

function formatTechStatusLabel(tone: "ok" | "error" | "warn"): string {
  if (tone === "ok") return "Rétabli";
  if (tone === "error") return "Incident";
  return "Info";
}

function formatDetailsTooltip(details: Record<string, unknown> | null): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const host = details.host != null ? String(details.host) : "";
  const port = details.port != null ? String(details.port) : "";
  const database = details.database != null ? String(details.database) : "";
  const err = details.error != null ? String(details.error) : "";
  const copied = details.copied != null ? String(details.copied) : "";
  const originLabel = details.originLabel != null ? String(details.originLabel) : "";
  const destinationLabel = details.destinationLabel != null ? String(details.destinationLabel) : "";
  const lines = [
    host || port ? `Hôte: ${host}${port ? `:${port}` : ""}` : "",
    database ? `Base: ${database}` : "",
    err ? `Erreur: ${err}` : "",
    copied ? `Lignes rattrapées: ${copied}` : "",
    originLabel ? `Origine: ${originLabel}` : "",
    destinationLabel ? `Destination: ${destinationLabel}` : ""
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : undefined;
}

/**
 * Texte événement sans code technique (ex. `DATA_SITE_EXISTS`).
 * Affiche le message métier français ; le libellé court sert seulement de repli.
 *
 * @param log - Ligne log technique.
 */
function formatTechEventText(log: TechErrorLogRow): string {
  const message = String(log.messageFr || "").trim();
  if (message) return message;
  const label = String(log.codeLabel || "").trim();
  return label || "Événement technique";
}

/**
 * @param props.logs - Entrées déjà triées (plus récentes d'abord).
 */
export function TechErrorLogsTable({ logs }: { logs: TechErrorLogRow[] }) {
  if (!logs.length) {
    return <p className="muted">Aucun log technique pour le moment.</p>;
  }

  return (
    <table className="audit-logs-table audit-logs-table--tech">
      <colgroup>
        <col className="audit-col-date" />
        <col className="audit-col-family" />
        <col className="audit-col-data" />
        <col className="audit-col-status" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Famille</th>
          <th>Événement</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log, index) => {
          const family = resolveTechFamily(log.code, log.source);
          const tone = techFamilyBadgeTone(family);
          const statusTone = getTechStatusTone(log.code);
          const statusLabel = formatTechStatusLabel(statusTone);
          const statusIcon = statusTone === "error" ? "!" : statusTone === "warn" ? "…" : "✓";
          const detailTip = formatDetailsTooltip(log.details);
          const eventText = formatTechEventText(log);

          return (
            <tr key={`${log.occurredAt}-${log.code}-${index}`}>
              <td className="audit-cell-date">{log.occurredAt ? new Date(log.occurredAt).toLocaleString("fr-FR") : "—"}</td>
              <td className="audit-cell-family">
                <span className="audit-family-cell">
                  <span className={`audit-page-badge audit-page-badge--${tone}`}>{family}</span>
                </span>
              </td>
              <td className="audit-cell-data" title={detailTip || eventText}>
                <span className="audit-action-text">{eventText}</span>
              </td>
              <td className="audit-cell-status">
                <span
                  className={`audit-status-check audit-status-check--${statusTone}`}
                  title={statusLabel}
                  aria-label={statusLabel}
                >
                  {statusIcon}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
