/**
 * Presenter rondes : liste, CRUD, statuts, lots exceptionnels.
 *
 * Polling ~20 s. Persistance PostgreSQL. Utilisé par `RondePage`
 * (onglets urgence, planifié, gestion profils déléguée AppShell).
 */

import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import type { RondeEntry, RondeOriginKind, RondeSavePayload, RondeStatus } from "../model/ronde.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";

function makeRondeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ronde-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function mapRondeStatusError(error: unknown): string {
  if (!(error instanceof Error)) return "Changement d'état impossible.";
  const msg = extractUserFacingErrorMessage(error, "");
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
  onToast?: NotifyToast;
};

export function useRondePresenter({ requesterRole, requesterUsername, onToast }: UseRondePresenterOptions) {
  const [entries, setEntries] = useState<RondeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const notify: NotifyToast = (message, variant) => {
    onToast?.(message, variant);
  };

  const loadEntries = useCallback(
    async (silent?: boolean): Promise<RondeEntry[]> => {
      try {
        if (!silent) setLoading(true);
        const rows = await gtsApiClient.listRondes({ requesterRole });
        setEntries(rows);
        return rows;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Impossible de charger les rondes.", "error");
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
      await gtsApiClient.createRondeEntry({
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
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.", "error");
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
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(mapRondeStatusError(error), "error");
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
      notify(error instanceof Error ? error.message : "Mise à jour du lot impossible.", "error");
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
      notify(error instanceof Error ? error.message : "Annulation en lot impossible.", "error");
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
      notify(error instanceof Error ? error.message : "Suppression en lot impossible.", "error");
      return null;
    }
  };

  return {
    entries,
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
