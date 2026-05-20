import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import type { PendingInterventionIntervenant, PendingInterventionSite } from "../model/intervention.types";

export function useInterventionReferenceData(requesterRole: Role, requesterUsername: string, onToast?: (message: string) => void) {
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [intervenants, setIntervenants] = useState<IntervenantRef[]>([]);
  const [pendingSites, setPendingSites] = useState<PendingInterventionSite[]>([]);
  const [pendingIntervenants, setPendingIntervenants] = useState<PendingInterventionIntervenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRows, intervenantRows, pendingRows, pendingIntervenantRows] = await Promise.all([
        gtsApiClient.listSites({ requesterRole }),
        gtsApiClient.listIntervenants({ requesterRole }),
        gtsApiClient.listPendingInterventionSites({ requesterRole }),
        gtsApiClient.listPendingInterventionIntervenants({ requesterRole })
      ]);
      setSites(siteRows);
      setIntervenants(intervenantRows);
      setPendingSites(pendingRows);
      setPendingIntervenants(pendingIntervenantRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les référentiels intervention.");
    } finally {
      setLoading(false);
    }
  }, [requesterRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPendingSite = async (code: string, name: string) => {
    try {
      const response = await gtsApiClient.createPendingInterventionSite({
        requesterRole,
        requesterUsername,
        code,
        name
      });
      await load();
      if (response.alreadyExists) {
        onToast?.("Ce site existe déjà ou est déjà en attente de validation.");
      } else {
        onToast?.("Site ajouté en attente de validation.");
      }
      return true;
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Impossible d'ajouter le site en attente.");
      return false;
    }
  };

  const createPendingIntervenant = async (name: string) => {
    try {
      const response = await gtsApiClient.createPendingInterventionIntervenant({
        requesterRole,
        requesterUsername,
        name
      });
      await load();
      if (response.alreadyExists) {
        onToast?.("Cet intervenant existe déjà ou est déjà en attente de validation.");
      } else {
        onToast?.("Intervenant ajouté en attente de validation.");
      }
      return true;
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Impossible d'ajouter l'intervenant en attente.");
      return false;
    }
  };

  return {
    sites,
    intervenants,
    pendingSites,
    pendingIntervenants,
    loading,
    error,
    reload: load,
    createPendingSite,
    createPendingIntervenant
  };
}
