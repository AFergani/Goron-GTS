/**
 * Actions « Site / prestataire introuvable » dans les modales de saisie métier.
 *
 * Affiche les boutons et les sous-formulaires de proposition de référentiel avant enregistrement
 * (workflow pending intervention). Masqué dès qu’un site ou intervenant du référentiel est sélectionné.
 * Libellés d’aide centralisés dans `pendingRefsBeforeSave`.
 */

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
  siteButtonLabel?: string;
  intervenantButtonLabel?: string;
  showSiteAction?: boolean;
  showIntervenantAction?: boolean;
};

/**
 * Boutons « Site introuvable » / « Intervenant introuvable » + formulaires enfants fournis par le parent.
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
  siteButtonLabel = "À créer ?",
  intervenantButtonLabel = "À créer ?",
  showSiteAction,
  showIntervenantAction
}: PendingSiteIntervenantRefActionsProps) {
  const showSiteButton = showSiteAction ?? !selectedSite;
  const showIntervenantButton = showIntervenantAction ?? (withIntervenant && !selectedIntervenant);

  void showPendingSiteForm;
  void showPendingIntervenantForm;
  void pendingSiteForm;
  void pendingIntervenantForm;

  return (
    <>
      {(showSiteButton || showIntervenantButton) && (
        <div className="pending-ref-inline-row">
          {showSiteButton ? (
            <button
              type="button"
              className="btn-light pending-ref-inline-action"
              title={PENDING_SITE_CREATE_HINT}
              aria-label={PENDING_SITE_CREATE_HINT}
              onClick={onTogglePendingSite}
            >
              {siteButtonLabel}
            </button>
          ) : null}
          {showIntervenantButton && onTogglePendingIntervenant ? (
            <button
              type="button"
              className="btn-light pending-ref-inline-action"
              title={PENDING_INTERVENANT_CREATE_HINT}
              aria-label={PENDING_INTERVENANT_CREATE_HINT}
              onClick={onTogglePendingIntervenant}
            >
              {intervenantButtonLabel}
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
