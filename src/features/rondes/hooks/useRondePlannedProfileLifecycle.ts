/**
 * Cycle de vie des profils planifiés : arrêt, demande d'arrêt, refus, suppression.
 * Partagé entre la modale d'édition, la file des demandes et la liste des profils.
 */

import { useState } from "react";
import type { Role } from "../../../types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { NotifyToast } from "../../common/model/toast.types";

export type RondePlannedProfileLifecycleHandlers = {
  onDeleteRondePlannedProfile?: (id: string, reason: string) => void | Promise<unknown>;
  onRequestRondePlannedProfileCancellation?: (id: string, reason: string) => void | Promise<void>;
  onReviewRondePlannedProfileCancellationRequest?: (
    id: string,
    payload: { decision: "approve" | "reject"; reviewReason: string; planningEndDate?: string }
  ) => void | Promise<void>;
  onSetRondePlannedProfilePlanningEnd?: (id: string, planningEndDate: string, reason: string) => void | Promise<void>;
  onReload: () => void | Promise<void>;
  onNotify?: NotifyToast;
  /** Appelé après une action réussie qui invalide l'édition en cours (ex. fermer la modale profil). */
  onAfterDestructiveSuccess?: (profileId: string) => void;
};

export function useRondePlannedProfileLifecycle(
  requesterRole: Role,
  handlers: RondePlannedProfileLifecycleHandlers
) {
  const [stopTarget, setStopTarget] = useState<RondePlannedProfileRef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RondePlannedProfileRef | null>(null);
  const [requestTarget, setRequestTarget] = useState<RondePlannedProfileRef | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RondePlannedProfileRef | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const canDelete = requesterRole === "RESPONSABLE" || requesterRole === "DEV";
  const canManageCancellation = requesterRole === "RESPONSABLE" || requesterRole === "DEV";

  const beginStop = (profile: RondePlannedProfileRef) => setStopTarget(profile);
  const beginDelete = (profile: RondePlannedProfileRef) => {
    setDeleteTarget(profile);
    setDeleteReason("");
  };
  const beginRequestCancellation = (profile: RondePlannedProfileRef) => {
    setRequestTarget(profile);
    setRequestReason("");
  };
  const beginReject = (profile: RondePlannedProfileRef) => {
    setRejectTarget(profile);
    setRejectReason("");
  };

  const confirmStop = async (planningEndDate: string, reason: string) => {
    if (!stopTarget) return;
    const id = stopTarget.id;
    if (stopTarget.cancellationRequestedAt && handlers.onReviewRondePlannedProfileCancellationRequest) {
      await Promise.resolve(
        handlers.onReviewRondePlannedProfileCancellationRequest(id, {
          decision: "approve",
          reviewReason: reason,
          planningEndDate
        })
      );
    } else if (handlers.onSetRondePlannedProfilePlanningEnd) {
      await Promise.resolve(handlers.onSetRondePlannedProfilePlanningEnd(id, planningEndDate, reason));
    } else {
      return;
    }
    setStopTarget(null);
    await handlers.onReload();
    handlers.onAfterDestructiveSuccess?.(id);
  };

  const confirmRequestCancellation = async () => {
    if (!requestTarget || !handlers.onRequestRondePlannedProfileCancellation) return;
    const reason = requestReason.trim();
    if (!reason) {
      handlers.onNotify?.("Le motif est obligatoire.", "warning");
      return;
    }
    try {
      setRequestSubmitting(true);
      await Promise.resolve(handlers.onRequestRondePlannedProfileCancellation(requestTarget.id, reason));
      setRequestTarget(null);
      setRequestReason("");
      await handlers.onReload();
    } catch (err) {
      handlers.onNotify?.(err instanceof Error ? err.message : "Demande impossible.", "error");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget || !handlers.onReviewRondePlannedProfileCancellationRequest) return;
    const reviewReason = rejectReason.trim();
    if (!reviewReason) {
      handlers.onNotify?.("Le motif est obligatoire.", "warning");
      return;
    }
    try {
      setRejectSubmitting(true);
      await Promise.resolve(
        handlers.onReviewRondePlannedProfileCancellationRequest(rejectTarget.id, {
          decision: "reject",
          reviewReason
        })
      );
      setRejectTarget(null);
      setRejectReason("");
      await handlers.onReload();
    } catch (err) {
      handlers.onNotify?.(err instanceof Error ? err.message : "Refus impossible.", "error");
    } finally {
      setRejectSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !handlers.onDeleteRondePlannedProfile) return;
    const reason = deleteReason.trim();
    if (!reason) {
      handlers.onNotify?.("Le motif est obligatoire.", "warning");
      return;
    }
    const id = deleteTarget.id;
    try {
      setDeleteSubmitting(true);
      await Promise.resolve(handlers.onDeleteRondePlannedProfile(id, reason));
      setDeleteTarget(null);
      setDeleteReason("");
      await handlers.onReload();
      handlers.onAfterDestructiveSuccess?.(id);
    } catch (err) {
      handlers.onNotify?.(err instanceof Error ? err.message : "Opération impossible.", "error");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return {
    canDelete,
    canManageCancellation,
    stopTarget,
    deleteTarget,
    requestTarget,
    rejectTarget,
    requestReason,
    setRequestReason,
    requestSubmitting,
    rejectReason,
    setRejectReason,
    rejectSubmitting,
    deleteReason,
    setDeleteReason,
    deleteSubmitting,
    beginStop,
    beginDelete,
    beginRequestCancellation,
    beginReject,
    confirmStop,
    confirmRequestCancellation,
    confirmReject,
    confirmDelete,
    cancelStop: () => setStopTarget(null),
    cancelDelete: () => {
      if (!deleteSubmitting) setDeleteTarget(null);
    },
    cancelRequest: () => {
      if (!requestSubmitting) setRequestTarget(null);
    },
    cancelReject: () => {
      if (!rejectSubmitting) setRejectTarget(null);
    }
  };
}

export type RondePlannedProfileLifecycle = ReturnType<typeof useRondePlannedProfileLifecycle>;
