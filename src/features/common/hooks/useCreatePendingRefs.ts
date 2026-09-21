/**
 * Création de site / prestataire « en attente » (workflow partagé des pages métier).
 *
 * Centralise les toasts et le rechargement des référentiels après l’appel API.
 * Utilisé par les presenters main courante, intervention, ronde et gardiennage.
 */

import { useCallback } from "react";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Role } from "../../../types";
import type { NotifyToast } from "../model/toast.types";
import { extractUserFacingErrorMessage } from "../utils/extractUserFacingErrorMessage";

type UseCreatePendingRefsParams = {
  requesterRole: Role | undefined;
  requesterUsername: string;
  onToast?: NotifyToast;
  /** Recharge les listes validées après une proposition. */
  reload: () => Promise<void>;
};

/**
 * @param params.requesterRole - Rôle de session (aucun appel si absent)
 * @param params.requesterUsername - Acteur de la proposition
 * @param params.onToast - Retour utilisateur
 * @param params.reload - Rafraîchit les référentiels du presenter
 * @returns Callbacks `createPendingSite` / `createPendingIntervenant`
 */
export function useCreatePendingRefs({
  requesterRole,
  requesterUsername,
  onToast,
  reload
}: UseCreatePendingRefsParams) {
  const createPendingSite = useCallback(
    async (code: string, name: string) => {
      if (!requesterRole) return false;
      try {
        const response = await gtsApiClient.createPendingSite({
          requesterRole,
          requesterUsername,
          code,
          name
        });
        await reload();
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
    },
    [onToast, reload, requesterRole, requesterUsername]
  );

  const createPendingIntervenant = useCallback(
    async (name: string) => {
      if (!requesterRole) return false;
      try {
        const response = await gtsApiClient.createPendingIntervenant({
          requesterRole,
          requesterUsername,
          name
        });
        await reload();
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
    },
    [onToast, reload, requesterRole, requesterUsername]
  );

  return { createPendingSite, createPendingIntervenant };
}
