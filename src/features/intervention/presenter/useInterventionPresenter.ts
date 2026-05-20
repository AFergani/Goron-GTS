import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import type { InterventionEntry, InterventionSavePayload } from "../model/intervention.types";

function makeInterventionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

type UseInterventionPresenterOptions = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
};

export function useInterventionPresenter({ requesterRole, requesterUsername, onToast }: UseInterventionPresenterOptions) {
  const [entries, setEntries] = useState<InterventionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingQueueEntries, setPendingQueueEntries] = useState<Record<string, InterventionEntry>>({});

  const notify = (message: string) => {
    onToast?.(message);
  };

  const loadEntries = useCallback(
    async (silent?: boolean): Promise<InterventionEntry[]> => {
      try {
        if (!silent) setLoading(true);
        const rows = await gtsApiClient.listInterventions({ requesterRole });
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
        notify(error instanceof Error ? error.message : "Impossible de charger les interventions.");
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

  const stats = useMemo(() => {
    const total = entries.length;
    const inProgress = entries.filter((entry) => entry.status === "EN_COURS").length;
    const closed = entries.filter((entry) => entry.status === "CLOTURE").length;
    const canceled = entries.filter((entry) => entry.status === "ANNULE").length;
    return { total, inProgress, closed, canceled };
  }, [entries]);

  const createEntry = async (payload: InterventionSavePayload) => {
    try {
      const created = await gtsApiClient.createInterventionEntry({
        requesterRole,
        requesterUsername,
        id: makeInterventionId(),
        ...payload
      });
      if ((created as InterventionEntry).syncState === "PENDING_QUEUE") {
        const pendingEntry = created as InterventionEntry;
        setPendingQueueEntries((current) => ({ ...current, [pendingEntry.id]: pendingEntry }));
        setEntries((current) => [pendingEntry, ...current.filter((row) => row.id !== pendingEntry.id)]);
        notify("Intervention en attente de validation DB.");
      }
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.");
      return false;
    }
  };

  const updateEntry = async (id: string, expectedUpdatedAt: string, payload: InterventionSavePayload) => {
    try {
      const updated = await gtsApiClient.updateInterventionEntry({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        ...payload
      });
      if ((updated as InterventionEntry).syncState === "PENDING_QUEUE") {
        setPendingQueueEntries((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), ...(updated as InterventionEntry), id, syncState: "PENDING_QUEUE" } as InterventionEntry
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, ...(updated as Partial<InterventionEntry>), syncState: "PENDING_QUEUE" } : entry
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
    status: "EN_COURS" | "CLOTURE" | "ANNULE",
    cancellationReason?: string
  ) => {
    try {
      await gtsApiClient.setInterventionStatus({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        status,
        cancellationReason
      });
      setPendingQueueEntries((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Changement d'état impossible.");
      return false;
    }
  };

  const setBillingStatus = async (
    id: string,
    expectedUpdatedAt: string,
    billingStatus: "FACTURABLE" | "NON_FACTURABLE",
    reason?: string
  ) => {
    try {
      await gtsApiClient.setInterventionBillingStatus({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        billingStatus,
        reason
      });
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Statut de facturation non modifié.");
      return false;
    }
  };

  return {
    entries,
    stats,
    loading,
    loadEntries,
    createEntry,
    updateEntry,
    setStatus,
    setBillingStatus
  };
}
