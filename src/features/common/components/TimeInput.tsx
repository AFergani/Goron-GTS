/**
 * Champ horaire partagé : picker natif + saisie rapide (ex. `1500` + Tab → `15:00`).
 *
 * Utilisé sur toutes les modales métier (intervention, ronde, gardiennage).
 */

import { useRef, type InputHTMLAttributes } from "react";
import { normalizeCompactTimeInput } from "../utils/timeInput";

type TimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Normaliser aussi à la perte de focus (défaut : oui). */
  normalizeOnBlur?: boolean;
};

/**
 * Champ `type="time"` avec normalisation Entrée / Tab / blur pour saisie compacte.
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

  const flushDigitBuffer = (fallbackValue: string) => {
    const source = digitBufferRef.current || fallbackValue;
    const ok = tryNormalize(source);
    digitBufferRef.current = "";
    return ok;
  };

  return (
    <input
      type="time"
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        // Ne pas vider le buffer ici : le navigateur déclenche onChange à chaque
        // segment HH/MM pendant la saisie chiffée, ce qui cassait `1500` + Tab → `00:00`.
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
            if (flushDigitBuffer(event.currentTarget.value)) {
              event.preventDefault();
            }
          } else if (event.key === "Tab") {
            // Normaliser avant le blur / focus suivant (même logique que Entrée).
            flushDigitBuffer(event.currentTarget.value);
          } else if (event.key === "Escape") {
            digitBufferRef.current = "";
          } else if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight"
          ) {
            // Navigation / spinner natif : abandonner la saisie compacte en cours.
            digitBufferRef.current = "";
          }
        }
        onKeyDown?.(event);
      }}
      onBlur={(event) => {
        if (!disabled && normalizeOnBlur) {
          flushDigitBuffer(event.currentTarget.value);
        }
        onBlur?.(event);
      }}
      {...rest}
    />
  );
}
