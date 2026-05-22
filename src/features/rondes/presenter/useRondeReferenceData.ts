/**
 * Référentiels page Rondes : sites, prestataires, motifs, profils planifiés, fériés.
 *
 * Rafraîchissement périodique. Création site/prestataire en attente (workflow partagé).
 * Les listes pending complètes sont gérées dans Paramètres (non exposées ici).
 */

import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import type { RondeMotifTypeRef } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { mergeWithFrenchFixedHolidays } from "../model/rondeCalendarLocal";

export function useRondeReferenceData(requesterRole: Role, requesterUsername: string, onToast?: (message: string) => void) {
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [intervenants, setIntervenants] = useState<IntervenantRef[]>([]);
  const [rondeMotifs, setRondeMotifs] = useState<RondeMotifTypeRef[]>([]);
  const [plannedProfiles, setPlannedProfiles] = useState<RondePlannedProfileRef[]>([]);
  const [holidays, setHolidays] = useState<HolidayRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRows, intervenantRows, motifRows, plannedRows, holidayRows] = await Promise.all([
        gtsApiClient.listSites({ requesterRole }),
        gtsApiClient.listIntervenants({ requesterRole }),
        gtsApiClient.listRondeMotifTypes({ requesterRole }),
        gtsApiClient.listRondePlannedProfiles({ requesterRole }),
        gtsApiClient.listHolidays({ requesterRole })
      ]);
      setSites(siteRows);
      setIntervenants(intervenantRows);
      setRondeMotifs(motifRows);
      setPlannedProfiles(plannedRows);
      const nowYear = new Date().getFullYear();
      const yearsFromRows = holidayRows
        .map((item) => Number(String(item.dateIso || "").slice(0, 4)))
        .filter((year) => Number.isFinite(year));
      setHolidays(mergeWithFrenchFixedHolidays(holidayRows, [nowYear - 1, nowYear, nowYear + 1, ...yearsFromRows]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les référentiels ronde.");
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
    rondeMotifs,
    plannedProfiles,
    holidays,
    loading,
    error,
    reload: load,
    createPendingSite,
    createPendingIntervenant
  };
}
