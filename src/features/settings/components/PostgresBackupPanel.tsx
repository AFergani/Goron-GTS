/**
 * Panneau sauvegardes PostgreSQL : dossier, cycle 3 h, copies manuelles, liste, comparaison, restauration.
 * Variante `admin` (Paramètres, session requise). La variante `recovery` ne propose plus
 * ni restauration ni comparaison : ces actions passent uniquement par une session autorisée.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, FolderPlus, GitCompare, Loader2, PlayCircle, RotateCcw, Save, SaveAll } from "lucide-react";
import { ListLoadingOverlay } from "../../common/components/ListLoadingOverlay";
import { TableFiltersBar } from "../../common/components/TableFiltersBar";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { useTableFilters } from "../../common/hooks/useTableFilters";
import { useTableSort } from "../../common/hooks/useTableSort";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import { matchesIsoDateRange } from "../../common/utils/matchesIsoDateRange";
import {
  gtsApiClient,
  type PostgresBackupFile,
  type PostgresBackupStatus,
  type PostgresCompareResult
} from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import { BACKUP_KIND_FILTERS, backupKindLabel } from "../model/postgresBackupDisplay";
import { BACKUP_SORT_COMPARATORS, pickBackupAgeMarkers, PostgresBackupTable } from "./PostgresBackupTable";
import { PostgresBackupCompareModal } from "./PostgresBackupCompareModal";
import { PostgresRestoreConfirmModal } from "./PostgresRestoreConfirmModal";
import "./PostgresConnectionPanel.css";
import "./PostgresBackupPanel.css";

type PostgresBackupPanelProps = {
  variant?: "admin" | "recovery";
  requesterRole?: Role;
  requesterUsername?: string;
  onNotify?: (message: string, tone?: "success" | "error" | "warning") => void;
  onRestored?: () => void;
};

export function PostgresBackupPanel({
  variant = "admin",
  requesterRole,
  requesterUsername,
  onNotify,
  onRestored
}: PostgresBackupPanelProps) {
  const isAdmin = variant === "admin";
  const [status, setStatus] = useState<PostgresBackupStatus | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading" | "dumping" | "cycling" | "restoring" | "comparing" | "saving">("idle");
  const [error, setError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<{ fileName?: string; filePath?: string } | null>(null);
  const [compareTarget, setCompareTarget] = useState<{ fileName?: string; filePath?: string } | null>(null);
  const [compareResult, setCompareResult] = useState<PostgresCompareResult | null>(null);
  const [kindFilter, setKindFilter] = useState("");
  const filters = useTableFilters({ pageSize: 25 });

  const loadStatus = useCallback(async () => {
    setBusy((prev) => (prev === "idle" ? "loading" : prev));
    try {
      const next = await gtsApiClient.getPostgresBackupStatus();
      setStatus(next);
      setError("");
    } catch (err) {
      setError(extractUserFacingErrorMessage(err, "Impossible de charger les sauvegardes."));
    } finally {
      setBusy((prev) => (prev === "loading" ? "idle" : prev));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const notify = (message: string, tone: "success" | "error" | "warning" = "success") => {
    onNotify?.(message, tone);
  };

  const pickFolder = async () => {
    if (!isAdmin || !requesterRole || !requesterUsername || busy !== "idle") return;
    try {
      const result = await gtsApiClient.pickPostgresBackupFolder({ requesterRole, requesterUsername });
      if (result.canceled) return;
      setStatus(result.config);
      notify("Dossier de sauvegarde enregistré.");
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Impossible de choisir le dossier."), "error");
    }
  };

  const toggleAuto = async (next: boolean) => {
    if (!isAdmin || !requesterRole || !requesterUsername || busy !== "idle") return;
    setBusy("saving");
    try {
      const config = await gtsApiClient.savePostgresBackupSettings({
        requesterRole,
        requesterUsername,
        autoEnabled: next
      });
      setStatus(config);
      notify(next ? "Sauvegardes automatiques activées." : "Sauvegardes automatiques désactivées.");
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Impossible d'enregistrer le planning."), "error");
    } finally {
      setBusy("idle");
    }
  };

  const runDumpSaveAs = async () => {
    if (!isAdmin || !requesterRole || !requesterUsername || busy !== "idle") return;
    setBusy("dumping");
    try {
      const result = await gtsApiClient.runPostgresBackupSaveAs({ requesterRole, requesterUsername });
      if (result.canceled) return;
      setStatus(result.config);
      notify(`Sauvegarde enregistrée : ${result.fileName}`);
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Sauvegarde impossible."), "error");
      await loadStatus();
    } finally {
      setBusy("idle");
    }
  };

  const runDump = async () => {
    if (!isAdmin || !requesterRole || !requesterUsername || busy !== "idle") return;
    setBusy("dumping");
    try {
      const result = await gtsApiClient.runPostgresBackup({ requesterRole, requesterUsername });
      setStatus(result.config);
      notify(`Sauvegarde manuelle créée : ${result.fileName}`);
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Sauvegarde impossible."), "error");
      await loadStatus();
    } finally {
      setBusy("idle");
    }
  };

  const startCycle = async () => {
    if (!isAdmin || !requesterRole || !requesterUsername || busy !== "idle") return;
    setBusy("cycling");
    try {
      const result = await gtsApiClient.startPostgresBackupCycle({ requesterRole, requesterUsername });
      setStatus(result.config);
      notify(`Cycle lancé : ${result.fileName}. Prochaine journalière automatique à 3 h.`);
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Impossible de lancer le cycle."), "error");
      await loadStatus();
    } finally {
      setBusy("idle");
    }
  };

  const openFolder = async () => {
    try {
      const result = await gtsApiClient.openPostgresBackupFolder();
      if (!result.success) {
        notify(result.error || "Impossible d'ouvrir le dossier.", "error");
      }
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Impossible d'ouvrir le dossier."), "error");
    }
  };

  const pickDumpTarget = async (assign: (target: { fileName?: string; filePath?: string }) => void) => {
    if (busy !== "idle") return;
    try {
      const picked = await gtsApiClient.pickPostgresBackupFile();
      if (picked.canceled || !picked.filePath) return;
      assign({ filePath: picked.filePath, fileName: picked.fileName || undefined });
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Fichier de sauvegarde invalide."), "error");
    }
  };

  const runAuthedBackupFileOp = async <T,>(
    target: { fileName?: string; filePath?: string },
    authCall: (payload: {
      requesterRole: Role;
      requesterUsername: string;
      filePath?: string;
      fileName?: string;
    }) => Promise<T>
  ): Promise<T | null> => {
    if (!isAdmin || !requesterRole || !requesterUsername) {
      notify("La restauration et la comparaison se font depuis Paramètres, une fois connecté.", "error");
      return null;
    }
    return authCall({
      requesterRole,
      requesterUsername,
      filePath: target.filePath,
      fileName: target.fileName
    });
  };

  const confirmRestore = async (confirmation: {
    accountPassword: string;
    confirmPhrase: string;
    managerFullName?: string;
  }) => {
    if (!restoreTarget || busy !== "idle") return;
    setBusy("restoring");
    try {
      const extras = {
        accountPassword: confirmation.accountPassword,
        confirmPhrase: confirmation.confirmPhrase,
        managerFullName: confirmation.managerFullName
      };
      const result = await runAuthedBackupFileOp(restoreTarget, (payload) =>
        gtsApiClient.restorePostgresBackupAuth({ ...payload, ...extras })
      );
      if (!result) return;
      setRestoreTarget(null);
      setCompareTarget(null);
      setCompareResult(null);
      notify(`Base restaurée depuis ${result.fileName}.`);
      await loadStatus();
      onRestored?.();
    } catch (err) {
      notify(extractUserFacingErrorMessage(err, "Restauration impossible."), "error");
    } finally {
      setBusy("idle");
    }
  };

  const startCompare = async (target: { fileName?: string; filePath?: string }) => {
    if (busy !== "idle") return;
    setCompareTarget(target);
    setCompareResult(null);
    setBusy("comparing");
    try {
      const result = await runAuthedBackupFileOp(target, (payload) => gtsApiClient.comparePostgresBackupAuth(payload));
      if (!result) {
        setCompareTarget(null);
        setCompareResult(null);
        return;
      }
      setCompareResult(result);
      const lost = result.totals?.lost ?? 0;
      const recovered = result.totals?.recovered ?? 0;
      const changed = result.totals?.changed ?? 0;
      notify(
        `Comparaison ${result.fileName} : ${lost} disparaîtraient, ${recovered} reviendraient, ${changed} seraient écrasées.`
      );
    } catch (err) {
      setCompareTarget(null);
      setCompareResult(null);
      notify(extractUserFacingErrorMessage(err, "Comparaison impossible."), "error");
    } finally {
      setBusy("idle");
    }
  };

  const files: PostgresBackupFile[] = status?.files ?? [];
  const isBusy = busy !== "idle" && busy !== "loading";
  const { newestPath, oldestPath } = pickBackupAgeMarkers(files);

  const filteredFiles = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const effectiveDateTo = filters.dateTo || filters.dateFrom;
    return files.filter((file) => {
      if (kindFilter && file.kind !== kindFilter) return false;
      if (query) {
        const haystack = `${file.fileName} ${backupKindLabel(file.kind)}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return matchesIsoDateRange(file.createdAt, filters.dateFrom, effectiveDateTo);
    });
  }, [files, filters.dateFrom, filters.dateTo, filters.search, kindFilter]);

  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort(
    filteredFiles,
    BACKUP_SORT_COMPARATORS,
    { key: "date", direction: "desc" }
  );

  const totalPages = filters.pageSize === 0 ? 1 : Math.max(1, Math.ceil(sortedEntries.length / filters.pageSize));
  const pageSafe = Math.min(filters.currentPage, totalPages);
  const pagedFiles = useMemo(() => {
    if (filters.pageSize === 0) return sortedEntries;
    const start = (pageSafe - 1) * filters.pageSize;
    return sortedEntries.slice(start, start + filters.pageSize);
  }, [filters.pageSize, pageSafe, sortedEntries]);

  useEffect(() => {
    if (filters.currentPage > totalPages) {
      filters.setCurrentPage(totalPages);
    }
  }, [filters.currentPage, filters.setCurrentPage, totalPages]);

  const emptyMessage = status?.folderPath
    ? files.length === 0
      ? "Aucune sauvegarde dans ce dossier."
      : "Aucune sauvegarde ne correspond aux filtres."
    : isAdmin
      ? "Choisissez un dossier pour lister les sauvegardes."
      : "Aucune sauvegarde connue sur ce poste. Choisissez une sauvegarde .dump.";

  return (
    <div className={isAdmin ? "postgres-config-panel postgres-config-panel--flat postgres-backup-panel" : "postgres-backup-panel"}>
      {!isAdmin ? (
        <p className="muted postgres-config-lead">
          Restaurez une sauvegarde .dump une fois Docker / PostgreSQL redémarré. « Comparer » affiche tout de suite
          les fiches qui disparaîtraient ou reviendraient, sans toucher à la base. La restauration remplace tout.
        </p>
      ) : null}

      {isAdmin ? (
        <>
          <div className="row settings-tab-toolbar">
            <p className="muted templates-management-panel__writable" title={status?.folderPath || undefined}>
              {status?.folderPath ? (
                <>
                  Dossier : <code>{status.folderPath}</code>
                </>
              ) : (
                "Aucun dossier choisi — les dumps ne partent pas sur le disque Docker."
              )}
            </p>
            <div className="row-actions">
              <button type="button" className="btn-light" disabled={isBusy} onClick={() => void pickFolder()}>
                <FolderPlus size={16} aria-hidden />
                Choisir le dossier
              </button>
              <button
                type="button"
                className="btn-light"
                disabled={isBusy || !status?.folderPath}
                onClick={() => void openFolder()}
              >
                <FolderOpen size={16} aria-hidden />
                Ouvrir
              </button>
              <button type="button" className="btn-light" disabled={isBusy} onClick={() => void loadStatus()}>
                <RotateCcw size={16} aria-hidden />
                Actualiser
              </button>
            </div>
          </div>

          {status?.lastRunStatus === "error" && status.lastRunError ? (
            <p className="postgres-config-warn">{status.lastRunError}</p>
          ) : null}
          {!status?.autoEligible ? (
            <p className="muted">
              Planning auto réservé au poste qui héberge PostgreSQL (localhost). Ici l&apos;hôte est {status?.host || "distant"} —
              utilisez « Sauvegarde rapide ».
            </p>
          ) : null}
        </>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="list-panel-filters">
        <TableFiltersBar
          search={filters.search}
          onSearchChange={filters.setSearch}
          dateFrom={filters.dateFrom}
          onDateFromChange={filters.setDateFrom}
          dateTo={filters.dateTo}
          onDateToChange={filters.setDateTo}
          searchPlaceholder="Nom de fichier, type…"
          onReset={() => {
            filters.reset();
            setKindFilter("");
          }}
        >
          <div className="postgres-backup-filter-tools">
          <label>
            Type
            <select
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value);
                filters.setCurrentPage(1);
              }}
            >
              {BACKUP_KIND_FILTERS.map((option) => (
                <option key={option.value || "__all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="postgres-config-actions">
            {isAdmin ? (
              <>
                {status?.autoEligible && !status.cycleStarted ? (
                  <button
                    type="button"
                    disabled={isBusy || !status?.folderPath}
                    title="Crée la première sauvegarde journalière et démarre la rotation quotidienne à 3 h."
                    onClick={() => void startCycle()}
                  >
                    {busy === "cycling" ? (
                      <span className="login-submit-busy">
                        <Loader2 size={16} className="login-spinner" aria-hidden />
                        Lancement du cycle…
                      </span>
                    ) : (
                      <>
                        <PlayCircle size={16} aria-hidden />
                        Lancer le cycle
                      </>
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={status?.cycleStarted || !status?.autoEligible ? undefined : "btn-light"}
                  disabled={isBusy || !status?.folderPath}
                  title="Copie manuelle dans le dossier, sans modifier le rythme des journalières."
                  onClick={() => void runDump()}
                >
                  {busy === "dumping" ? (
                    <span className="login-submit-busy">
                      <Loader2 size={16} className="login-spinner" aria-hidden />
                      Sauvegarde en cours…
                    </span>
                  ) : (
                    <>
                      <Save size={16} aria-hidden />
                      Sauvegarde rapide
                    </>
                  )}
                </button>
                <button type="button" className="btn-light" disabled={isBusy} onClick={() => void runDumpSaveAs()}>
                  <SaveAll size={16} aria-hidden />
                  Enregistrer sous…
                </button>
                <button type="button" className="btn-light" disabled={isBusy} onClick={() => void pickDumpTarget(setRestoreTarget)}>
                  Restaurer une sauvegarde depuis…
                </button>
                <button type="button" className="btn-light" disabled={isBusy} onClick={() => void pickDumpTarget((target) => void startCompare(target))}>
                  <GitCompare size={16} aria-hidden />
                  Comparer une sauvegarde…
                </button>
                <ToggleSwitch
                  checked={Boolean(status?.autoEnabled)}
                  onChange={(next) => void toggleAuto(next)}
                  disabled={isBusy || !status?.folderPath || !status?.autoEligible}
                  labelFirst
                  label="Automatiques (à 3 h)"
                  tooltip="Sauvegardes automatiques quotidiennes à 3 h, sur le poste qui héberge PostgreSQL."
                />
              </>
            ) : (
              <button type="button" className="btn-light" disabled={isBusy} onClick={() => void loadStatus()}>
                <RotateCcw size={16} aria-hidden />
                Actualiser
              </button>
            )}
          </div>
          </div>
        </TableFiltersBar>
      </div>

      <ListLoadingOverlay loading={busy === "loading"}>
        <PostgresBackupTable
          files={pagedFiles}
          emptyMessage={emptyMessage}
          isBusy={isBusy}
          newestPath={newestPath}
          oldestPath={oldestPath}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
          onCompare={(file) => {
            if (!isAdmin) return;
            void startCompare({ fileName: file.fileName, filePath: file.filePath });
          }}
          onRestore={(file) => {
            if (!isAdmin) return;
            setRestoreTarget({ fileName: file.fileName, filePath: file.filePath });
          }}
        />
        <TablePaginationBar
          currentPage={pageSafe}
          totalPages={totalPages}
          totalItems={sortedEntries.length}
          pageSize={filters.pageSize}
          onPageChange={filters.setCurrentPage}
          onPageSizeChange={filters.setPageSize}
        />
      </ListLoadingOverlay>

      <PostgresBackupCompareModal
        isOpen={Boolean(compareTarget) || Boolean(compareResult)}
        result={compareResult}
        loading={busy === "comparing"}
        dumpLabel={compareResult?.dumpFileName || compareResult?.fileName || compareTarget?.fileName || ""}
        restoreDisabled={busy !== "idle"}
        closeDisabled={busy === "restoring"}
        onClose={() => {
          if (busy === "comparing" || busy === "restoring") return;
          setCompareTarget(null);
          setCompareResult(null);
        }}
        onRestore={() => {
          if (!compareTarget || busy !== "idle") return;
          setRestoreTarget(compareTarget);
        }}
      />
      <PostgresRestoreConfirmModal
        isOpen={Boolean(restoreTarget)}
        dumpLabel={restoreTarget?.fileName || ""}
        busy={busy === "restoring"}
        askDisplayName={!isAdmin}
        onCancel={() => {
          if (busy === "restoring") return;
          setRestoreTarget(null);
        }}
        onConfirm={(confirmation) => void confirmRestore(confirmation)}
      />
    </div>
  );
}
