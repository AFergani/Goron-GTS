import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import type { RondeEntry, RondeOriginKind, RondeSavePayload, RondeStatus } from "../model/ronde.types";

function makeRondeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ronde-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function mapRondeStatusError(error: unknown): string {
  if (!(error instanceof Error)) return "Changement d'état impossible.";
  const msg = String(error.message || "");
  if (msg.includes("RONDE_CONFLICT") || msg.toLowerCase().includes("modifiée ailleurs")) {
    return "Cette ronde a été modifiée sur un autre poste. Rechargez la liste puis réessayez.";
  }
  if (msg.includes("RONDE_NOT_FOUND")) {
    return "Cette ronde n'existe plus ou a été supprimée.";
  }
  return msg || "Changement d'état impossible.";
}

type UseRondePresenterOptions = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
};

export function useRondePresenter({ requesterRole, requesterUsername, onToast }: UseRondePresenterOptions) {
  const [entries, setEntries] = useState<RondeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingQueueEntries, setPendingQueueEntries] = useState<Record<string, RondeEntry>>({});

  const notify = (message: string) => {
    onToast?.(message);
  };

  const loadEntries = useCallback(
    async (silent?: boolean) => {
      try {
        if (!silent) setLoading(true);
        const rows = await gtsApiClient.listRondes({ requesterRole });
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
      } catch (error) {
        notify(error instanceof Error ? error.message : "Impossible de charger les rondes.");
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

  const createEntry = async (
    payload: RondeSavePayload & {
      source: "URGENCE" | "LIEE_INTERVENTION" | "PLANIFIE";
      originInterventionId?: string | null;
      plannedProfileId?: string | null;
      plannedRoundKind?: string | null;
      plannedSlotKey?: string | null;
      /** Création directe en clôturé ou annulé (passages planifiés en une fois). */
      initialStatus?: RondeStatus;
      cancellationReason?: string;
      requestPlanningSnapshotJson?: string | null;
      requestBatchId?: string | null;
    }
  ) => {
    try {
      const {
        source,
        originInterventionId,
        plannedProfileId,
        plannedRoundKind,
        plannedSlotKey,
        initialStatus,
        cancellationReason,
        requestPlanningSnapshotJson,
        requestBatchId,
        ...savePayload
      } = payload;
      const created = await gtsApiClient.createRondeEntry({
        requesterRole,
        requesterUsername,
        id: makeRondeId(),
        source,
        originInterventionId: originInterventionId ?? null,
        plannedProfileId: plannedProfileId ?? null,
        plannedRoundKind: plannedRoundKind ?? null,
        plannedSlotKey: plannedSlotKey ?? null,
        requestPlanningSnapshotJson: requestPlanningSnapshotJson ?? null,
        requestBatchId: requestBatchId ?? null,
        ...savePayload,
        ...(initialStatus ? { initialStatus } : {}),
        ...(initialStatus === "ANNULE"
          ? { cancellationReason: String(cancellationReason ?? "").trim() }
          : {})
      });
      if ((created as RondeEntry).syncState === "PENDING_QUEUE") {
        const pendingEntry = created as RondeEntry;
        setPendingQueueEntries((current) => ({ ...current, [pendingEntry.id]: pendingEntry }));
        setEntries((current) => [pendingEntry, ...current.filter((row) => row.id !== pendingEntry.id)]);
        notify("Ronde en attente de validation DB.");
      }
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.");
      return false;
    }
  };

  const updateEntry = async (id: string, expectedUpdatedAt: string, payload: RondeSavePayload) => {
    try {
      const updated = await gtsApiClient.updateRondeEntry({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        ...payload
      });
      if ((updated as RondeEntry).syncState === "PENDING_QUEUE") {
        setPendingQueueEntries((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), ...(updated as RondeEntry), id, syncState: "PENDING_QUEUE" } as RondeEntry
        }));
        setEntries((current) =>
          current.map((entry) => (entry.id === id ? { ...entry, ...(updated as Partial<RondeEntry>), syncState: "PENDING_QUEUE" } : entry))
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
    status: RondeStatus,
    cancellationReason?: string
  ) => {
    try {
      await gtsApiClient.setRondeStatus({
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
      notify(mapRondeStatusError(error));
      return false;
    }
  };

  const updateBatchSharedFields = async (payload: {
    entryIds: string[];
    siteId: string | null;
    siteDisplay: string;
    motifTypeId: string;
    motifDetail: string;
    originKind: RondeOriginKind;
    originDetail: string;
    intervenantId: string | null;
    intervenantName: string;
    requestPlanningSnapshotJson?: string | null;
  }) => {
    try {
      await gtsApiClient.updateRondeBatchSharedFields({
        requesterRole,
        requesterUsername,
        ...payload
      });
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mise à jour du lot impossible.");
      return false;
    }
  };

  const bulkCancelBatch = async (entryIds: string[], reason: string) => {
    try {
      const res = await gtsApiClient.bulkCancelRondeBatch({
        requesterRole,
        requesterUsername,
        entryIds,
        reason
      });
      await loadEntries(true);
      return res;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Annulation en lot impossible.");
      return null;
    }
  };

  const bulkDeleteBatch = async (entryIds: string[], reason: string) => {
    try {
      const res = await gtsApiClient.bulkDeleteRondeBatch({
        requesterRole,
        requesterUsername,
        entryIds,
        reason
      });
      await loadEntries(true);
      return res;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression en lot impossible.");
      return null;
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
    updateBatchSharedFields,
    bulkCancelBatch,
    bulkDeleteBatch
  };
}
