/**
 * Date et heure de la demande / création : un libellé, date et heure côte à côte.
 *
 * Utilisé en tête des modales intervention, ronde, gardiennage et main courante.
 */

import type { ReactNode } from "react";
import { DateInput } from "./DateInput";
import { TimeInput } from "./TimeInput";

type RequestDateTimeFieldProps = {
  date: string;
  time?: string;
  onDateChange?: (value: string) => void;
  onTimeChange?: (value: string) => void;
  disabled?: boolean;
  /** Affiche le champ heure (défaut : oui). */
  showTime?: boolean;
  label?: string;
  /** Badge ou complément à droite du libellé (ex. « auto »). */
  dateLabelExtra?: ReactNode;
};

/**
 * Paire DatePicker + TimePicker sous un seul libellé.
 *
 * @param props - Valeurs contrôlées, callbacks, verrouillage éventuel
 */
export function RequestDateTimeField({
  date,
  time,
  onDateChange,
  onTimeChange,
  disabled = false,
  showTime = true,
  label = "Date et heure de la demande",
  dateLabelExtra
}: RequestDateTimeFieldProps) {
  return (
    <div className="mc-field request-datetime-field">
      {dateLabelExtra ? (
        <span className="mc-label-row">
          <span>{label}</span>
          {dateLabelExtra}
        </span>
      ) : (
        <span>{label}</span>
      )}
      <div className="request-datetime-field__controls">
        <DateInput
          value={date}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onDateChange?.(e.target.value)}
        />
        {showTime ? (
          <TimeInput
            value={time || ""}
            disabled={disabled}
            aria-label="Heure"
            onChange={(value) => onTimeChange?.(value)}
          />
        ) : null}
      </div>
    </div>
  );
}
