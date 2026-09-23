/**
 * Sections « Planification » et « Lignes » de la modale gardiennage.
 *
 * La validité, les lignes récurrentes et le récapitulatif restent dans le même bloc UI
 * que la saisie (cohérence avec le moteur de prévisualisation).
 */

import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import { DateInput } from "../../common/components/DateInput";
import { TimeInput } from "../../common/components/TimeInput";
import {
  GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
  parseTimeToMin,
  type GardiennagePlanningFormMode
} from "../model/gardiennagePlanningForm";
import type { GardiennageEntry } from "../model/gardiennage.types";
import {
  applyGardiennagePlanningMode,
  createDefaultGardiennagePlanningLine,
  formatGardiennageDurationMinutes,
  withValidFromDateTime,
  type GardiennageEntryFormState
} from "../model/gardiennageEntryForm";
import {
  gardiennagePlanningLineDisplayNumber,
  syncGardiennagePlanningLineLabels
} from "../utils/gardiennagePlanningLineOrder";
import { GardiennagePlanningLineWeekdays } from "./GardiennagePlanningLineWeekdays";
import { GardiennagePlanningLinesRecap } from "./GardiennagePlanningLinesRecap";

type GardiennagePlanningSectionProps = {
  form: GardiennageEntryFormState;
  setForm: Dispatch<SetStateAction<GardiennageEntryFormState>>;
  planningMode: GardiennagePlanningFormMode;
  locked: boolean;
  isCreateMode: boolean;
  isCloture: boolean;
  isAnnule: boolean;
  entry: GardiennageEntry | null;
  ponctuelCrossesMidnight: boolean;
  lockWeekdaysFromValidityRange: boolean;
  linesOverlapError: string;
  previewPerLineCounts: number[];
  previewSlotsCount: number;
  previewTotalMinutes: number;
  previewClosedSlotsCount: number;
  highlightNewestLineId: string | null;
  newestLineRef: RefObject<HTMLFieldSetElement | null>;
};

function lineDurationMinutes(startTime: string, endTime: string): number {
  const start = parseTimeToMin(startTime);
  const end = parseTimeToMin(endTime);
  if (start < 0 || end < 0) return 0;
  if (end > start) return end - start;
  if (end < start) return 24 * 60 - start + end;
  return 24 * 60;
}

/**
 * @param props.form - État de saisie
 * @param props.setForm - Mise à jour du formulaire parent
 * @param props.planningMode - Mode UI (journée / H24 / récurrent)
 * @param props.locked - Lecture seule (sauvegarde, rôle, annulé)
 * @param props.isCreateMode - Création vs édition
 * @param props.isCloture - Fiche clôturée
 * @param props.isAnnule - Fiche annulée
 * @param props.entry - Ligne éditée (lot / snapshot)
 * @param props.ponctuelCrossesMidnight - Journée unique qui passe minuit
 * @param props.lockWeekdaysFromValidityRange - Verrou des jours si plage courte
 * @param props.linesOverlapError - Message de chevauchement éventuel
 * @param props.previewPerLineCounts - Nombre de créneaux par ligne
 * @param props.previewSlotsCount - Total créneaux
 * @param props.previewTotalMinutes - Durée totale générée
 * @param props.previewClosedSlotsCount - Créneaux déjà clôturés
 * @param props.highlightNewestLineId - Ligne à mettre en évidence
 * @param props.newestLineRef - Ref pour scroller vers la ligne ajoutée
 */
export function GardiennagePlanningSection({
  form,
  setForm,
  planningMode,
  locked,
  isCreateMode,
  isCloture,
  isAnnule,
  entry,
  ponctuelCrossesMidnight,
  lockWeekdaysFromValidityRange,
  linesOverlapError,
  previewPerLineCounts,
  previewSlotsCount,
  previewTotalMinutes,
  previewClosedSlotsCount,
  highlightNewestLineId,
  newestLineRef
}: GardiennagePlanningSectionProps) {
  const showPlanningLines = planningMode === "recurring";

  return (
    <>
      <CreateFormSection title="Planification">
        <div className="gardiennage-planning-layout">
          <div className="gardiennage-planning-layout__mode">
            <div className="gardiennage-planning-mode">
              <span className="gardiennage-validity-lead">Type</span>
              <select
                value={planningMode}
                disabled={locked}
                onChange={(e) =>
                  setForm((current) =>
                    applyGardiennagePlanningMode(current, e.target.value as GardiennagePlanningFormMode)
                  )
                }
              >
                <option value="recurring">Planification libre</option>
                <option value="ponctuel">Journée unique</option>
                <option value="h24">H24</option>
              </select>
            </div>
          </div>

          <div className="gardiennage-planning-layout__validity">
            {planningMode === "ponctuel" && (
              <div className="gardiennage-planning-validity">
                <span className="gardiennage-validity-lead">Validité</span>
                <label className="gardiennage-date-field">
                  <span className="gardiennage-date-label">Date</span>
                  <DateInput
                    value={form.validFromDate}
                    disabled={locked}
                    onChange={(e) => setForm((current) => withValidFromDateTime(current, e.target.value, current.validFromTime))}
                  />
                </label>
                <span className="gardiennage-date-sep">de</span>
                <label className="gardiennage-time-field">
                  <span className="gardiennage-date-label">Début</span>
                  <TimeInput
                    value={form.validFromTime}
                    disabled={locked}
                    onChange={(value) => setForm((current) => withValidFromDateTime(current, current.validFromDate, value))}
                  />
                </label>
                <span className="gardiennage-date-sep">à</span>
                <label className="gardiennage-time-field">
                  <span className="gardiennage-date-label">Fin</span>
                  <TimeInput
                    value={form.validToTime}
                    disabled={locked}
                    onChange={(value) => setForm((current) => ({ ...current, validToTime: value }))}
                  />
                </label>
              </div>
            )}

            {planningMode === "h24" && (
              <div className="gardiennage-planning-validity">
                <span className="gardiennage-validity-lead">Validité du</span>
                <label className="gardiennage-date-field">
                  <span className="gardiennage-date-label">Date</span>
                  <DateInput
                    value={form.validFromDate}
                    disabled={locked}
                    onChange={(e) => setForm((current) => withValidFromDateTime(current, e.target.value, current.validFromTime))}
                  />
                </label>
                <label className="gardiennage-time-field">
                  <span className="gardiennage-date-label">Heure</span>
                  <TimeInput
                    value={form.validFromTime}
                    disabled={locked}
                    onChange={(value) => setForm((current) => withValidFromDateTime(current, current.validFromDate, value))}
                  />
                </label>
                <span className="gardiennage-date-sep">au</span>
                <label className="gardiennage-date-field">
                  <span className="gardiennage-date-label">Date fin</span>
                  <DateInput
                    value={form.validToDate}
                    disabled={locked}
                    min={form.validFromDate || undefined}
                    aria-label="Date de fin (optionnelle)"
                    onChange={(e) => setForm((current) => ({ ...current, validToDate: e.target.value }))}
                  />
                </label>
                <label className="gardiennage-time-field">
                  <span className="gardiennage-date-label">Heure fin</span>
                  <TimeInput
                    value={form.validToTime}
                    disabled={locked}
                    aria-label="Heure de fin (optionnelle)"
                    onChange={(value) => setForm((current) => ({ ...current, validToTime: value }))}
                  />
                </label>
              </div>
            )}

            {planningMode === "recurring" && (
              <div className="gardiennage-planning-validity">
                <span className="gardiennage-validity-lead">Validité du</span>
                <label className="gardiennage-date-field">
                  <span className="gardiennage-date-label">Date</span>
                  <DateInput
                    value={form.validFromDate}
                    disabled={locked}
                    onChange={(e) => setForm((current) => withValidFromDateTime(current, e.target.value, current.validFromTime))}
                  />
                </label>
                <span className="gardiennage-date-sep">au</span>
                <label className="gardiennage-date-field">
                  <span className="gardiennage-date-label">Date</span>
                  <DateInput
                    value={form.validToDate}
                    disabled={locked}
                    min={form.validFromDate || undefined}
                    required
                    aria-required="true"
                    aria-label="Date de fin de validité (obligatoire)"
                    onChange={(e) => setForm((current) => ({ ...current, validToDate: e.target.value }))}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {planningMode === "ponctuel" && ponctuelCrossesMidnight && (
          <p className="muted mc-ref-hint">La fin est le lendemain (passage après minuit géré automatiquement).</p>
        )}
        {!isCreateMode && entry?.planningBatchId && entry.planningSnapshot && !isCloture && !isAnnule && (
          <p className="muted mc-ref-hint" role="note">
            La modification resynchronise tous les créneaux du lot non clôturés. Les créneaux déjà clôturés ne sont pas modifiés.
          </p>
        )}
      </CreateFormSection>

      {showPlanningLines && (
        <CreateFormSection
          title="Lignes de planification"
          headerAction={(
            <button
              type="button"
              className="btn-light"
              disabled={locked}
              title="Ajouter une ligne"
              aria-label="Ajouter une ligne"
              onClick={() => setForm((current) => {
                const nextLabel = `Ligne ${current.planningLines.length + 1}`;
                return {
                  ...current,
                  planningLines: syncGardiennagePlanningLineLabels([
                    createDefaultGardiennagePlanningLine(nextLabel),
                    ...current.planningLines
                  ])
                };
              })}
            >
              <Plus size={16} aria-hidden />
            </button>
          )}
        >
          <div className="gardiennage-planning-lines">
            {form.planningLines.map((line, index) => {
              const displayNumber = gardiennagePlanningLineDisplayNumber(index, form.planningLines.length);
              const isNewest = index === 0;
              return (
                <fieldset
                  key={line.id}
                  ref={isNewest ? newestLineRef : undefined}
                  className={[
                    "gardiennage-planning-line",
                    highlightNewestLineId === line.id ? "gardiennage-planning-line--just-added" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <legend className="gardiennage-planning-line__legend">
                    <span className="gardiennage-planning-line__legend-label">Ligne {displayNumber}</span>
                    <button
                      type="button"
                      className="btn-danger action-icon-btn gardiennage-planning-line__remove"
                      disabled={locked || form.planningLines.length === 1}
                      title={form.planningLines.length === 1 ? "Au moins une ligne de planification est requise" : "Supprimer cette ligne"}
                      aria-label={form.planningLines.length === 1 ? "Suppression impossible : une seule ligne" : `Supprimer la ligne ${displayNumber}`}
                      onClick={() => {
                        if (form.planningLines.length <= 1) return;
                        setForm((current) => ({
                          ...current,
                          planningLines: syncGardiennagePlanningLineLabels(
                            current.planningLines.filter((item) => item.id !== line.id)
                          )
                        }));
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </legend>
                  <div className="gardiennage-horaires-row" style={{ alignItems: "end" }}>
                    <label className="gardiennage-time-field">
                      <span className="gardiennage-date-label">Début</span>
                      <TimeInput
                        value={line.startTime}
                        disabled={locked}
                        onChange={(value) => setForm((current) => ({
                          ...current,
                          planningLines: current.planningLines.map((item) =>
                            item.id === line.id ? { ...item, startTime: value } : item
                          )
                        }))}
                      />
                    </label>
                    <label className="gardiennage-time-field">
                      <span className="gardiennage-date-label">Fin</span>
                      <TimeInput
                        value={line.endTime}
                        disabled={locked}
                        onChange={(value) => setForm((current) => ({
                          ...current,
                          planningLines: current.planningLines.map((item) =>
                            item.id === line.id ? { ...item, endTime: value } : item
                          )
                        }))}
                      />
                    </label>
                    <label className="gardiennage-time-field gardiennage-duree-field">
                      <span className="gardiennage-date-label">Durée</span>
                      <input
                        type="text"
                        readOnly
                        className="mc-input-readonly"
                        value={formatGardiennageDurationMinutes(lineDurationMinutes(line.startTime, line.endTime))}
                      />
                    </label>
                    <label className="gardiennage-date-field">
                      <span className="gardiennage-date-label">Date (optionnelle)</span>
                      <DateInput
                        value={line.anchorDate || ""}
                        min={form.validFromDate || undefined}
                        max={form.validToDate || undefined}
                        disabled={locked}
                        onChange={(e) => setForm((current) => ({
                          ...current,
                          planningLines: current.planningLines.map((item) =>
                            item.id === line.id ? { ...item, anchorDate: e.target.value } : item
                          )
                        }))}
                      />
                    </label>
                  </div>
                  <GardiennagePlanningLineWeekdays
                    line={line}
                    disabled={locked}
                    lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
                    onChange={(patch) => setForm((current) => ({
                      ...current,
                      planningLines: current.planningLines.map((item) =>
                        item.id === line.id ? { ...item, ...patch } : item
                      )
                    }))}
                  />
                </fieldset>
              );
            })}
          </div>
          {linesOverlapError ? <p className="mc-ref-hint text-error">{linesOverlapError}</p> : null}
        </CreateFormSection>
      )}

      <GardiennagePlanningLinesRecap
        mode={planningMode}
        isEdit={!isCreateMode}
        lines={form.planningLines}
        lockWeekdaysFromValidityRange={lockWeekdaysFromValidityRange}
        validFromDate={form.validFromDate}
        validFromTime={form.validFromTime}
        validToDate={
          planningMode === "ponctuel"
            ? form.validFromDate
            : planningMode === "h24" && !form.validToDate.trim()
              ? ""
              : form.validToDate
        }
        validToTime={form.validToTime}
        perLineCounts={previewPerLineCounts}
        totalSlots={previewSlotsCount}
        totalMinutesLabel={formatGardiennageDurationMinutes(previewTotalMinutes)}
        closedSlotsCount={previewClosedSlotsCount}
        openEnded={planningMode === "h24" && !form.validToDate.trim()}
        openEndedHorizonDays={GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS}
        clientName={form.clientName}
      />
    </>
  );
}
