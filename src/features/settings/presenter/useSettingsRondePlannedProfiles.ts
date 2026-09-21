/**
 * CRUD des profils de planification de rondes (Paramètres / données).
 *
 * Utilisé par `useSettingsDataReferentials`.
 */

import { useCallback, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { NotifyToast } from "../../common/model/toast.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import type {
  RondePlannedProfilePayload,
  RondePlannedProfileRef
} from "../../rondes/model/rondePlanned.types";

/**
 * @param params.session - Session courante
 * @param params.onError - Message d’erreur utilisateur
 * @param params.onToast - Confirmation métier
 */
export function useSettingsRondePlannedProfiles({
  session,
  onError,
  onToast
}: {
  session: Session | null;
  onError: NotifyToast;
  onToast: NotifyToast;
}) {
  const [rondePlannedProfiles, setRondePlannedProfiles] = useState<RondePlannedProfileRef[]>([]);

  const loadRondePlannedProfiles = useCallback(async () => {
    if (!session) return;
    try {
      const data = await gtsApiClient.listRondePlannedProfiles({ requesterRole: session.user.role });
      setRondePlannedProfiles(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des profils de planification des rondes."));
    }
  }, [onError, session]);

  const onUpsertRondePlannedProfile = async (payload: RondePlannedProfilePayload) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      const result = await gtsApiClient.upsertRondePlannedProfile({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        ...payload,
        expectedUpdatedAt: payload.id
          ? rondePlannedProfiles.find((item) => item.id === payload.id)?.updatedAt ?? null
          : undefined
      });
      onToast(payload.id ? "Profil de planification mis à jour." : "Profil de planification créé.");
      await loadRondePlannedProfiles();
      return result;
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur à l'enregistrement du profil.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onDeleteRondePlannedProfile = async (id: string, reason: string) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      const result = await gtsApiClient.deleteRondePlannedProfile({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      const action = (result as { action?: string } | null)?.action;
      onToast(
        action === "deactivated"
          ? "Programmation désactivée (rondes clôturées conservées)."
          : "Profil de planification supprimé."
      );
      await loadRondePlannedProfiles();
      return result;
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur de suppression du profil.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onRequestRondePlannedProfileCancellation = async (id: string, reason: string) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      await gtsApiClient.requestRondePlannedProfileCancellation({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Demande d'annulation envoyée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Impossible d'envoyer la demande d'annulation.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onReviewRondePlannedProfileCancellationRequest = async (
    id: string,
    payload: { decision: "approve" | "reject"; reviewReason: string; planningEndDate?: string }
  ) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      await gtsApiClient.reviewRondePlannedProfileCancellationRequest({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        ...payload,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast(payload.decision === "approve" ? "Demande d'annulation acceptée." : "Demande d'annulation refusée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Impossible de traiter la demande d'annulation.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onSetRondePlannedProfilePlanningEnd = async (id: string, planningEndDate: string, reason: string) => {
    if (!session) throw new Error("Session inactive.");
    onError("");
    try {
      await gtsApiClient.setRondePlannedProfilePlanningEnd({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        planningEndDate,
        reason,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Date de fin de planification enregistrée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Impossible d'enregistrer la fin de planification.");
      onError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const onSetRondePlannedProfileValidated = async (id: string, validated: boolean) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.setRondePlannedProfileValidated({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        validated,
        expectedUpdatedAt: rondePlannedProfiles.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast(validated ? "Profil marqué comme validé." : "Validation du profil levée.");
      await loadRondePlannedProfiles();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Impossible de mettre à jour la validation du profil."));
    }
  };

  const resetRondePlannedProfiles = useCallback(() => {
    setRondePlannedProfiles([]);
  }, []);

  return {
    rondePlannedProfiles,
    loadRondePlannedProfiles,
    onUpsertRondePlannedProfile,
    onDeleteRondePlannedProfile,
    onRequestRondePlannedProfileCancellation,
    onReviewRondePlannedProfileCancellationRequest,
    onSetRondePlannedProfilePlanningEnd,
    onSetRondePlannedProfileValidated,
    resetRondePlannedProfiles
  };
}
