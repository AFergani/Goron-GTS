/**
 * Presenter main courante : liste, stats, création opérateur, édition, actions responsable.
 *
 * Polling ~20 s, file `PENDING_QUEUE`, alerte writer indisponible à la création.
 * Utilisé par : `MainCourantePage` (badge sidebar alimenté par AppShell via API séparée).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type {
  MainCouranteCreatePayload,
  MainCouranteEntry,
  MainCouranteSavePayload
} from "../model/mainCourante.types";
import type { Role } from "../../../types";

function makeEntryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

type MainCourantePresenterOptions = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
};

export function useMainCourantePresenter(currentOperator: string, options: MainCourantePresenterOptions) {
  const { requesterRole, requesterUsername, onToast } = options;
  const [entries, setEntries] = useState<MainCouranteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingQueueEntries, setPendingQueueEntries] = useState<Record<string, MainCouranteEntry>>({});

  const notify = (msg: string) => {
    onToast?.(msg);
  };

  const loadEntries = useCallback(
    async (silent?: boolean) => {
      try {
        if (!silent) setLoading(true);
        const list = await gtsApiClient.listMainCouranteEntries({ requesterRole });
        setPendingQueueEntries((currentPending) => {
          const nextPending = { ...currentPending };
          for (const row of list) {
            if (!nextPending[row.id]) continue;
            delete nextPending[row.id];
          }
          const merged = [...list];
          for (const pendingRow of Object.values(nextPending)) {
            if (!merged.some((row) => row.id === pendingRow.id)) {
              merged.unshift(pendingRow);
            }
          }
          setEntries(merged);
          return nextPending;
        });
      } catch (e) {
        notify(e instanceof Error ? e.message : "Impossible de charger la main courante.");
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
    const id = window.setInterval(() => void loadEntries(true), 20000);
    return () => window.clearInterval(id);
  }, [loadEntries]);

  const stats = useMemo(() => {
    const total = entries.length;
    const waiting = entries.filter((e) => e.status === "EN_ATTENTE").length;
    const inProgress = entries.filter((e) => e.status === "EN_COURS").length;
    const closed = entries.filter((e) => e.status === "CLOTURE").length;
    return { total, waiting, inProgress, closed };
  }, [entries]);

  const createEntry = async (payload: MainCouranteCreatePayload): Promise<boolean> => {
    try {
      const writerStatus = await gtsApiClient.getWriterStatus();
      const id = makeEntryId();
      const created = await gtsApiClient.createMainCouranteEntry({
        requesterRole,
        requesterUsername,
        id,
        operatorName: currentOperator,
        siteId: payload.siteId,
        siteDisplay: payload.siteDisplay,
        anomalyTypeId: payload.anomalyTypeId,
        anomalyTypeLabel: payload.anomalyTypeLabel,
        information: payload.information
      });
      if ((created as MainCouranteEntry).syncState === "PENDING_QUEUE") {
        const pendingEntry = created as MainCouranteEntry;
        setPendingQueueEntries((current) => ({ ...current, [pendingEntry.id]: pendingEntry }));
        setEntries((current) => [pendingEntry, ...current.filter((row) => row.id !== pendingEntry.id)]);
      }
      if (
        writerStatus.role === "client" &&
        writerStatus.connectivity.masterReachable === false &&
        writerStatus.connectivity.backupReachable === false
      ) {
        notify("Attention: services writer inaccessibles, entrée placée en file d'attente.");
      }
      await loadEntries(true);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Création impossible.");
      return false;
    }
  };

  const updateOperatorEntry = async (
    id: string,
    payload: MainCouranteSavePayload,
    expectedUpdatedAt: string
  ): Promise<boolean> => {
    try {
      const updated = await gtsApiClient.updateMainCouranteEntryOperator({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        requesterFullName: currentOperator,
        siteId: payload.siteId,
        siteDisplay: payload.siteDisplay,
        anomalyTypeId: payload.anomalyTypeId,
        anomalyTypeLabel: payload.anomalyTypeLabel,
        information: payload.information
      });
      if ((updated as MainCouranteEntry).syncState === "PENDING_QUEUE") {
        setPendingQueueEntries((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), ...(updated as MainCouranteEntry), id, syncState: "PENDING_QUEUE" } as MainCouranteEntry
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, ...(updated as Partial<MainCouranteEntry>), syncState: "PENDING_QUEUE" } : entry
          )
        );
      }
      await loadEntries(true);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Mise à jour impossible.");
      return false;
    }
  };

  const applyManagerAction = async (
    id: string,
    {
      managerName,
      managerObservation,
      decision,
      expectedUpdatedAt
    }: {
      managerName: string;
      managerObservation: string;
      decision: "suivre" | "cloture";
      expectedUpdatedAt: string;
    }
  ): Promise<boolean> => {
    try {
      const updated = await gtsApiClient.applyMainCouranteManagerAction({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        managerName,
        managerObservation,
        decision
      });
      if ((updated as MainCouranteEntry).syncState === "PENDING_QUEUE") {
        setPendingQueueEntries((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), ...(updated as MainCouranteEntry), id, syncState: "PENDING_QUEUE" } as MainCouranteEntry
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, ...(updated as Partial<MainCouranteEntry>), syncState: "PENDING_QUEUE" } : entry
          )
        );
      }
      await loadEntries(true);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Enregistrement impossible.");
      return false;
    }
  };

  const reopenEntry = async (
    id: string,
    { managerName, expectedUpdatedAt }: { managerName: string; expectedUpdatedAt: string }
  ): Promise<boolean> => {
    try {
      const updated = await gtsApiClient.reopenMainCouranteEntry({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        managerName
      });
      if ((updated as MainCouranteEntry).syncState === "PENDING_QUEUE") {
        setPendingQueueEntries((current) => ({
          ...current,
          [id]: { ...(current[id] || {}), ...(updated as MainCouranteEntry), id, syncState: "PENDING_QUEUE" } as MainCouranteEntry
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, ...(updated as Partial<MainCouranteEntry>), syncState: "PENDING_QUEUE" } : entry
          )
        );
      }
      await loadEntries(true);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Réouverture impossible.");
      return false;
    }
  };

  return {
    entries,
    stats,
    loading,
    loadEntries,
    createEntry,
    updateOperatorEntry,
    applyManagerAction,
    reopenEntry
  };
}
