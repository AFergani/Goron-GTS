/**
 * Presenter main courante : liste, stats, création opérateur, édition, actions responsable.
 *
 * Polling ~20 s. Persistance PostgreSQL (passthrough IPC).
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

  const notify = (msg: string) => {
    onToast?.(msg);
  };

  const loadEntries = useCallback(
    async (silent?: boolean) => {
      try {
        if (!silent) setLoading(true);
        const list = await gtsApiClient.listMainCouranteEntries({ requesterRole });
        setEntries(list);
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
      const id = makeEntryId();
      await gtsApiClient.createMainCouranteEntry({
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
      await gtsApiClient.updateMainCouranteEntryOperator({
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
      await gtsApiClient.applyMainCouranteManagerAction({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        managerName,
        managerObservation,
        decision
      });
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
      await gtsApiClient.reopenMainCouranteEntry({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        managerName
      });
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
