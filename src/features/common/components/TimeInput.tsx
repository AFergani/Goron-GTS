/**
 * Champ horaire partagé : picker natif + saisie rapide (ex. `12` + Entrée → `12:00`).
 *
 * Utilisé sur toutes les modales métier (intervention, ronde, gardiennage).
 */

import { useRef, type InputHTMLAttributes } from "react";
import { normalizeCompactTimeInput } from "../utils/timeInput";

export type TimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Normaliser aussi à la perte de focus (défaut : oui). */
  normalizeOnBlur?: boolean;
};

/**
 * Champ `type="time"` avec normalisation Entrée / blur pour saisie compacte.
 *
 * @param props - Valeur contrôlée, callback `onChange`, props HTML transmises à l'input
 */
export function TimeInput({
  value,
  onChange,
  normalizeOnBlur = true,
  onKeyDown,
  onBlur,
  onFocus,
  step = 60,
  disabled,
  ...rest
}: TimeInputProps) {
  const digitBufferRef = useRef("");

  const tryNormalize = (source: string) => {
    const next = normalizeCompactTimeInput(source);
    if (!next) return false;
    if (next !== value) onChange(next);
    return true;
  };

  return (
    <input
      type="time"
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        digitBufferRef.current = "";
        onChange(event.target.value);
      }}
      onFocus={(event) => {
        digitBufferRef.current = "";
        onFocus?.(event);
      }}
      onKeyDown={(event) => {
        if (!disabled) {
          if (/^\d$/.test(event.key)) {
            digitBufferRef.current += event.key;
          } else if (event.key === "Backspace") {
            digitBufferRef.current = digitBufferRef.current.slice(0, -1);
          } else if (event.key === "Enter") {
            const source = digitBufferRef.current || event.currentTarget.value;
            if (tryNormalize(source)) {
              event.preventDefault();
            }
            digitBufferRef.current = "";
          } else if (event.key === "Escape") {
            digitBufferRef.current = "";
          }
        }
        onKeyDown?.(event);
      }}
      onBlur={(event) => {
        if (!disabled && normalizeOnBlur) {
          const source = digitBufferRef.current || event.currentTarget.value;
          tryNormalize(source);
          digitBufferRef.current = "";
        }
        onBlur?.(event);
      }}
      {...rest}
    />
  );
}
