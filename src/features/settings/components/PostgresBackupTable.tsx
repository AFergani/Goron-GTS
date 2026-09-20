/**
 * Tableau des dumps PostgreSQL : tri Date / Type, actions Comparer et Restaurer.
 */

import type { PostgresBackupFile } from "../../../infrastructure/api/gtsApiClient";
import { backupKindLabel, formatBackupWhen } from "../model/postgresBackupDisplay";

export type BackupSortKey = "date" | "type";

type PostgresBackupTableProps = {
  files: PostgresBackupFile[];
  emptyMessage: string;
  isBusy: boolean;
  newestPath: string | null;
  oldestPath: string | null;
  sortKey: BackupSortKey;
  sortDirection: "asc" | "desc";
  onToggleSort: (key: BackupSortKey) => void;
  onCompare: (file: PostgresBackupFile) => void;
  onRestore: (file: PostgresBackupFile) => void;
};

/** Taille affichée à côté du nom de fichier (o / Ko / Mo). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}\u00a0o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}\u00a0Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")}\u00a0Mo`;
}

function createdAtMs(file: PostgresBackupFile): number {
  const ms = Date.parse(file.createdAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** Plus récente et plus ancienne du dossier (même fichier si une seule ligne). */
export function pickBackupAgeMarkers(files: PostgresBackupFile[]): { newestPath: string | null; oldestPath: string | null } {
  if (!files.length) return { newestPath: null, oldestPath: null };
  let newest = files[0];
  let oldest = files[0];
  for (const file of files) {
    const ms = createdAtMs(file);
    if (ms > createdAtMs(newest)) newest = file;
    if (ms < createdAtMs(oldest)) oldest = file;
  }
  return {
    newestPath: newest.filePath,
    oldestPath: oldest.filePath === newest.filePath ? null : oldest.filePath
  };
}

export const BACKUP_SORT_COMPARATORS: Record<
  BackupSortKey,
  (a: PostgresBackupFile, b: PostgresBackupFile) => number
> = {
  date: (a, b) => createdAtMs(a) - createdAtMs(b),
  type: (a, b) => backupKindLabel(a.kind).localeCompare(backupKindLabel(b.kind), "fr")
};

export function PostgresBackupTable({
  files,
  emptyMessage,
  isBusy,
  newestPath,
  oldestPath,
  sortKey,
  sortDirection,
  onToggleSort,
  onCompare,
  onRestore
}: PostgresBackupTableProps) {
  const sortLabel = (key: BackupSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="table-scroll-x postgres-backup-table-wrap">
      <table className="data-table-fixed">
        <colgroup>
          <col className="postgres-backup-col-date" />
          <col className="postgres-backup-col-type" />
          <col className="postgres-backup-col-file" />
          <col className="postgres-backup-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <button type="button" className="table-sort-btn" onClick={() => onToggleSort("date")}>
                Date {sortLabel("date")}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="table-sort-btn" onClick={() => onToggleSort("type")}>
                Type {sortLabel("type")}
              </button>
            </th>
            <th scope="col">Fichier</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            files.map((file) => {
              const isNewest = file.filePath === newestPath;
              const isOldest = file.filePath === oldestPath;
              return (
              <tr key={file.filePath}>
                <td>
                  <div className="postgres-backup-date-cell">
                    <span>{formatBackupWhen(file.createdAt)}</span>
                    {isNewest ? (
                      <span className="mc-status-badge mc-status-badge--cloture">
                        <span className="mc-status-badge__dot" aria-hidden />
                        <span className="mc-status-badge__label">Dernière</span>
                      </span>
                    ) : null}
                    {isOldest ? (
                      <span className="mc-status-badge mc-status-badge--en-attente">
                        <span className="mc-status-badge__dot" aria-hidden />
                        <span className="mc-status-badge__label">Ancienne</span>
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{backupKindLabel(file.kind)}</td>
                <td className="postgres-backup-file-cell" title={file.filePath}>
                  {file.fileName}{" "}
                  <span className="muted">({formatSize(file.sizeBytes)})</span>
                </td>
                <td>
                  <div className="row-actions table-row-actions table-row-actions--text">
                    <button
                      type="button"
                      className="table-action-btn table-action-btn--text"
                      disabled={isBusy}
                      onClick={() => onCompare(file)}
                    >
                      Comparer
                    </button>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn--text"
                      disabled={isBusy}
                      onClick={() => onRestore(file)}
                    >
                      Restaurer
                    </button>
                  </div>
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
