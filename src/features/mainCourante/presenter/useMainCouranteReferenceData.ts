/**
 * Référentiels main courante : sites, types d’anomalie, proposition de site en attente.
 *
 * Rafraîchissement périodique (~10 s) pour refléter les validations Paramètres.
 * Utilisé par : `MainCourantePage` (référentiels passés à la modale).
 */

import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { AnomalyTypeRef, Role, SiteRef } from "../../../types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import type { NotifyToast } from "../../common/model/toast.types";
import { useCreatePendingRefs } from "../../common/hooks/useCreatePendingRefs";

export function useMainCouranteReferenceData(
  requesterRole: Role | undefined,
  requesterUsername: string,
  onToast?: NotifyToast
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
      setError(extractUserFacingErrorMessage(err, "Impossible de charger les référentiels."));
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

  const { createPendingSite } = useCreatePendingRefs({
    requesterRole,
    requesterUsername,
    onToast,
    reload: load
  });

  return { sites, anomalyTypes, loading, error, createPendingSite };
}
