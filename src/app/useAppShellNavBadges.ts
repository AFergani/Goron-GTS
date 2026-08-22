/**
 * Compteurs des badges de navigation (sidebar) : polling PostgreSQL toutes les 5 s.
 *
 * Isolé de `AppShell` pour éviter cinq `useEffect` copiés-collés. S'arrête et remet
 * les compteurs à 0 hors session ou sans le droit de page correspondant.
 */

import { useState } from "react";
import { useEnabledInterval } from "../features/common/hooks/useEnabledInterval";
import { getLocalDateIso } from "../features/common/utils/localDateIso";
import { gtsApiClient } from "../infrastructure/api/gtsApiClient";
import type { Session } from "./session/SessionProvider";

const NAV_BADGE_POLL_MS = 5000;

/**
 * Interprète un compteur API (repli 0 si valeur invalide).
 *
 * @param value - Entier ou nombre issu du backend.
 */
function asCount(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

/**
 * Poll les badges sidebar tant que la session (et le droit page) le permettent.
 *
 * @param session - Session courante, ou `null` hors connexion.
 * @param isManager - RESPONSABLE ou DEV (badge main courante « non consultées »).
 * @param canAccessRondes - Droit page rondes.
 * @param canAccessGardiennage - Droit page gardiennage.
 */
export function useAppShellNavBadges(
  session: Session,
  isManager: boolean,
  canAccessRondes: boolean,
  canAccessGardiennage: boolean
) {
  const [interventionOpenCount, setInterventionOpenCount] = useState(0);
  const [mainCouranteUnconsultedCount, setMainCouranteUnconsultedCount] = useState(0);
  const [mainCouranteOperatorResponseCount, setMainCouranteOperatorResponseCount] = useState(0);
  const [rondeTodayInProgressCount, setRondeTodayInProgressCount] = useState(0);
  const [gardiennageTodayInProgressCount, setGardiennageTodayInProgressCount] = useState(0);

  const hasSession = Boolean(session);
  const role = session?.user.role;

  useEnabledInterval(
    hasSession,
    NAV_BADGE_POLL_MS,
    async () => {
      if (!role) return;
      try {
        const result = await gtsApiClient.getInterventionOpenCount({ requesterRole: role });
        setInterventionOpenCount(asCount(result.count));
      } catch {
        setInterventionOpenCount(0);
      }
    },
    [role],
    () => setInterventionOpenCount(0)
  );

  useEnabledInterval(
    hasSession && isManager,
    NAV_BADGE_POLL_MS,
    async () => {
      if (!role) return;
      try {
        const result = await gtsApiClient.getMainCouranteUnconsultedCount({ requesterRole: role });
        setMainCouranteUnconsultedCount(asCount(result.count));
      } catch {
        setMainCouranteUnconsultedCount(0);
      }
    },
    [role],
    () => setMainCouranteUnconsultedCount(0)
  );

  useEnabledInterval(
    hasSession && !isManager,
    NAV_BADGE_POLL_MS,
    async () => {
      if (!role) return;
      try {
        const result = await gtsApiClient.getMainCouranteOperatorResponseCount({ requesterRole: role });
        setMainCouranteOperatorResponseCount(asCount(result.count));
      } catch {
        setMainCouranteOperatorResponseCount(0);
      }
    },
    [role],
    () => setMainCouranteOperatorResponseCount(0)
  );

  useEnabledInterval(
    hasSession && canAccessRondes,
    NAV_BADGE_POLL_MS,
    async () => {
      if (!role) return;
      try {
        const result = await gtsApiClient.getRondeTodayInProgressCounts({
          requesterRole: role,
          todayIso: getLocalDateIso()
        });
        setRondeTodayInProgressCount(asCount(result.total));
      } catch {
        setRondeTodayInProgressCount(0);
      }
    },
    [role],
    () => setRondeTodayInProgressCount(0)
  );

  useEnabledInterval(
    hasSession && canAccessGardiennage,
    NAV_BADGE_POLL_MS,
    async () => {
      if (!role) return;
      try {
        const result = await gtsApiClient.getGardiennageTodayInProgressCount({
          requesterRole: role,
          todayIso: getLocalDateIso()
        });
        setGardiennageTodayInProgressCount(asCount(result.count));
      } catch {
        setGardiennageTodayInProgressCount(0);
      }
    },
    [role],
    () => setGardiennageTodayInProgressCount(0)
  );

  return {
    interventionOpenCount,
    mainCouranteUnconsultedCount,
    mainCouranteOperatorResponseCount,
    rondeTodayInProgressCount,
    gardiennageTodayInProgressCount
  };
}
