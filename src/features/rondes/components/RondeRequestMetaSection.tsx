/**
 * Meta demande : date/heure, motif, origine, site, prestataire, consigne.
 */

import type { IntervenantRef, SiteRef } from "../../../types";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import { IntervenantSearchInput } from "../../common/components/IntervenantSearchInput";
import { SearchEntry } from "../../common/components/SearchEntry";
import { TimeInput } from "../../common/components/TimeInput";
import type { NotifyToast } from "../../common/model/toast.types";
import type { RondeMotifTypeRef } from "../model/ronde.types";
import type { RequestOrigin } from "../model/requestOrigin";

type RondeRequestMetaSectionProps = {
  requestDate: string;
  requestTime: string;
  motifTypeId: string;
  origin: RequestOrigin;
  originLabel: string;
  isOriginFixed: boolean;
  isEdit: boolean;
  isLinkedExistingBatch: boolean;
  isContract: boolean;
  /** Verrouille toute la saisie (consultation opérateur). */
  readOnly?: boolean;
  canCreatePendingRefs: boolean;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  rondeMotifs: RondeMotifTypeRef[];
  selectedSite: SiteRef | null;
  selectedIntervenant: IntervenantRef | null;
  showPendingSiteForm: boolean;
  showPendingIntervenantForm: boolean;
  pendingCode: string;
  pendingName: string;
  pendingIntervenantName: string;
  consigne: string;
  motifDetail: string;
  onNotify?: NotifyToast;
  onRequestDateChange: (value: string) => void;
  onRequestTimeChange: (value: string) => void;
  onMotifTypeIdChange: (value: string) => void;
  onOriginChange: (value: RequestOrigin) => void;
  clientName: string;
  onClientNameChange: (value: string) => void;
  onConsigneChange: (value: string) => void;
  onMotifDetailChange: (value: string) => void;
  onSiteIdChange: (id: string | null) => void;
  onIntervenantIdChange: (id: string) => void;
  onTogglePendingSite: () => void;
  onTogglePendingIntervenant: () => void;
  onPendingCodeChange: (value: string) => void;
  onPendingNameChange: (value: string) => void;
  onPendingIntervenantNameChange: (value: string) => void;
  onClearPendingSite: () => void;
  onClearPendingIntervenant: () => void;
};

export function RondeRequestMetaSection(props: RondeRequestMetaSectionProps) {
  const locked = Boolean(props.readOnly);
  return (
    <>
      <div className="ronde-planned-profile-modal__schedule-row">
        <label className="ronde-planned-profile-modal__schedule-field">
          <span>Date de la demande</span>
          <input
            type="date"
            value={props.requestDate}
            disabled={locked}
            onChange={(e) => props.onRequestDateChange(e.target.value)}
          />
        </label>
        <label className="ronde-planned-profile-modal__schedule-field">
          <span>Heure de la demande</span>
          <TimeInput value={props.requestTime} disabled={locked} onChange={props.onRequestTimeChange} />
        </label>
        <label className="ronde-planned-profile-modal__schedule-field ronde-planned-profile-modal__schedule-field--motif">
          <span>Motif de la demande</span>
          <select
            value={props.motifTypeId}
            disabled={locked || props.isEdit || props.isLinkedExistingBatch}
            onChange={(e) => props.onMotifTypeIdChange(e.target.value)}
          >
            {props.rondeMotifs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ronde-planned-profile-modal__schedule-field ronde-planned-profile-modal__schedule-field--origin">
          <span>Origine</span>
          {props.isOriginFixed || locked ? (
            <span className="ronde-origin-badge" title={props.originLabel}>
              {props.originLabel}
            </span>
          ) : (
            <select value={props.origin} onChange={(e) => props.onOriginChange(e.target.value as RequestOrigin)}>
              <option value="CONTRAT">Contrat</option>
              <option value="APPEL_CLIENT">Client</option>
              <option value="SUITE_INTERVENTION">Suite intervention</option>
              <option value="AUTRE">Autre</option>
            </select>
          )}
        </label>
      </div>

      {!props.isEdit && !props.isLinkedExistingBatch && !props.isContract && props.canCreatePendingRefs && !locked ? (
        <SearchEntry
          sites={props.sites}
          intervenants={props.intervenants}
          selectedSite={props.selectedSite}
          selectedIntervenant={props.selectedIntervenant}
          onSelectedSiteChange={(s: SiteRef | null) => {
            props.onSiteIdChange(s?.id ?? null);
            if (s) props.onClearPendingSite();
          }}
          onSelectedIntervenantChange={(i: IntervenantRef | null) => {
            props.onIntervenantIdChange(i?.id ?? "");
            if (i) props.onClearPendingIntervenant();
          }}
          showPendingSiteForm={props.showPendingSiteForm}
          showPendingIntervenantForm={props.showPendingIntervenantForm}
          onTogglePendingSite={props.onTogglePendingSite}
          onTogglePendingIntervenant={props.onTogglePendingIntervenant}
          pendingSiteForm={(
            <div className="mc-form-grid mc-form-grid-main">
              <label className="mc-field">
                <span>Nouveau code site</span>
                <input value={props.pendingCode} onChange={(e) => props.onPendingCodeChange(e.target.value)} />
              </label>
              <label className="mc-field">
                <span>Nouveau nom de site</span>
                <input value={props.pendingName} onChange={(e) => props.onPendingNameChange(e.target.value)} />
              </label>
            </div>
          )}
          pendingIntervenantForm={(
            <div className="mc-form-grid mc-form-grid-main">
              <label className="mc-field mc-field-full">
                <span>Nouvel intervenant</span>
                <input
                  value={props.pendingIntervenantName}
                  onChange={(e) => props.onPendingIntervenantNameChange(e.target.value)}
                />
              </label>
            </div>
          )}
          onNotify={props.onNotify}
          showSiteAction={!props.selectedSite}
          showIntervenantAction={!props.selectedIntervenant}
        />
      ) : (
        <div className="ronde-planned-profile-modal__site-prest-row">
          <SiteSearchInput
            sites={props.sites}
            disabled={locked}
            selectedSite={props.selectedSite}
            copyNotify={props.onNotify}
            labelText="Site"
            onSelectedSiteChange={(s) => {
              props.onSiteIdChange(s?.id ?? null);
              if (s) props.onClearPendingSite();
            }}
          />
          <IntervenantSearchInput
            intervenants={props.intervenants}
            disabled={locked}
            selectedIntervenant={props.selectedIntervenant}
            labelText="Prestataire"
            onSelectedIntervenantChange={(i) => {
              props.onIntervenantIdChange(i?.id ?? "");
              if (i) props.onClearPendingIntervenant();
            }}
          />
        </div>
      )}

      {props.origin === "APPEL_CLIENT" ? (
        <label>
          Nom du client (obligatoire)
          <input
            type="text"
            value={props.clientName}
            disabled={locked}
            onChange={(e) => props.onClientNameChange(e.target.value)}
            aria-label="Nom du client"
            placeholder="Ex. nom du contact ou de la société"
          />
        </label>
      ) : null}

      <label>
        Consigne de ronde
        <textarea
          className="mc-textarea"
          rows={4}
          value={props.consigne}
          readOnly={locked || props.isEdit || props.isLinkedExistingBatch}
          onChange={(e) => props.onConsigneChange(e.target.value)}
        />
      </label>
      {props.isLinkedExistingBatch ? (
        <label>
          Détail des modification
          <textarea
            className="mc-textarea"
            rows={3}
            value={props.motifDetail}
            readOnly={locked}
            onChange={(e) => props.onMotifDetailChange(e.target.value)}
            aria-label="Détail des modification"
          />
        </label>
      ) : null}
    </>
  );
}
