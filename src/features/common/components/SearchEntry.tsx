/**
 * Bloc partagé pour la recherche de site et prestataire avec création rapide.
 *
 * Une ligne contient le champ de recherche suivi du bouton « À créer ? ».
 * Les formulaires de création s’affichent sous la ligne concernée, sans dupliquer la logique dans chaque modale.
 */

import type { ReactNode } from "react";
import type { IntervenantRef, SiteRef } from "../../../types";
import { SiteSearchInput } from "../../mainCourante/components/SiteSearchInput";
import { IntervenantSearchInput } from "../../intervention/components/IntervenantSearchInput";

type SearchEntryProps = {
  sites: SiteRef[];
  intervenants?: IntervenantRef[];
  selectedSite: SiteRef | null;
  selectedIntervenant?: IntervenantRef | null;
  onSelectedSiteChange: (site: SiteRef | null) => void;
  onSelectedIntervenantChange?: (intervenant: IntervenantRef | null) => void;
  showPendingSiteForm: boolean;
  showPendingIntervenantForm?: boolean;
  onTogglePendingSite: () => void;
  onTogglePendingIntervenant?: () => void;
  pendingSiteForm?: ReactNode;
  pendingIntervenantForm?: ReactNode;
  onNotify?: (message: string) => void;
  siteButtonLabel?: string;
  intervenantButtonLabel?: string;
  showSiteAction?: boolean;
  showIntervenantAction?: boolean;
  showSiteField?: boolean;
  showIntervenantField?: boolean;
  siteLabel?: string | null;
  intervenantLabel?: string | null;
};

export function SearchEntry({
  sites,
  intervenants = [],
  selectedSite,
  selectedIntervenant = null,
  onSelectedSiteChange,
  onSelectedIntervenantChange,
  showPendingSiteForm,
  showPendingIntervenantForm = false,
  onTogglePendingSite,
  onTogglePendingIntervenant,
  pendingSiteForm,
  pendingIntervenantForm,
  onNotify,
  siteButtonLabel = "À créer ?",
  intervenantButtonLabel = "À créer ?",
  showSiteAction,
  showIntervenantAction,
  showSiteField = true,
  showIntervenantField = true,
  siteLabel = "Site",
  intervenantLabel = "Prestataire"
}: SearchEntryProps) {
  return (
    <div className="mc-form-grid mc-form-grid-main">
      {showSiteField ? (
        <div className="mc-field-with-inline-action">
          <SiteSearchInput
            sites={sites}
            selectedSite={selectedSite}
            onSelectedSiteChange={onSelectedSiteChange}
            copyNotify={onNotify}
            showPendingSiteForm={showPendingSiteForm}
            onTogglePendingSite={onTogglePendingSite}
            pendingSiteForm={pendingSiteForm}
            siteButtonLabel={siteButtonLabel}
            showSiteAction={showSiteAction ?? !selectedSite}
            labelText={siteLabel}
          />
        </div>
      ) : null}

      {showIntervenantField ? (
        <div className="mc-field-with-inline-action">
          <IntervenantSearchInput
            intervenants={intervenants}
            selectedIntervenant={selectedIntervenant}
            onSelectedIntervenantChange={onSelectedIntervenantChange ?? (() => {})}
            selectedSite={selectedSite}
            showPendingIntervenantForm={showPendingIntervenantForm}
            onTogglePendingIntervenant={onTogglePendingIntervenant}
            pendingIntervenantForm={pendingIntervenantForm}
            intervenantButtonLabel={intervenantButtonLabel}
            showIntervenantAction={showIntervenantAction ?? !selectedIntervenant}
            labelText={intervenantLabel}
          />
        </div>
      ) : null}
    </div>
  );
}
