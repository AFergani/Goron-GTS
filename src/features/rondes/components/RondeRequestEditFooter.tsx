/**
 * Pied de modale demande : fermer, cycle de vie profil, créer / enregistrer.
 */

type RondeRequestEditFooterProps = {
  submitting: boolean;
  isEdit: boolean;
  isLinkedExistingBatch: boolean;
  /** Masque le bouton Enregistrer / Créer (ex. opérateur en consultation). */
  hideSubmit?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onStopProfile?: () => void;
  onRequestStopProfile?: () => void;
  onDeleteProfile?: () => void;
};

export function RondeRequestEditFooter({
  submitting,
  isEdit,
  isLinkedExistingBatch,
  hideSubmit = false,
  onClose,
  onSubmit,
  onStopProfile,
  onRequestStopProfile,
  onDeleteProfile
}: RondeRequestEditFooterProps) {
  return (
    <div className="row-actions modal-actions ronde-request-modal__footer">
      <button type="button" className="btn-light" onClick={onClose}>
        Fermer
      </button>
      <div className="row-actions ronde-request-modal__footer-right">
        {isEdit && onStopProfile ? (
          <button type="button" className="btn-light" onClick={onStopProfile} disabled={submitting}>
            Arrêter
          </button>
        ) : null}
        {isEdit && !onStopProfile && onRequestStopProfile ? (
          <button type="button" className="btn-light" onClick={onRequestStopProfile} disabled={submitting}>
            Demander l&apos;arrêt
          </button>
        ) : null}
        {isEdit && onDeleteProfile ? (
          <button type="button" className="btn-danger" onClick={onDeleteProfile} disabled={submitting}>
            Supprimer
          </button>
        ) : null}
        {!hideSubmit ? (
          <button
            type="button"
            className={isEdit || isLinkedExistingBatch ? undefined : "entry-create-submit"}
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting
              ? "Enregistrement…"
              : isEdit
                ? "Enregistrer"
                : isLinkedExistingBatch
                  ? "Enregistrer les modifications du lot"
                  : "Créer"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
