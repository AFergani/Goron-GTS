/**
 * Éditeur des lignes de planification (type, horaires, jours, fériés).
 * Stockage : plus récente en premier. Numérotation : chronologique (1re saisie = Ligne 1).
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { TimeInput } from "../../common/components/TimeInput";
import { RONDE_WEEKDAY_BITS } from "../model/rondePlannedSummary";
import {
  rondeRequestLineDisplayNumber,
  type LineDraft
} from "../model/rondeRequestLineDraft";

type RondeRequestLineEditorProps = {
  lines: LineDraft[];
  isSingleDay: boolean;
  /** Consultation seule : pas d’ajout / suppression / modification. */
  readOnly?: boolean;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onUpdateLine: (index: number, patch: Partial<LineDraft>) => void;
  onSingleDayChange: (value: boolean) => void;
};

export function RondeRequestLineEditor({
  lines,
  isSingleDay,
  readOnly = false,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  onSingleDayChange
}: RondeRequestLineEditorProps) {
  const newestLineRef = useRef<HTMLFieldSetElement | null>(null);
  const prevNewestIdRef = useRef<string | null>(null);
  const [highlightNewestId, setHighlightNewestId] = useState<string | null>(null);

  useEffect(() => {
    const newestId = lines[0]?.id ?? null;
    if (!newestId || newestId === prevNewestIdRef.current) {
      prevNewestIdRef.current = newestId;
      return;
    }
    const isAddition = prevNewestIdRef.current != null && lines.length > 1;
    prevNewestIdRef.current = newestId;
    if (!isAddition) return;
    setHighlightNewestId(newestId);
    newestLineRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = window.setTimeout(() => setHighlightNewestId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lines]);

  return (
    <>
      <div className="ronde-planned-profile-modal__lines-header">
        <span className="ronde-planned-profile-modal__lines-title">Lignes de planification</span>
        {!readOnly ? (
          <button type="button" className="btn-light" onClick={onAddLine} title="Ajouter une ligne" aria-label="Ajouter une ligne">
            <Plus size={16} aria-hidden />
          </button>
        ) : null}
      </div>
      {lines.map((line, index) => {
        const displayNumber = rondeRequestLineDisplayNumber(index, lines.length);
        const isNewest = index === 0;
        const typeChosen = Boolean(line.roundKind);
        const daysDisabled = readOnly || !typeChosen;
        const unsetTypeTooltip = typeChosen ? undefined : "Choisissez d’abord un type de ronde";
        return (
          <fieldset
            key={line.id}
            ref={isNewest ? newestLineRef : undefined}
            className={[
              "ronde-planned-profile-line",
              highlightNewestId === line.id ? "ronde-planned-profile-line--just-added" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <legend className="ronde-planned-profile-line__legend">
              <span className="ronde-planned-profile-line__legend-label">Ligne {displayNumber}</span>
              {!readOnly && lines.length > 1 ? (
                <button
                  type="button"
                  className="btn-danger action-icon-btn ronde-planned-profile-line__remove"
                  title="Supprimer cette ligne"
                  aria-label={`Supprimer la ligne ${displayNumber}`}
                  onClick={() => onRemoveLine(index)}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </legend>
            <div className="ronde-request-line-grid ronde-request-line-grid--two-columns">
              <label className="ronde-request-line-grid__round-kind">
                Type de ronde
                <select
                  value={line.roundKind}
                  disabled={readOnly}
                  onChange={(e) => {
                    const nextKind = e.target.value as LineDraft["roundKind"];
                    onUpdateLine(index, { roundKind: nextKind });
                    if (nextKind === "ACCOMPAGNEMENT") {
                      onSingleDayChange(true);
                      return;
                    }
                    if (line.roundKind === "ACCOMPAGNEMENT") {
                      const stillHasAccompagnement = lines.some(
                        (other, otherIndex) => otherIndex !== index && other.roundKind === "ACCOMPAGNEMENT"
                      );
                      if (!stillHasAccompagnement) onSingleDayChange(false);
                    }
                  }}
                >
                  <option value="">—</option>
                  <option value="OPENING">Ouverture</option>
                  <option value="CLOSING">Fermeture</option>
                  <option value="ACCOMPAGNEMENT">Accompagnement</option>
                  <option value="RANDOM">Aléatoire</option>
                </select>
              </label>
              <div className="ronde-request-line-grid__controls">
                {line.roundKind === "RANDOM" ? (
                  <div className="ronde-request-line-grid__row ronde-request-line-grid__row--random-modes">
                    <div className="ronde-request-line-grid__mode-group" role="group" aria-label="Mode intervalle">
                      <label>
                        Intervalle (heures)
                      <input
                        type="number"
                        min={1}
                        value={line.intervalHours}
                        disabled={readOnly || Boolean(line.randomRoundsCount)}
                        onChange={(e) => onUpdateLine(index, { intervalHours: e.target.value })}
                      />
                      </label>
                    </div>
                    <span className="ronde-request-line-grid__mode-or" aria-hidden>
                      ou
                    </span>
                    <div className="ronde-request-line-grid__mode-group" role="group" aria-label="Mode fenêtre">
                      <label>
                        Fenêtre de
                      <TimeInput
                        value={line.randomWindowStart}
                        disabled={readOnly}
                        onChange={(value) => onUpdateLine(index, { randomWindowStart: value })}
                      />
                    </label>
                    <label>
                      Fenêtre à
                      <TimeInput
                        value={line.randomWindowEnd}
                        disabled={readOnly}
                        onChange={(value) => onUpdateLine(index, { randomWindowEnd: value })}
                      />
                    </label>
                    <label>
                      Nombre de rondes
                      <input
                        type="number"
                        min={1}
                        value={line.randomRoundsCount}
                        disabled={readOnly || Boolean(line.intervalHours)}
                        onChange={(e) => onUpdateLine(index, { randomRoundsCount: e.target.value })}
                      />
                      </label>
                    </div>
                  </div>
                ) : line.roundKind ? (
                  <div className="ronde-request-line-grid__row ronde-request-line-grid__row--first">
                    <label className="ronde-request-line-grid__field-large">
                      Heure demandée
                    <TimeInput
                      value={line.requestedTime}
                      disabled={readOnly}
                      onChange={(value) => onUpdateLine(index, { requestedTime: value })}
                    />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="ronde-planned-profile-line__weekday-toggles">
              <span className="muted" style={{ marginRight: 8 }}>
                Jours spécifiques
              </span>
            <ToggleSwitch
              checked={isSingleDay}
              disabled={daysDisabled}
              tooltip={unsetTypeTooltip}
              onChange={onSingleDayChange}
              label="Jour unique"
              labelFirst
            />
            <ToggleSwitch
              checked={line.includeHolidayEves}
              disabled={daysDisabled}
              tooltip={unsetTypeTooltip}
              onChange={(next) => onUpdateLine(index, { includeHolidayEves: next })}
              label="Veille jour férié"
              labelFirst
            />
            <ToggleSwitch
              checked={line.includeHolidays}
              disabled={daysDisabled}
              tooltip={unsetTypeTooltip}
              onChange={(next) => onUpdateLine(index, { includeHolidays: next })}
              label="Jours fériés"
              labelFirst
            />
          </div>
          <div className="ronde-planned-profile-line__weekday-toggles">
            <span className="muted" style={{ marginRight: 8 }}>
              L à D
            </span>
            {RONDE_WEEKDAY_BITS.map((d) => (
              <ToggleSwitch
                key={d.bit}
                checked={(line.weekdaysMask & d.bit) !== 0}
                disabled={daysDisabled || isSingleDay}
                tooltip={unsetTypeTooltip}
                onChange={(next) =>
                  onUpdateLine(index, {
                    weekdaysMask: next ? line.weekdaysMask | d.bit : line.weekdaysMask & ~d.bit
                  })
                }
                label={d.label}
                labelFirst
              />
            ))}
          </div>
          </fieldset>
        );
      })}
    </>
  );
}
