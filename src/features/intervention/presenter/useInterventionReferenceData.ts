/**
 * Référentiels page Interventions : sites, prestataires, création pending.
 *
 * Les listes « en attente » sont gérées dans Paramètres ; ici seuls sites/intervenants
 * validés + callbacks `createPending*` pour les modales de saisie.
 *
 * Utilisé par : `InterventionPage`, `InterventionEntryModal` (via la page).
 * `IntervenantSearchInput` réutilisé aussi par rondes et gardiennage.
 */

import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { IntervenantRef, Role, SiteRef } from "../../../types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import type { NotifyToast } from "../../common/model/toast.types";

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
        onToast?.("Ce site existe déjà ou est déjà en attente de validation.", "warning");
      } else {
        onToast?.("Site ajouté en attente de validation.");
      }
      return true;
    } catch (error) {
      onToast?.(extractUserFacingErrorMessage(error, "Impossible d'ajouter le site en attente."), "error");
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
        onToast?.("Cet intervenant existe déjà ou est déjà en attente de validation.", "warning");
      } else {
        onToast?.("Intervenant ajouté en attente de validation.");
      }
      return true;
    } catch (error) {
      onToast?.(extractUserFacingErrorMessage(error, "Impossible d'ajouter l'intervenant en attente."), "error");
      return false;
    }
  };

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
