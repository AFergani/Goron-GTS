import type { ReactNode } from "react";
import type { IntervenantRef, SiteRef } from "../../../types";
import {
  PENDING_INTERVENANT_CREATE_HINT,
  PENDING_SITE_CREATE_HINT
} from "../utils/pendingRefsBeforeSave";

type PendingSiteIntervenantRefActionsProps = {
  /** Afficher le bloc prestataire introuvable (défaut : true). */
  withIntervenant?: boolean;
  selectedSite: SiteRef | null;
  selectedIntervenant?: IntervenantRef | null;
  showPendingSiteForm: boolean;
  showPendingIntervenantForm?: boolean;
  onTogglePendingSite: () => void;
  onTogglePendingIntervenant?: () => void;
  pendingSiteForm: ReactNode;
  pendingIntervenantForm?: ReactNode;
  intervenantButtonLabel?: string;
};

/**
 * Boutons « Site / prestataire introuvable » + formulaires associés.
 * Masqués dès qu’une entrée du référentiel est sélectionnée.
 */
export function PendingSiteIntervenantRefActions({
  withIntervenant = true,
  selectedSite,
  selectedIntervenant = null,
  showPendingSiteForm,
  showPendingIntervenantForm = false,
  onTogglePendingSite,
  onTogglePendingIntervenant,
  pendingSiteForm,
  pendingIntervenantForm,
  intervenantButtonLabel = "Intervenant introuvable"
}: PendingSiteIntervenantRefActionsProps) {
  const showSiteButton = !selectedSite;
  const showIntervenantButton = withIntervenant && !selectedIntervenant;

  return (
    <>
      {showSiteButton || showIntervenantButton ? (
        <div className="row-actions">
          {showSiteButton ? (
            <button
              type="button"
              className="btn-light"
              title={PENDING_SITE_CREATE_HINT}
              aria-label={PENDING_SITE_CREATE_HINT}
              onClick={onTogglePendingSite}
            >
              Site introuvable
            </button>
          ) : null}
          {showIntervenantButton && onTogglePendingIntervenant ? (
            <button
              type="button"
              className="btn-light"
              title={PENDING_INTERVENANT_CREATE_HINT}
              aria-label={PENDING_INTERVENANT_CREATE_HINT}
              onClick={onTogglePendingIntervenant}
            >
              {intervenantButtonLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      {showPendingSiteForm && !selectedSite ? pendingSiteForm : null}
      {withIntervenant && showPendingIntervenantForm && !selectedIntervenant ? pendingIntervenantForm : null}
    </>
  );
}
