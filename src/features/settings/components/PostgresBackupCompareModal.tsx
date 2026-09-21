/**
 * Résultat de comparaison dump ↔ base actuelle, affiché dans l’application.
 *
 * Ouvert depuis `PostgresBackupPanel` dès « Comparer » (sans confirmation
 * intermédiaire). Les listes montrent des libellés métier (pas d’identifiants
 * techniques). Gabarit aligné sur « Sites en attente ».
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useModalEscape } from "../../common/hooks/useModalEscape";
import type { PostgresCompareResult, PostgresCompareTable } from "../../../infrastructure/api/gtsApi.types";

type PostgresBackupCompareModalProps = {
  isOpen: boolean;
  result: PostgresCompareResult | null;
  loading: boolean;
  dumpLabel: string;
  restoreDisabled?: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
  onRestore: () => void;
};

/**
 * @param count - Effectif
 */
function formatCount(count: number): string {
  return count.toLocaleString("fr-FR");
}

/**
 * @param iso - Horodatage ISO
 */
function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR");
}

/**
 * @param table - Bloc d’une table métier
 */
function tableGap(table: PostgresCompareTable): number {
  return table.counts.lost + table.counts.recovered + table.counts.changed;
}

/**
 * @param items - Lignes affichées
 * @param total - Effectif réel
 */
function extraCount(items: unknown[], total: number): number {
  return Math.max(0, total - items.length);
}

export function PostgresBackupCompareModal({
  isOpen,
  result,
  loading,
  dumpLabel,
  restoreDisabled = false,
  closeDisabled = false,
  onClose,
  onRestore
}: PostgresBackupCompareModalProps) {
  const tables = result?.tables ?? [];
  const defaultKey = useMemo(() => {
    const withGap = tables.find((table) => tableGap(table) > 0);
    return withGap?.key ?? tables[0]?.key ?? "";
  }, [tables]);
  const [activeKey, setActiveKey] = useState(defaultKey);
  useEffect(() => {
    setActiveKey(defaultKey);
  }, [defaultKey]);
  const selectedKey = tables.some((table) => table.key === activeKey) ? activeKey : defaultKey;
  const selected = tables.find((table) => table.key === selectedKey) ?? null;
  const totals = result?.totals ?? { lost: 0, recovered: 0, changed: 0 };

  useModalEscape(isOpen && !loading && !closeDisabled, onClose);
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => (!loading && !closeDisabled ? onClose() : undefined)}>
      <section
        className="modal postgres-backup-compare-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="postgres-backup-compare-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mc-modal-head">
          <h3 id="postgres-backup-compare-title" className="mc-modal-title">
            Comparaison avec la base actuelle
          </h3>
          <button
            type="button"
            className="mc-modal-close"
            aria-label="Fermer"
            disabled={loading || closeDisabled}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="muted postgres-backup-compare-modal__meta">
          Dump : <strong>{dumpLabel || result?.dumpFileName || result?.fileName || "—"}</strong>
          {!loading && formatGeneratedAt(result?.generatedAt) ? ` — ${formatGeneratedAt(result?.generatedAt)}` : ""}
        </p>
        {loading ? (
          <div className="postgres-backup-compare-modal__loading" role="status" aria-live="polite">
            <Loader2 size={20} className="login-spinner" aria-hidden />
            <span>Comparaison en cours… La base en service n&apos;est pas modifiée.</span>
          </div>
        ) : (
          <>
            <p className="muted postgres-backup-compare-modal__hint">
              La base en service n&apos;est pas modifiée. Les fiches « perdues » disparaîtraient, celles « qui
              reviendraient » réapparaîtraient, celles « écrasées » prendraient le contenu du dump. Pas de fusion
              automatique.
            </p>
            <div className="postgres-backup-compare-modal__pills" role="status">
              <div className="postgres-backup-compare-modal__pill">
                <span>Disparaîtraient</span>
                <strong className="postgres-backup-compare-modal__tone-down">{formatCount(totals.lost)}</strong>
              </div>
              <div className="postgres-backup-compare-modal__pill">
                <span>Reviendraient</span>
                <strong className="postgres-backup-compare-modal__tone-up">{formatCount(totals.recovered)}</strong>
              </div>
              <div className="postgres-backup-compare-modal__pill">
                <span>Seraient écrasées</span>
                <strong className="postgres-backup-compare-modal__tone-warn">{formatCount(totals.changed)}</strong>
              </div>
            </div>
            {result?.schemaWarning ? (
              <p className="postgres-config-warn">
                Beaucoup de fiches « écrasées » avec peu de créations / suppressions : le schéma du dump et celui de la
                base actuelle diffèrent probablement. Ces écarts de contenu sont alors peu fiables.
              </p>
            ) : null}
            <div className="postgres-backup-compare-modal__tabs" role="tablist" aria-label="Tables comparées">
              {tables.map((table) => {
                const gap = tableGap(table);
                const selectedTab = table.key === selectedKey;
                return (
                  <button
                    key={table.key}
                    type="button"
                    role="tab"
                    aria-selected={selectedTab}
                    className={
                      selectedTab ? "postgres-backup-compare-modal__tab is-active" : "postgres-backup-compare-modal__tab"
                    }
                    onClick={() => setActiveKey(table.key)}
                  >
                    <span>{table.label}</span>
                    <span className="postgres-backup-compare-modal__tab-counts">
                      {formatCount(gap)} écart{gap > 1 ? "s" : ""} · {formatCount(table.counts.lost)} /{" "}
                      {formatCount(table.counts.recovered)} / {formatCount(table.counts.changed)}
                    </span>
                  </button>
                );
              })}
            </div>
            {selected ? (
              <div className="postgres-backup-compare-modal__grid">
                <DiffColumn
                  title={`Disparaîtraient (${formatCount(selected.counts.lost)})`}
                  tone="down"
                  items={selected.lost.map((row) => row.label || "—")}
                  extra={extraCount(selected.lost, selected.counts.lost)}
                />
                <DiffColumn
                  title={`Reviendraient (${formatCount(selected.counts.recovered)})`}
                  tone="up"
                  items={selected.recovered.map((row) => row.label || "—")}
                  extra={extraCount(selected.recovered, selected.counts.recovered)}
                />
                <DiffColumn
                  title={`Seraient écrasées (${formatCount(selected.counts.changed)})`}
                  tone="warn"
                  items={selected.changed.map((row) => {
                    const live = row.liveLabel || "—";
                    const dump = row.dumpLabel || "—";
                    return live === dump ? live : `${live} → ${dump}`;
                  })}
                  extra={extraCount(selected.changed, selected.counts.changed)}
                />
              </div>
            ) : (
              <p className="muted">Aucun écart à afficher.</p>
            )}
          </>
        )}
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={onClose} disabled={loading || closeDisabled}>
            Fermer
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={loading || restoreDisabled || !result}
            onClick={onRestore}
          >
            Restaurer
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * @param props.title - En-tête de colonne
 * @param props.tone - Couleur du titre
 * @param props.items - Libellés métier
 * @param props.extra - Lignes non listées (plafond)
 */
function DiffColumn({
  title,
  tone,
  items,
  extra
}: {
  title: string;
  tone: "down" | "up" | "warn";
  items: string[];
  extra: number;
}) {
  return (
    <section className="postgres-backup-compare-modal__col">
      <h4 className={`postgres-backup-compare-modal__tone-${tone}`}>{title}</h4>
      <div className="postgres-backup-compare-modal__col-scroll app-scrollbar">
        {items.length ? (
          <ul>
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucune.</p>
        )}
        {extra > 0 ? <p className="muted">… et {formatCount(extra)} autre(s).</p> : null}
      </div>
    </section>
  );
}
