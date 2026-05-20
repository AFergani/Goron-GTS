import { useCallback, useEffect, useMemo, useState } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { FransorClosure, FransorEntry, FransorMonthlyRecap, FransorResponsableRef, HolidayRef, Role } from "../../../types";
import { mergeWithFrenchFixedHolidays } from "../../rondes/model/rondeCalendarLocal";

function getCurrentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function useFransorPresenter({
  requesterRole,
  requesterUsername,
  onToast
}: {
  requesterRole: Role;
  requesterUsername: string;
  onToast?: (message: string) => void;
}) {
  const [month, setMonth] = useState(getCurrentMonth);
  const [loading, setLoading] = useState(false);
  const [responsables, setResponsables] = useState<FransorResponsableRef[]>([]);
  const [entries, setEntries] = useState<FransorEntry[]>([]);
  const [closures, setClosures] = useState<FransorClosure[]>([]);
  const [recap, setRecap] = useState<FransorMonthlyRecap[]>([]);
  const [holidays, setHolidays] = useState<HolidayRef[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [resRows, entryRows, closureRows, recapRows, holidayRows] = await Promise.all([
        gtsApiClient.listFransorResponsables({ requesterRole }),
        gtsApiClient.listFransorEntriesByMonth({ requesterRole, month }),
        gtsApiClient.listFransorClosures({ requesterRole, month }),
        gtsApiClient.listFransorMonthlyRecap({ requesterRole, month }),
        gtsApiClient.listHolidays({ requesterRole })
      ]);
      const yearsFromRows = holidayRows
        .map((h) => Number(String(h.dateIso || "").slice(0, 4)))
        .filter((year) => Number.isFinite(year));
      const nowYear = new Date().getFullYear();
      const mergedHolidays = mergeWithFrenchFixedHolidays(holidayRows, [nowYear - 1, nowYear, nowYear + 1, ...yearsFromRows]);
      setResponsables(resRows);
      setEntries(entryRows);
      setClosures(closureRows);
      setRecap(recapRows);
      setHolidays(mergedHolidays);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Erreur de chargement Fransor.");
    } finally {
      setLoading(false);
    }
  }, [month, onToast, requesterRole]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertEntry = useCallback(
    async (payload: { date: string; responsableId: string; ouvertureDone: boolean; fermetureDone: boolean }) => {
      await gtsApiClient.upsertFransorEntry({
        requesterRole,
        requesterUsername,
        ...payload
      });
      await refresh();
    },
    [refresh, requesterRole, requesterUsername]
  );

  const createResponsable = useCallback(
    async (name: string) => {
      await gtsApiClient.createFransorResponsable({
        requesterRole,
        requesterUsername,
        name
      });
      await refresh();
    },
    [refresh, requesterRole, requesterUsername]
  );

  const deleteResponsable = useCallback(
    async (id: string) => {
      await gtsApiClient.deleteFransorResponsable({
        requesterRole,
        requesterUsername,
        id,
        reason: "Suppression depuis l'onglet Fransor"
      });
      await refresh();
    },
    [refresh, requesterRole, requesterUsername]
  );

  const upsertClosure = useCallback(
    async (payload: { id?: string; startDate: string; endDate?: string; label: string; mode: "CLOSED" | "OPEN" }) => {
      await gtsApiClient.upsertFransorClosure({
        requesterRole,
        requesterUsername,
        ...payload
      });
      await refresh();
    },
    [refresh, requesterRole, requesterUsername]
  );

  const deleteClosure = useCallback(
    async (id: string, reason: string) => {
      await gtsApiClient.deleteFransorClosure({
        requesterRole,
        requesterUsername,
        id,
        reason
      });
      await refresh();
    },
    [refresh, requesterRole, requesterUsername]
  );

  const entryMap = useMemo(() => {
    const map = new Map<string, FransorEntry>();
    for (const entry of entries) {
      map.set(`${entry.date}:${entry.responsableId}`, entry);
    }
    return map;
  }, [entries]);

  return {
    month,
    setMonth,
    loading,
    responsables,
    entries,
    closures,
    recap,
    holidays,
    entryMap,
    refresh,
    upsertEntry,
    createResponsable,
    deleteResponsable,
    upsertClosure,
    deleteClosure
  };
}
