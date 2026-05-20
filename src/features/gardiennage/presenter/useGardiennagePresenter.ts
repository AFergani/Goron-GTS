import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import type { GardiennageClosePayload, GardiennageEntry, GardiennageSavePayload, GardiennageStatus } from "../model/gardiennage.types";

function makeGardiennageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gard-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

type UseGardiennagePresenterOptions = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
};

export function useGardiennagePresenter({ requesterRole, requesterUsername, onToast }: UseGardiennagePresenterOptions) {
  const [entries, setEntries] = useState<GardiennageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingQueueEntries, setPendingQueueEntries] = useState<Record<string, GardiennageEntry>>({});

  const notify = (message: string) => onToast?.(message);

  const loadEntries = useCallback(
    async (silent?: boolean): Promise<GardiennageEntry[]> => {
      try {
        if (!silent) setLoading(true);
        const rows = await gtsApiClient.listGardiennages({ requesterRole });
        setPendingQueueEntries((currentPending) => {
          const nextPending = { ...currentPending };
          for (const row of rows) {
            if (!nextPending[row.id]) continue;
            delete nextPending[row.id];
          }
          const merged = [...rows];
          for (const pendingRow of Object.values(nextPending)) {
            if (!merged.some((row) => row.id === pendingRow.id)) {
              merged.unshift(pendingRow);
            }
          }
          setEntries(merged);
          return nextPending;
        });
        return rows;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Impossible de charger les gardiennages.");
        return [];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [requesterRole]
  );

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadEntries(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [loadEntries]);

  const createEntry = async (payload: GardiennageSavePayload) => {
    try {
      const created = await gtsApiClient.createGardiennage({
        requesterRole,
        requesterUsername,
        id: makeGardiennageId(),
        ...payload
      });
      if ((created as GardiennageEntry).syncState === "PENDING_QUEUE") {
        const pendingEntry = created as GardiennageEntry;
        setPendingQueueEntries((current) => ({ ...current, [pendingEntry.id]: pendingEntry }));
        setEntries((current) => [pendingEntry, ...current.filter((row) => row.id !== pendingEntry.id)]);
        notify("Gardiennage en attente de validation DB.");
      }
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.");
      return false;
    }
  };

  const updateEntry = async (id: string, expectedUpdatedAt: string, payload: GardiennageSavePayload) => {
    try {
      const updated = await gtsApiClient.updateGardiennage({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        ...payload
      });
      if ((updated as GardiennageEntry).syncState === "PENDING_QUEUE") {
        setPendingQueueEntries((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), ...(updated as GardiennageEntry), id, syncState: "PENDING_QUEUE" } as GardiennageEntry
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, ...(updated as Partial<GardiennageEntry>), syncState: "PENDING_QUEUE" } : entry
          )
        );
      }
      await loadEntries(true);
      return updated;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mise à jour impossible.");
      return null;
    }
  };

  const setStatus = async (
    id: string,
    expectedUpdatedAt: string,
    status: GardiennageStatus,
    cancellationReason?: string
  ) => {
    try {
      const result = await gtsApiClient.setGardiennageStatus({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        status,
        cancellationReason
      });
      if (status === "ANNULE") {
        if (result.batchOperation?.isBatch) {
          const c = Number(result.batchOperation.cancelledCount || 0);
          const p = Number(result.batchOperation.preservedClosedCount || 0);
          notify(`Annulation lot gardiennage: ${c} entrée(s) annulée(s), ${p} clôturée(s) conservée(s).`);
        } else {
          notify("Gardiennage annulé.");
        }
      } else if (status === "CLOTURE") {
        notify("Gardiennage clôturé.");
      } else if (status === "PLANIFIE") {
        notify("Gardiennage remis en planifié.");
      } else if (status === "ACTIF") {
        notify("Gardiennage activé.");
      }
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Changement de statut impossible.");
      return false;
    }
  };

  const closeEntry = async (id: string, expectedUpdatedAt: string, closePayload: GardiennageClosePayload) => {
    try {
      await gtsApiClient.closeGardiennage({ requesterRole, requesterUsername, id, expectedUpdatedAt, ...closePayload });
      notify("Clôture gardiennage enregistrée.");
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Clôture impossible.");
      return false;
    }
  };

  const reopenEntry = async (id: string, expectedUpdatedAt: string) => {
    try {
      await gtsApiClient.reopenGardiennage({ requesterRole, requesterUsername, id, expectedUpdatedAt });
      notify("Gardiennage rouvert (depuis annulé/clôturé).");
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Réouverture impossible.");
      return false;
    }
  };

  const deleteEntry = async (id: string, reason: string) => {
    try {
      const result = await gtsApiClient.deleteGardiennage({ requesterRole, requesterUsername, id, reason });
      const deletedCount = Number(result.deletedCount || 0);
      const preservedClosedCount = Number(result.preservedClosedCount || 0);
      if (deletedCount > 0 || preservedClosedCount > 0) {
        notify(
          `Suppression gardiennage: ${deletedCount} entrée(s) supprimée(s), ${preservedClosedCount} clôturée(s) conservée(s).`
        );
      } else {
        notify("Gardiennage supprimé.");
      }
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression impossible.");
      return false;
    }
  };

  return {
    entries,
    loading,
    loadEntries,
    createEntry,
    updateEntry,
    setStatus,
    closeEntry,
    reopenEntry,
    deleteEntry
  };
}
