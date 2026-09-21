/**
 * Meta demande : date/heure, motif, origine, site, prestataire, consigne.
 * Le nom du client n’est affiché que hors ronde contractuelle (champ optionnel et inutilisé au contrat).
 */

import type { ReactNode } from "react";
import type { IntervenantRef, SiteRef } from "../../../types";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import { IntervenantSearchInput } from "../../common/components/IntervenantSearchInput";
import { PendingIntervenantInlineField, PendingSiteInlineFields } from "../../common/components/PendingRefInlineFields";
import { SearchEntry } from "../../common/components/SearchEntry";
import { RequestDateTimeField } from "../../common/components/RequestDateTimeField";
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
  besideConsigne?: ReactNode;
};

export function RondeRequestMetaSection(props: RondeRequestMetaSectionProps) {
  const locked = Boolean(props.readOnly);
  return (
    <>
      <div className="request-head-row">
        <RequestDateTimeField
          date={props.requestDate}
          time={props.requestTime}
          disabled={locked}
          onDateChange={props.onRequestDateChange}
          onTimeChange={props.onRequestTimeChange}
        />
        {!props.isEdit && !props.isLinkedExistingBatch && !props.isContract && props.canCreatePendingRefs && !locked ? (
          <SearchEntry
            className="request-head-row__refs"
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
              <PendingSiteInlineFields
                code={props.pendingCode}
                name={props.pendingName}
                onCodeChange={props.onPendingCodeChange}
                onNameChange={props.onPendingNameChange}
              />
            )}
            pendingIntervenantForm={(
              <PendingIntervenantInlineField
                name={props.pendingIntervenantName}
                onNameChange={props.onPendingIntervenantNameChange}
                label="Nouvel intervenant"
              />
            )}
            onNotify={props.onNotify}
            showSiteAction={!props.selectedSite}
            showIntervenantAction={!props.selectedIntervenant}
          />
        ) : (
          <div className="request-head-row__refs">
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
      </div>

      <div
        className={`ronde-planned-profile-modal__schedule-row${
          props.isContract ? " ronde-planned-profile-modal__schedule-row--no-client" : ""
        }`}
      >
        <label className="mc-field ronde-planned-profile-modal__schedule-field--motif">
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
        {!props.isContract ? (
          <label className="mc-field">
            <span>{props.origin === "APPEL_CLIENT" ? "Nom du client (obligatoire)" : "Nom du client"}</span>
            <input
              type="text"
              value={props.clientName}
              disabled={locked}
              onChange={(e) => props.onClientNameChange(e.target.value)}
              aria-label="Nom du client"
              placeholder="Ex. Nom exemple"
            />
          </label>
        ) : null}
        <label className="mc-field ronde-planned-profile-modal__schedule-field--origin">
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

      <div className={props.besideConsigne ? "request-motif-row request-motif-row--with-extra" : undefined}>
        <label className={`mc-field ${props.besideConsigne ? "request-motif-row__motif" : "mc-field-full"}`}>
          <span>Consigne de ronde</span>
          <textarea
            className="mc-textarea"
            rows={4}
            value={props.consigne}
            readOnly={locked || props.isEdit || props.isLinkedExistingBatch}
            onChange={(e) => props.onConsigneChange(e.target.value)}
          />
        </label>
        {props.besideConsigne}
      </div>
      {props.isLinkedExistingBatch ? (
        <label className="mc-field mc-field-full">
          <span>Détail des modification</span>
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
