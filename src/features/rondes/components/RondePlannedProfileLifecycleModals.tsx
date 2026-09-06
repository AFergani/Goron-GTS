/**
 * Modales de confirmation du cycle de vie d'un profil planifié
 * (arrêt, demande d'arrêt, refus, suppression).
 */

import { ConfirmModal } from "../../common/components/ConfirmModal";
import { formatLocalDateIso } from "../model/rondeCalendarLocal";
import type { RondePlannedProfileLifecycle } from "../hooks/useRondePlannedProfileLifecycle";
import { RondeConfirmReasonField } from "./RondeConfirmReasonField";
import { RondePlannedStopPlanningModal } from "./RondePlannedStopPlanningModal";

type RondePlannedProfileLifecycleModalsProps = {
  lifecycle: RondePlannedProfileLifecycle;
  hasSetPlanningEnd: boolean;
  hasReviewCancellation: boolean;
  hasRequestCancellation: boolean;
  hasDelete: boolean;
};

export function RondePlannedProfileLifecycleModals({
  lifecycle: lc,
  hasSetPlanningEnd,
  hasReviewCancellation,
  hasRequestCancellation,
  hasDelete
}: RondePlannedProfileLifecycleModalsProps) {
  return (
    <>
      {hasSetPlanningEnd || hasReviewCancellation ? (
        <RondePlannedStopPlanningModal
          isOpen={Boolean(lc.stopTarget)}
          profileLabel={lc.stopTarget?.label || ""}
          defaultEndDate={lc.stopTarget?.planningValidTo || formatLocalDateIso(new Date())}
          onClose={lc.cancelStop}
          onConfirm={lc.confirmStop}
        />
      ) : null}

      {hasRequestCancellation ? (
        <ConfirmModal
          isOpen={Boolean(lc.requestTarget)}
          title="Demander l'annulation du flux"
          message={
            lc.requestTarget
              ? `Profil "${lc.requestTarget.label}" : expliquez pourquoi vous demandez l'arrêt de cette programmation.`
              : ""
          }
          confirmLabel={lc.requestSubmitting ? "Envoi…" : "Envoyer la demande"}
          confirmDisabled={lc.requestSubmitting || !lc.requestReason.trim()}
          onCancel={lc.cancelRequest}
          onConfirm={() => void lc.confirmRequestCancellation()}
        >
          <RondeConfirmReasonField
            value={lc.requestReason}
            onChange={lc.setRequestReason}
            placeholder="Ex. fin de contrat demandée par le client"
            disabled={lc.requestSubmitting}
            autoFocus
          />
        </ConfirmModal>
      ) : null}

      {hasReviewCancellation ? (
        <ConfirmModal
          isOpen={Boolean(lc.rejectTarget)}
          title="Refuser la demande d'annulation"
          message={
            lc.rejectTarget
              ? `Profil "${lc.rejectTarget.label}" : indiquez pourquoi la demande est refusée.`
              : ""
          }
          confirmLabel={lc.rejectSubmitting ? "Refus…" : "Refuser la demande"}
          confirmDisabled={lc.rejectSubmitting || !lc.rejectReason.trim()}
          onCancel={lc.cancelReject}
          onConfirm={() => void lc.confirmReject()}
        >
          <RondeConfirmReasonField
            value={lc.rejectReason}
            onChange={lc.setRejectReason}
            placeholder="Ex. arrêt non validé, contrat encore actif"
            disabled={lc.rejectSubmitting}
            autoFocus
          />
        </ConfirmModal>
      ) : null}

      {hasDelete ? (
        <ConfirmModal
          isOpen={Boolean(lc.deleteTarget)}
          title="Supprimer la programmation"
          message={
            lc.deleteTarget
              ? `Programmation: "${lc.deleteTarget.label}". Si des rondes clôturées sont liées, la programmation sera désactivée (historique préservé). Sinon, elle sera supprimée avec toutes ses rondes en cours.`
              : ""
          }
          confirmLabel={lc.deleteSubmitting ? "Suppression…" : "Confirmer"}
          confirmClassName="btn-danger"
          confirmDisabled={lc.deleteSubmitting || !lc.deleteReason.trim()}
          onCancel={lc.cancelDelete}
          onConfirm={() => void lc.confirmDelete()}
        >
          <RondeConfirmReasonField
            value={lc.deleteReason}
            onChange={lc.setDeleteReason}
            placeholder="Ex.: prestation annulée par le client"
            disabled={lc.deleteSubmitting}
            autoFocus
          />
        </ConfirmModal>
      ) : null}
    </>
  );
}
