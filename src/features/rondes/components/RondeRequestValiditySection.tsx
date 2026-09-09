/**
 * Validité Du / Au (ou jour unique) de la demande / programmation.
 */

import { TimeInput } from "../../common/components/TimeInput";

type RondeRequestValiditySectionProps = {
  validFrom: string;
  validFromTime: string;
  validTo: string;
  validToTime: string;
  isSingleDay: boolean;
  readOnly?: boolean;
  onValidFromChange: (value: string) => void;
  onValidFromTimeChange: (value: string) => void;
  onValidToChange: (value: string) => void;
  onValidToTimeChange: (value: string) => void;
};

export function RondeRequestValiditySection({
  validFrom,
  validFromTime,
  validTo,
  validToTime,
  isSingleDay,
  readOnly = false,
  onValidFromChange,
  onValidFromTimeChange,
  onValidToChange,
  onValidToTimeChange
}: RondeRequestValiditySectionProps) {
  return (
    <div className="ronde-planned-profile-modal__validity-inline">
      <span className="ronde-planned-profile-modal__validity-label">Validité - Du</span>
      <input
        type="date"
        value={validFrom}
        disabled={readOnly}
        onChange={(e) => onValidFromChange(e.target.value)}
        aria-label="Date de début de validité"
      />
      <TimeInput
        value={validFromTime}
        disabled={readOnly}
        onChange={onValidFromTimeChange}
        title="Heure de début (vide = 00:00)"
        aria-label="Heure de début de validité"
      />
      {!isSingleDay ? (
        <>
          <span className="ronde-planned-profile-modal__validity-label">Au</span>
          <input
            type="date"
            value={validTo}
            disabled={readOnly}
            onChange={(e) => onValidToChange(e.target.value)}
            aria-label="Date de fin de validité"
          />
          <TimeInput
            value={validToTime}
            disabled={readOnly}
            onChange={onValidToTimeChange}
            title="Heure de fin (vide = 23:59)"
            aria-label="Heure de fin de validité"
          />
        </>
      ) : (
        <span className="muted ronde-planned-profile-modal__validity-single-hint">Jour unique</span>
      )}
    </div>
  );
}
