/**
 * Modales de confirmation du cycle de vie d'un profil planifié
 * (arrêt, demande d'arrêt, refus, suppression).
 */

import { ConfirmModal } from "../../common/components/ConfirmModal";
import { formatLocalDateIso } from "../model/rondeCalendarLocal";
import type { RondePlannedProfileLifecycle } from "../hooks/useRondePlannedProfileLifecycle";
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
      {(hasSetPlanningEnd || hasReviewCancellation) ? (
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
          <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
              Motif (obligatoire) <span className="text-error">*</span>
            </span>
            <textarea
              className="mc-textarea"
              value={lc.requestReason}
              onChange={(e) => lc.setRequestReason(e.target.value)}
              rows={3}
              placeholder="Ex. fin de contrat demandée par le client"
              disabled={lc.requestSubmitting}
              autoFocus
            />
          </label>
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
          <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
              Motif (obligatoire) <span className="text-error">*</span>
            </span>
            <textarea
              className="mc-textarea"
              value={lc.rejectReason}
              onChange={(e) => lc.setRejectReason(e.target.value)}
              rows={3}
              placeholder="Ex. arrêt non validé, contrat encore actif"
              disabled={lc.rejectSubmitting}
              autoFocus
            />
          </label>
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
          <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
              Motif (obligatoire) <span className="text-error">*</span>
            </span>
            <textarea
              className="mc-textarea"
              value={lc.deleteReason}
              onChange={(e) => lc.setDeleteReason(e.target.value)}
              rows={3}
              placeholder="Ex.: prestation annulée par le client"
              disabled={lc.deleteSubmitting}
              autoFocus
            />
          </label>
        </ConfirmModal>
      ) : null}
    </>
  );
}
