/**
 * Meta demande : date/heure, site, prestataire, motif.
 */

import type { IntervenantRef, SiteRef } from "../../../types";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import { IntervenantSearchInput } from "../../common/components/IntervenantSearchInput";
import { TimeInput } from "../../common/components/TimeInput";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import type { NotifyToast } from "../../common/model/toast.types";

type InterventionRequestMetaSectionProps = {
  isCreateMode: boolean;
  canFixKnownReferences: boolean;
  formLockedClosed: boolean;
  lockCoreFields: boolean;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  selectedSite: SiteRef | null;
  selectedIntervenant: IntervenantRef | null;
  entrySiteDisplay?: string;
  entryIntervenantName?: string;
  requestDate: string;
  requestTime: string;
  requestReason: string;
  pendingCode: string;
  pendingName: string;
  pendingIntervenantName: string;
  showPendingSiteForm: boolean;
  showPendingIntervenantForm: boolean;
  onNotify?: NotifyToast;
  onRequestDateChange: (value: string) => void;
  onRequestTimeChange: (value: string) => void;
  onRequestReasonChange: (value: string) => void;
  onSelectedSiteChange: (site: SiteRef | null) => void;
  onSelectedIntervenantChange: (item: IntervenantRef | null) => void;
  onPendingCodeChange: (value: string) => void;
  onPendingNameChange: (value: string) => void;
  onPendingIntervenantNameChange: (value: string) => void;
  onTogglePendingSite: () => void;
  onTogglePendingIntervenant: () => void;
  onClearPendingSiteFields: () => void;
  onClearPendingIntervenantFields: () => void;
};

export function InterventionRequestMetaSection(props: InterventionRequestMetaSectionProps) {
  const {
    isCreateMode,
    canFixKnownReferences,
    formLockedClosed,
    lockCoreFields,
    sites,
    intervenants,
    selectedSite,
    selectedIntervenant,
    entrySiteDisplay,
    entryIntervenantName,
    requestDate,
    requestTime,
    requestReason,
    pendingCode,
    pendingName,
    pendingIntervenantName,
    showPendingSiteForm,
    showPendingIntervenantForm,
    onNotify,
    onRequestDateChange,
    onRequestTimeChange,
    onRequestReasonChange,
    onSelectedSiteChange,
    onSelectedIntervenantChange,
    onPendingCodeChange,
    onPendingNameChange,
    onPendingIntervenantNameChange,
    onTogglePendingSite,
    onTogglePendingIntervenant,
    onClearPendingSiteFields,
    onClearPendingIntervenantFields
  } = props;

  return (
    <>
      <div className="mc-form-grid intervention-request-meta-grid">
        <label className="mc-field">
          <span>Date de la demande</span>
          <input
            type="date"
            value={requestDate}
            disabled={formLockedClosed}
            onChange={(e) => onRequestDateChange(e.target.value)}
          />
        </label>
        <label className="mc-field">
          <span>Heure de la demande</span>
          <TimeInput value={requestTime} disabled={formLockedClosed} onChange={onRequestTimeChange} />
        </label>
        {isCreateMode ? (
          <>
            <SiteSearchInput
              sites={sites}
              selectedSite={selectedSite}
              onSelectedSiteChange={(site) => {
                onSelectedSiteChange(site);
                if (site) onClearPendingSiteFields();
              }}
              copyNotify={onNotify}
              showPendingSiteForm={showPendingSiteForm}
              onTogglePendingSite={onTogglePendingSite}
              siteButtonLabel="À créer ?"
              showSiteAction={!selectedSite}
              pendingSiteForm={(
                <div className="mc-form-grid mc-form-grid-main">
                  <label className="mc-field">
                    <span>Nouveau code site</span>
                    <input value={pendingCode} onChange={(e) => onPendingCodeChange(e.target.value)} />
                  </label>
                  <label className="mc-field">
                    <span>Nouveau nom de site</span>
                    <input value={pendingName} onChange={(e) => onPendingNameChange(e.target.value)} />
                  </label>
                </div>
              )}
            />
            <IntervenantSearchInput
              intervenants={intervenants}
              selectedIntervenant={selectedIntervenant}
              onSelectedIntervenantChange={(item) => {
                onSelectedIntervenantChange(item);
                if (item) onClearPendingIntervenantFields();
              }}
              selectedSite={selectedSite}
              showPendingIntervenantForm={showPendingIntervenantForm}
              onTogglePendingIntervenant={onTogglePendingIntervenant}
              intervenantButtonLabel="À créer ?"
              showIntervenantAction={!selectedIntervenant}
              pendingIntervenantForm={(
                <div className="mc-form-grid mc-form-grid-main">
                  <label className="mc-field mc-field-full">
                    <span>Nouveau prestataire</span>
                    <input
                      value={pendingIntervenantName}
                      onChange={(e) => onPendingIntervenantNameChange(e.target.value)}
                    />
                  </label>
                </div>
              )}
            />
          </>
        ) : canFixKnownReferences ? (
          <>
            <SiteSearchInput
              sites={sites}
              disabled={formLockedClosed}
              selectedSite={selectedSite}
              onSelectedSiteChange={onSelectedSiteChange}
              copyNotify={onNotify}
            />
            <IntervenantSearchInput
              intervenants={intervenants}
              disabled={formLockedClosed}
              selectedIntervenant={selectedIntervenant}
              onSelectedIntervenantChange={onSelectedIntervenantChange}
            />
          </>
        ) : (
          <>
            <label className="mc-field">
              <span>Site</span>
              <SiteDisplayCopyButton
                siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entrySiteDisplay || ""}
                onNotify={onNotify}
              />
            </label>
            <label className="mc-field">
              <span>Prestataire</span>
              <input
                value={selectedIntervenant?.name || entryIntervenantName || "—"}
                readOnly
                className="mc-input-readonly"
              />
            </label>
          </>
        )}
      </div>

      <label className="mc-field mc-field-full">
        <span>Motif</span>
        <textarea
          value={requestReason}
          disabled={lockCoreFields || formLockedClosed}
          onChange={(e) => onRequestReasonChange(e.target.value)}
          className={`mc-textarea intervention-motif-textarea ${lockCoreFields || formLockedClosed ? "mc-textarea-readonly" : ""}`}
        />
      </label>
    </>
  );
}
