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

export function useInterventionReferenceData(requesterRole: Role, requesterUsername: string, onToast?: (message: string) => void) {
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
    loading,
    error,
    reload: load,
    createPendingSite,
    createPendingIntervenant
  };
}
