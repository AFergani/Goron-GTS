/**
 * Section demande de la fiche ronde (date, site, motif, observation, origine).
 */

import type { ReactNode } from "react";
import type { IntervenantRef, SiteRef } from "../../../types";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { SearchEntry } from "../../common/components/SearchEntry";
import { IntervenantSearchInput } from "../../common/components/IntervenantSearchInput";
import { PendingIntervenantInlineField, PendingSiteInlineFields } from "../../common/components/PendingRefInlineFields";
import { RequestDateTimeField } from "../../common/components/RequestDateTimeField";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import type { NotifyToast } from "../../common/model/toast.types";
import type { RondeEntry, RondeMotifTypeRef, RondeOriginKind } from "../model/ronde.types";

type RondeEntryRequestSectionProps = {
  isCreateMode: boolean;
  lockDemandeFields: boolean;
  lockFields: boolean;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  rondeMotifs: RondeMotifTypeRef[];
  selectedSite: SiteRef | null;
  selectedIntervenant: IntervenantRef | null;
  entry: RondeEntry | null;
  requestDate: string;
  motifTypeId: string;
  motifDetail: string;
  horairesDemandeObs: string;
  originKind: RondeOriginKind;
  originDetail: string;
  showPendingSiteForm: boolean;
  showPendingIntervenantForm: boolean;
  pendingCode: string;
  pendingName: string;
  pendingIntervenantName: string;
  onNotify?: NotifyToast;
  onRequestDateChange: (value: string) => void;
  onMotifTypeIdChange: (value: string) => void;
  onMotifDetailChange: (value: string) => void;
  onHorairesDemandeObsChange: (value: string) => void;
  onOriginKindChange: (value: RondeOriginKind) => void;
  onOriginDetailChange: (value: string) => void;
  onSelectedSiteChange: (site: SiteRef | null) => void;
  onSelectedIntervenantChange: (item: IntervenantRef | null) => void;
  onTogglePendingSite: () => void;
  onTogglePendingIntervenant: () => void;
  onPendingCodeChange: (value: string) => void;
  onPendingNameChange: (value: string) => void;
  onPendingIntervenantNameChange: (value: string) => void;
  onClearPendingSiteFields: () => void;
  onClearPendingIntervenantFields: () => void;
  onIntervenantIdChange: (id: string) => void;
  besideMotif?: ReactNode;
};

export function RondeEntryRequestSection(props: RondeEntryRequestSectionProps) {
  const {
    isCreateMode,
    lockDemandeFields,
    lockFields,
    sites,
    intervenants,
    rondeMotifs,
    selectedSite,
    selectedIntervenant,
    entry,
    requestDate,
    motifTypeId,
    motifDetail,
    horairesDemandeObs,
    originKind,
    originDetail,
    showPendingSiteForm,
    showPendingIntervenantForm,
    pendingCode,
    pendingName,
    pendingIntervenantName,
    onNotify
  } = props;

  return (
    <>
      <div className="request-head-row">
        <RequestDateTimeField
          date={requestDate}
          showTime={false}
          label="Date de la demande"
          disabled={lockDemandeFields}
          onDateChange={props.onRequestDateChange}
        />
        {isCreateMode ? (
          <SearchEntry
            className="request-head-row__refs"
            sites={sites}
            intervenants={intervenants}
            selectedSite={selectedSite}
            selectedIntervenant={selectedIntervenant}
            onSelectedSiteChange={(site) => {
              props.onSelectedSiteChange(site);
              if (site) props.onClearPendingSiteFields();
            }}
            onSelectedIntervenantChange={(item) => {
              props.onSelectedIntervenantChange(item);
              if (item) props.onClearPendingIntervenantFields();
            }}
            showPendingSiteForm={showPendingSiteForm}
            showPendingIntervenantForm={showPendingIntervenantForm}
            onTogglePendingSite={props.onTogglePendingSite}
            onTogglePendingIntervenant={props.onTogglePendingIntervenant}
            pendingSiteForm={(
              <PendingSiteInlineFields
                code={pendingCode}
                name={pendingName}
                onCodeChange={props.onPendingCodeChange}
                onNameChange={props.onPendingNameChange}
              />
            )}
            pendingIntervenantForm={(
              <PendingIntervenantInlineField
                name={pendingIntervenantName}
                onNameChange={props.onPendingIntervenantNameChange}
              />
            )}
            onNotify={onNotify}
            siteButtonLabel="À créer ?"
            intervenantButtonLabel="À créer ?"
            showSiteAction={!selectedSite}
            showIntervenantAction={!selectedIntervenant}
          />
        ) : (
          <div className="request-head-row__refs">
            <label className="mc-field">
              <span>Site</span>
              <SiteDisplayCopyButton
                siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
                onNotify={onNotify}
              />
            </label>
            {entry?.source === "PLANIFIE" ? (
              <div className="mc-field mc-field-full">
                <p className="muted mc-ref-hint" style={{ marginBottom: 8 }}>
                  Prestataire défini à la <strong>création</strong> du passage planifié. Modifiez uniquement si une autre
                  équipe est intervenue ou en cas d&apos;erreur de saisie.
                </p>
                <IntervenantSearchInput
                  intervenants={intervenants}
                  disabled={lockFields}
                  selectedIntervenant={selectedIntervenant}
                  onSelectedIntervenantChange={(item) => props.onIntervenantIdChange(item?.id || "")}
                />
              </div>
            ) : (
              <label className="mc-field">
                <span>Prestataire</span>
                <input
                  value={selectedIntervenant?.name || entry?.intervenantName || "—"}
                  readOnly
                  className="mc-input-readonly"
                />
              </label>
            )}
          </div>
        )}
      </div>

      {!rondeMotifs.length ? (
        <p className="error mc-field-error">
          Aucun motif de ronde configuré. Les responsables peuvent en créer dans Paramètres → Données → Motifs ronde.
        </p>
      ) : null}

      <CreateFormSection title="Motif de la demande">
        <div
          className={
            props.besideMotif
              ? "request-motif-row request-motif-row--with-extra"
              : "mc-form-grid mc-form-grid-main mc-form-grid-align-start"
          }
        >
          <label className={`mc-field ${props.besideMotif ? "request-motif-row__motif" : "mc-field-full"}`}>
            <span>Motif</span>
            <select
              value={motifTypeId}
              disabled={lockDemandeFields}
              required={Boolean(rondeMotifs.length)}
              onChange={(e) => props.onMotifTypeIdChange(e.target.value)}
            >
              {rondeMotifs.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {props.besideMotif}
          <label className="mc-field mc-field-full">
            <span>Commentaire du motif (facultatif)</span>
            <textarea
              value={motifDetail}
              disabled={lockDemandeFields}
              onChange={(e) => props.onMotifDetailChange(e.target.value)}
              className="mc-textarea mc-textarea-inline-pair"
              rows={3}
            />
          </label>
        </div>
      </CreateFormSection>

      <CreateFormSection title="Observation principale">
        <label className="mc-field mc-field-full">
          <span>Observation principale (horaire, consigne, etc.)</span>
          <textarea
            value={horairesDemandeObs}
            disabled={lockDemandeFields}
            onChange={(e) => props.onHorairesDemandeObsChange(e.target.value)}
            className="mc-textarea mc-textarea-inline-pair"
            rows={4}
          />
        </label>
      </CreateFormSection>

      <CreateFormSection title="Origine de la demande">
        <div className="mc-form-grid mc-form-grid-main mc-form-grid-align-start">
          <label className="mc-field mc-field-full">
            <span>Origine de la demande</span>
            <select
              value={originKind}
              disabled={lockDemandeFields}
              onChange={(e) => props.onOriginKindChange(e.target.value as RondeOriginKind)}
            >
              <option value="TELESURVEILLANCE">Télésurveillance</option>
              <option value="CLIENT">Client</option>
              <option value="AUTRE">Autre</option>
            </select>
          </label>
          <label className="mc-field mc-field-full">
            <span>
              {originKind === "CLIENT" ? "Nom du client (obligatoire)" : "Commentaire sur l'origine (facultatif)"}
            </span>
            <textarea
              value={originDetail}
              disabled={lockDemandeFields}
              onChange={(e) => props.onOriginDetailChange(e.target.value)}
              className="mc-textarea mc-textarea-inline-pair"
              rows={3}
            />
          </label>
        </div>
      </CreateFormSection>
    </>
  );
}
