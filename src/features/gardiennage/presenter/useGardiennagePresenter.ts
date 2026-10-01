/**
 * Presenter gardiennage : liste, CRUD, statuts, clôture.
 *
 * Polling silencieux aligné sur les badges sidebar (`DATA_REFRESH_POLL_MS`). Persistance PostgreSQL.
 * Compteurs mois en cours (`recurrenceStartDate`) pour les cartes de synthèse.
 * Messages utilisateur via `onToast`. Utilisé par : `GardiennagePage`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { DATA_REFRESH_POLL_MS } from "../../common/constants/dataRefreshPoll";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import { getLocalMonthKey, isIsoDateInLocalMonth } from "../../common/utils/currentMonthSummary";
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
  requesterDisplayName?: string;
  onToast?: NotifyToast;
};

export function useGardiennagePresenter({
  requesterRole,
  requesterUsername,
  requesterDisplayName = "",
  onToast
}: UseGardiennagePresenterOptions) {
  const [entries, setEntries] = useState<GardiennageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const notify: NotifyToast = (message, variant) => onToast?.(message, variant);

  const loadEntries = useCallback(
    async (silent?: boolean): Promise<GardiennageEntry[]> => {
      try {
        if (!silent) setLoading(true);
        const rows = await gtsApiClient.listGardiennages({ requesterRole });
        setEntries(rows);
        return rows;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Impossible de charger les gardiennages.", "error");
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
    }, DATA_REFRESH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadEntries]);

  const stats = useMemo(() => {
    const monthKey = getLocalMonthKey();
    const monthEntries = entries.filter((entry) =>
      isIsoDateInLocalMonth(entry.recurrenceStartDate, monthKey)
    );
    const total = monthEntries.length;
    const planned = monthEntries.filter((entry) => entry.status === "PLANIFIE").length;
    const active = monthEntries.filter((entry) => entry.status === "ACTIF").length;
    const closed = monthEntries.filter((entry) => entry.status === "CLOTURE").length;
    const canceled = monthEntries.filter((entry) => entry.status === "ANNULE").length;
    return { total, planned, active, closed, canceled };
  }, [entries]);

  const createEntry = async (payload: GardiennageSavePayload) => {
    try {
      await gtsApiClient.createGardiennage({
        requesterRole,
        requesterUsername,
        id: makeGardiennageId(),
        ...payload
      });
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.", "error");
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
    status: GardiennageStatus,
    cancellationReason?: string
  ) => {
    try {
      const result = await gtsApiClient.setGardiennageStatus({
        requesterRole,
        requesterUsername,
        requesterDisplayName,
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
      notify(error instanceof Error ? error.message : "Changement de statut impossible.", "error");
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
      notify(error instanceof Error ? error.message : "Clôture impossible.", "error");
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
      notify(error instanceof Error ? error.message : "Réouverture impossible.", "error");
      return false;
    }
  };

  const requestCancellation = async (id: string, reason: string) => {
    try {
      await gtsApiClient.requestGardiennageCancellation({
        requesterRole,
        requesterUsername,
        requesterDisplayName,
        id,
        reason
      });
      notify("Demande d'annulation envoyée.");
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Demande d'annulation impossible.", "error");
      return false;
    }
  };

  const reviewCancellation = async (id: string, decision: "approve" | "reject") => {
    try {
      const result = await gtsApiClient.reviewGardiennageCancellation({
        requesterRole,
        requesterUsername,
        requesterDisplayName,
        id,
        decision
      });
      if (decision === "approve") {
        const cancelled = Number(result.batchOperation?.cancelledCount || 0);
        const preserved = Number(result.batchOperation?.preservedClosedCount || 0);
        notify(
          preserved > 0
            ? `Annulation acceptée : ${cancelled} journée(s) annulée(s), ${preserved} clôturée(s) conservée(s).`
            : "Annulation acceptée."
        );
      } else {
        notify("Demande d'annulation refusée.");
      }
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Traitement de la demande impossible.", "error");
      return false;
    }
  };

  const deleteEntry = async (id: string, reason: string) => {
    try {
      const result = await gtsApiClient.deleteGardiennage({ requesterRole, requesterUsername, id, reason });
      const deletedCount = Number(result.deletedCount || 0);
      notify(deletedCount > 1 ? `${deletedCount} gardiennages supprimés.` : "Gardiennage supprimé.");
      await loadEntries(true);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression impossible.", "error");
      return false;
    }
  };

  return {
    entries,
    loading,
    stats,
    loadEntries,
    createEntry,
    updateEntry,
    setStatus,
    closeEntry,
    reopenEntry,
    requestCancellation,
    reviewCancellation,
    deleteEntry
  };
}
