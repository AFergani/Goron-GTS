/**
 * Section compte-rendu terrain / clôture de la fiche ronde.
 */

import type { Dispatch, SetStateAction } from "react";
import type { IntervenantRef, SiteRef } from "../../../types";
import { FormVariableFields } from "../../common/components/FormVariableFields";
import type { FormVariableFieldDef } from "../../common/model/formVariableField.types";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { IntervenantSearchInput } from "../../common/components/IntervenantSearchInput";
import { TimeInput } from "../../common/components/TimeInput";
import { formatSiteSelectedLabel } from "../../common/model/siteSearch";
import type { NotifyToast } from "../../common/model/toast.types";
import { isRondeAutoClosureReport, type RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef, RondePlannedRoundKind } from "../model/rondePlanned.types";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import { formatJourneeDuLabel } from "../utils/rondeEntryFormHelpers";
import { RondeClosureFieldsEditor } from "./RondeClosureFieldsEditor";

type RondeEntryExecutionSectionProps = {
  entry: RondeEntry | null;
  isPlannedCreatePreset: boolean;
  createPresetRoundKind?: string | null;
  selectedMotifLabel: string;
  requestDate: string;
  plannedLineRequestedTime: string | null;
  selectedSite: SiteRef | null;
  selectedIntervenant: IntervenantRef | null;
  intervenants: IntervenantRef[];
  lockFields: boolean;
  arrivalTime: string;
  departureTime: string;
  workOrderNumber: string;
  durationMinutes: number | null;
  report: string;
  formLockedClosed: boolean;
  logicalDateShiftedAfterMidnight: boolean;
  activePlannedProfile: RondePlannedProfileRef | null | undefined;
  closureCustomValues: Record<string, string>;
  showClosureFields: boolean;
  resolveFieldLabel: (template: string) => string;
  onNotify?: NotifyToast;
  onArrivalTimeChange: (value: string) => void;
  onDepartureTimeChange: (value: string) => void;
  onWorkOrderNumberChange: (value: string) => void;
  onReportChange: (value: string) => void;
  onIntervenantIdChange: (id: string) => void;
  onClosureCustomValuesChange: Dispatch<SetStateAction<Record<string, string>>>;
  requestExtraDefs?: FormVariableFieldDef[];
  closureExtraDefs?: FormVariableFieldDef[];
  extraValues?: Record<string, string>;
  onExtraValuesChange?: Dispatch<SetStateAction<Record<string, string>>>;
  requestExtrasReadOnly?: boolean;
};

export function RondeEntryExecutionSection(props: RondeEntryExecutionSectionProps) {
  const {
    entry,
    isPlannedCreatePreset,
    createPresetRoundKind,
    selectedMotifLabel,
    requestDate,
    plannedLineRequestedTime,
    selectedSite,
    selectedIntervenant,
    intervenants,
    lockFields,
    arrivalTime,
    departureTime,
    workOrderNumber,
    durationMinutes,
    report,
    formLockedClosed,
    logicalDateShiftedAfterMidnight,
    activePlannedProfile,
    closureCustomValues,
    showClosureFields,
    resolveFieldLabel,
    onNotify
  } = props;

  return (
    <>
      <p className="ronde-cr-summary-line">
        <strong>
          {(entry?.source === "PLANIFIE" && entry.plannedRoundKind) || isPlannedCreatePreset
            ? formatPlannedRoundKindLabel(
                ((entry?.plannedRoundKind || createPresetRoundKind) ?? "RANDOM") as RondePlannedRoundKind
              )
            : selectedMotifLabel}
        </strong>
        {" - Journée du "}
        <strong>{formatJourneeDuLabel(requestDate)}</strong>
        {plannedLineRequestedTime ? (
          <>
            {" "}
            — Heure demandée <strong>{plannedLineRequestedTime}</strong>
          </>
        ) : null}
      </p>

      <div className="mc-form-grid mc-form-grid-main mc-form-grid-align-start">
        <label className="mc-field">
          <span>Site</span>
          <SiteDisplayCopyButton
            siteLabel={selectedSite ? formatSiteSelectedLabel(selectedSite) : entry?.siteDisplay || ""}
            onNotify={onNotify}
          />
        </label>
        {entry?.source === "PLANIFIE" ? (
          <IntervenantSearchInput
            intervenants={intervenants}
            disabled={lockFields}
            selectedIntervenant={selectedIntervenant}
            onSelectedIntervenantChange={(item) => props.onIntervenantIdChange(item?.id || "")}
          />
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
      {entry?.source === "PLANIFIE" ? (
        <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          Prestataire défini à la <strong>création</strong> du passage planifié. Modifiez uniquement si une autre équipe
          est intervenue ou en cas d&apos;erreur de saisie.
        </p>
      ) : null}

      <div className="mc-form-grid mc-form-grid-main ronde-cr-times-row">
        <label className="mc-field">
          <span>Heure arrivée</span>
          <TimeInput value={arrivalTime} disabled={lockFields} onChange={props.onArrivalTimeChange} />
        </label>
        <label className="mc-field">
          <span>Heure départ</span>
          <TimeInput value={departureTime} disabled={lockFields} onChange={props.onDepartureTimeChange} />
        </label>
        <label className="mc-field">
          <span>N° bon</span>
          <input
            value={workOrderNumber}
            disabled={lockFields}
            onChange={(e) => props.onWorkOrderNumberChange(e.target.value)}
          />
        </label>
        <label className="mc-field">
          <span>Durée de la ronde (minutes)</span>
          <input
            value={durationMinutes == null ? "" : String(durationMinutes)}
            readOnly
            className="mc-input-readonly"
            title="Calculée à partir des heures d'arrivée et de départ"
          />
        </label>
      </div>
      {logicalDateShiftedAfterMidnight ? (
        <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          Date logique auto-calculée : ronde de nuit après minuit détectée.
        </p>
      ) : null}
      <label className="mc-field mc-field-full">
        <span>Compte rendu</span>
        <textarea
          value={report}
          disabled={lockFields}
          onChange={(e) => props.onReportChange(e.target.value)}
          className="mc-textarea"
        />
      </label>
      {formLockedClosed && entry?.source !== "PLANIFIE" && isRondeAutoClosureReport(report) ? (
        <p className="muted mc-ref-hint" style={{ marginTop: 0 }}>
          Clôture automatique (plus de 5 jours après la date de passage). Utilisez <strong>Rouvrir</strong> puis
          reclôturez pour saisir les heures effectives, le n° de bon ou un compte rendu terrain.
        </p>
      ) : null}
      {showClosureFields ? (
        <RondeClosureFieldsEditor
          profile={activePlannedProfile ?? undefined}
          values={closureCustomValues}
          onValuesChange={props.onClosureCustomValuesChange}
          resolveFieldLabel={resolveFieldLabel}
          disabled={lockFields}
        />
      ) : null}
      {props.onExtraValuesChange ? (
        <>
          <FormVariableFields
            defs={props.requestExtraDefs || []}
            values={props.extraValues || {}}
            onValuesChange={props.onExtraValuesChange}
            disabled={props.requestExtrasReadOnly ?? true}
            title="Champs de la demande"
          />
          <FormVariableFields
            defs={props.closureExtraDefs || []}
            values={props.extraValues || {}}
            onValuesChange={props.onExtraValuesChange}
            disabled={lockFields}
          />
        </>
      ) : null}
    </>
  );
}
