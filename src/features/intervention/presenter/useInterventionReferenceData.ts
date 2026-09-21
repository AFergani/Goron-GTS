/**
 * Référentiels page Interventions : sites, prestataires, création pending.
 *
 * Les listes « en attente » sont gérées dans Paramètres ; ici seuls sites/intervenants
 * validés + callbacks `createPending*` pour les modales de saisie.
 *
 * Utilisé par : `InterventionPage` (sites / intervenants / createPending* pour la modale).
 */

import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import type { NotifyToast } from "../../common/model/toast.types";
import { useCreatePendingRefs } from "../../common/hooks/useCreatePendingRefs";

export function useInterventionReferenceData(requesterRole: Role, requesterUsername: string, onToast?: NotifyToast) {
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [intervenants, setIntervenants] = useState<IntervenantRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRows, intervenantRows] = await Promise.all([
        gtsApiClient.listSites({ requesterRole }),
        gtsApiClient.listIntervenants({ requesterRole })
      ]);
      setSites(siteRows);
      setIntervenants(intervenantRows);
    } catch (err) {
      setError(extractUserFacingErrorMessage(err, "Impossible de charger les référentiels intervention."));
    } finally {
      setLoading(false);
    }
  }, [requesterRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const { createPendingSite, createPendingIntervenant } = useCreatePendingRefs({
    requesterRole,
    requesterUsername,
    onToast,
    reload: load
  });

  return {
    sites,
    intervenants,
    loading,
    error,
    reload: load,
    createPendingSite,
    createPendingIntervenant
  };
}
