/**
 * Presenter Interventions : liste, statistiques, CRUD, statuts et facturation.
 *
 * Polling ~20 s, compteurs mois en cours (`requestDate`) pour les cartes de synthèse.
 * Utilisé par : `InterventionPage`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { getLocalMonthKey, isIsoDateInLocalMonth } from "../../common/utils/currentMonthSummary";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
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
  onToast?: NotifyToast;
};

export function useInterventionPresenter({ requesterRole, requesterUsername, onToast }: UseInterventionPresenterOptions) {
  const [entries, setEntries] = useState<InterventionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const notify: NotifyToast = (message, variant) => {
    onToast?.(message, variant);
  };

  const loadEntries = useCallback(
    async (silent?: boolean): Promise<InterventionEntry[]> => {
      try {
        if (!silent) setLoading(true);
        const rows = await gtsApiClient.listInterventions({ requesterRole });
        setEntries(rows);
        return rows;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Impossible de charger les interventions.", "error");
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
    const monthKey = getLocalMonthKey();
    const monthEntries = entries.filter((entry) => isIsoDateInLocalMonth(entry.requestDate, monthKey));
    const total = monthEntries.length;
    const inProgress = monthEntries.filter((entry) => entry.status === "EN_COURS").length;
    const closed = monthEntries.filter((entry) => entry.status === "CLOTURE").length;
    const canceled = monthEntries.filter((entry) => entry.status === "ANNULE").length;
    return { total, inProgress, closed, canceled };
  }, [entries]);

  const createEntry = async (payload: InterventionSavePayload) => {
    try {
      await gtsApiClient.createIntervention({
        requesterRole,
        requesterUsername,
        id: makeInterventionId(),
        ...payload
      });
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.", "error");
      return false;
    }
  };

  const updateEntry = async (id: string, expectedUpdatedAt: string, payload: InterventionSavePayload) => {
    try {
      const updated = await gtsApiClient.updateIntervention({
        requesterRole,
        requesterUsername,
        id,
        expectedUpdatedAt,
        ...payload
      });
      await loadEntries(true);
      return updated;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mise à jour impossible.", "error");
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
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Changement d'état impossible.", "error");
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
      notify(error instanceof Error ? error.message : "Statut de facturation non modifié.", "error");
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
