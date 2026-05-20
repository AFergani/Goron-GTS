import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { AnomalyTypeRef, Role, SiteRef } from "../../../types";

function getErrorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  return err.message.replace("Error invoking remote method", "").replace(/^[:\s-]+/, "").trim() || fallback;
}

export function useMainCouranteReferenceData(
  requesterRole: Role | undefined,
  requesterUsername: string,
  onToast?: (message: string) => void
) {
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [anomalyTypes, setAnomalyTypes] = useState<AnomalyTypeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!requesterRole) {
      setLoading(false);
      return;
    }
    try {
      const [s, t] = await Promise.all([
        gtsApiClient.listSites({ requesterRole }),
        gtsApiClient.listAnomalyTypes({ requesterRole })
      ]);
      setSites(s);
      setAnomalyTypes(t);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err, "Impossible de charger les référentiels."));
    } finally {
      setLoading(false);
    }
  }, [requesterRole]);

  useEffect(() => {
    if (!requesterRole) return;
    setLoading(true);
    void load();
    const refreshMs = 10000;
    const timer = setInterval(() => {
      void load();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [load, requesterRole]);

  const createPendingSite = useCallback(
    async (code: string, name: string) => {
      if (!requesterRole) return false;
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
    },
    [load, onToast, requesterRole, requesterUsername]
  );

  return { sites, anomalyTypes, loading, error, reload: load, createPendingSite };
}
