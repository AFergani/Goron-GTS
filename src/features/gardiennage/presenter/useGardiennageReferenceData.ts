/**
 * Référentiels pour la page gardiennage : sites, prestataires, jours fériés.
 *
 * Charge les listes via l’API, fusionne les fériés fixes France avec le référentiel BDD.
 * Expose la création de site / prestataire « en attente » (workflow intervention partagé).
 *
 * Utilisé par : `GardiennagePage`, `GardiennageEntryModal`.
 */

import { useCallback, useEffect, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { HolidayRef, IntervenantRef, Role, SiteRef } from "../../../types";
import { mergeWithFrenchFixedHolidays } from "../../rondes/model/rondeCalendarLocal";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import type { NotifyToast } from "../../common/model/toast.types";
import { useCreatePendingRefs } from "../../common/hooks/useCreatePendingRefs";

export function useGardiennageReferenceData(requesterRole: Role, requesterUsername: string, onToast?: NotifyToast) {
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [intervenants, setIntervenants] = useState<IntervenantRef[]>([]);
  const [holidays, setHolidays] = useState<HolidayRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [siteRows, intervenantRows, holidayRows] = await Promise.all([
        gtsApiClient.listSites({ requesterRole }),
        gtsApiClient.listIntervenants({ requesterRole }),
        gtsApiClient.listHolidays({ requesterRole })
      ]);
      setSites(siteRows);
      setIntervenants(intervenantRows);
      const nowYear = new Date().getFullYear();
      const yearsFromRows = holidayRows
        .map((item) => Number(String(item.dateIso || "").slice(0, 4)))
        .filter((year) => Number.isFinite(year));
      setHolidays(mergeWithFrenchFixedHolidays(holidayRows, [nowYear - 1, nowYear, nowYear + 1, ...yearsFromRows]));
    } catch (err) {
      setError(extractUserFacingErrorMessage(err, "Impossible de charger les référentiels."));
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

  return { sites, intervenants, holidays, loading, error, reload: load, createPendingSite, createPendingIntervenant };
}
