/**
 * Presenter main courante : liste, stats, création opérateur, édition, actions responsable.
 *
 * Polling ~20 s. Persistance PostgreSQL (passthrough IPC).
 * Compteurs cartes : mois civil en cours (`createdAt`).
 * Utilisé par : `MainCourantePage` (badge sidebar alimenté par AppShell via API séparée).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { getLocalMonthKey, isTimestampInLocalMonth } from "../../common/utils/currentMonthSummary";
import type {
  MainCouranteCreatePayload,
  MainCouranteEntry,
  MainCouranteSavePayload
} from "../model/mainCourante.types";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";

function makeEntryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

type MainCourantePresenterOptions = {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: NotifyToast;
};

export function useMainCourantePresenter(currentOperator: string, options: MainCourantePresenterOptions) {
  const { requesterRole, requesterUsername, onToast } = options;
  const [entries, setEntries] = useState<MainCouranteEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const notify: NotifyToast = (msg, variant) => {
    onToast?.(msg, variant);
  };

  const loadEntries = useCallback(
    async (silent?: boolean) => {
      try {
        if (!silent) setLoading(true);
        const list = await gtsApiClient.listMainCouranteEntries({ requesterRole });
        setEntries(list);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Impossible de charger la main courante.", "error");
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
    const monthKey = getLocalMonthKey();
    const monthEntries = entries.filter((entry) => isTimestampInLocalMonth(entry.createdAt, monthKey));
    const total = monthEntries.length;
    const waiting = monthEntries.filter((entry) => entry.status === "EN_ATTENTE").length;
    const inProgress = monthEntries.filter((entry) => entry.status === "EN_COURS").length;
    const closed = monthEntries.filter((entry) => entry.status === "CLOTURE").length;
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
      notify(e instanceof Error ? e.message : "Création impossible.", "error");
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
      notify(e instanceof Error ? e.message : "Mise à jour impossible.", "error");
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
      notify(e instanceof Error ? e.message : "Enregistrement impossible.", "error");
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
      notify(e instanceof Error ? e.message : "Réouverture impossible.", "error");
      return false;
    }
  };

  return {
    entries,
    stats,
    loading,
    createEntry,
    updateOperatorEntry,
    applyManagerAction,
    reopenEntry
  };
}
