/**
 * Champ horaire partagé (intervention, ronde, gardiennage).
 *
 * Le sélecteur natif a deux cases : heures, puis minutes.
 * La frappe reste dans la case active et s'y affiche tout de suite.
 * Heures seules puis Tab : les minutes passent à 00.
 * Une saisie dans les minutes ne change que les minutes.
 */

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { isValidTime } from "../utils/timeInput";

type TimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Compléter les minutes à 00 si seule l'heure a été saisie (défaut : oui). */
  normalizeOnBlur?: boolean;
};

type EditedSegment = "hour" | "minute" | "full" | "arrow-hour" | null;

/**
 * Réduit la valeur native (`HH:mm` ou `HH:mm:ss`) à `HH:mm`.
 *
 * @param raw - Valeur du champ
 * @returns Heure valide, ou chaîne vide
 */
function canonicalTime(raw: string): string {
  const match = String(raw || "").trim().match(/^(\d{2}:\d{2})/);
  if (match && isValidTime(match[1])) return match[1];
  return "";
}

function splitTime(value: string): { hour: string; minute: string } {
  const canonical = canonicalTime(value);
  if (!canonical) return { hour: "", minute: "" };
  const [hour, minute] = canonical.split(":");
  return { hour, minute };
}

function hourFromDigits(digits: string): string | null {
  if (!/^\d{1,2}$/.test(digits)) return null;
  const hour = Number(digits);
  if (hour > 23) return null;
  return String(hour).padStart(2, "0");
}

/** Passe au champ focusable suivant ou précédent, en dehors des cases internes de l'heure. */
function focusAdjacent(current: HTMLElement, backwards: boolean) {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  const nodes = Array.from(current.ownerDocument.querySelectorAll<HTMLElement>(selector)).filter((node) => {
    if (node.tabIndex < 0) return false;
    return node.getClientRects().length > 0;
  });
  const index = nodes.indexOf(current);
  if (index < 0) return;
  nodes[index + (backwards ? -1 : 1)]?.focus();
}

/**
 * Champ `type="time"` : cases heure et minutes indépendantes.
 *
 * Pendant la frappe, la valeur React n'est pas réécrite dans le champ,
 * sinon le chiffre en cours dans la case active disparaît.
 *
 * @param props - Valeur contrôlée, callback `onChange`, props HTML transmises à l'input
 */
export function TimeInput({
  value,
  onChange,
  normalizeOnBlur = true,
  onKeyDown,
  onKeyUp,
  onBlur,
  onFocus,
  step = 60,
  disabled,
  ...rest
}: TimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const focusValueRef = useRef(value);
  const nativeValueRef = useRef(value);
  const lastSegmentRef = useRef<EditedSegment>(null);
  const editKindRef = useRef<"digit" | "arrow" | null>(null);
  /** Chiffres tapés dans la case des heures, avant un passage aux minutes. */
  const hourDigitsRef = useRef("");
  /** L'utilisateur a modifié la case des minutes pendant ce passage. */
  const minuteModeRef = useRef(false);
  /** Heure imposée au Tab (HH:00) : le blur natif ne doit pas la réécrire. */
  const lockedValueRef = useRef<string | null>(null);
  /** L'heure vient d'être validée : le prochain chiffre va aux minutes. */
  const armedForMinutesRef = useRef(false);

  onChangeRef.current = onChange;
  valueRef.current = value;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || focusedRef.current || lockedValueRef.current) return;
    const next = canonicalTime(value);
    if (canonicalTime(el.value) !== next) el.value = next;
  }, [value]);

  const publish = (next: string) => {
    if (next === valueRef.current) return;
    valueRef.current = next;
    onChangeRef.current(next);
  };

  const noteSegmentChange = (previous: string, next: string) => {
    const before = splitTime(previous);
    const after = splitTime(next);
    if (!after.hour) return;
    if (before.hour !== after.hour && before.minute !== after.minute) {
      lastSegmentRef.current = "full";
      minuteModeRef.current = true;
      armedForMinutesRef.current = false;
    } else if (before.hour !== after.hour) {
      lastSegmentRef.current = editKindRef.current === "arrow" ? "arrow-hour" : "hour";
      if (lastSegmentRef.current === "hour") {
        minuteModeRef.current = false;
        armedForMinutesRef.current = true;
        hourDigitsRef.current = after.hour;
      }
    } else if (before.minute !== after.minute) {
      lastSegmentRef.current = "minute";
      minuteModeRef.current = true;
      armedForMinutesRef.current = false;
      hourDigitsRef.current = "";
    }
    nativeValueRef.current = next;
  };

  const hourOnlyEntry = () =>
    normalizeOnBlur &&
    !minuteModeRef.current &&
    lastSegmentRef.current !== "minute" &&
    lastSegmentRef.current !== "full" &&
    lastSegmentRef.current !== "arrow-hour" &&
    (lastSegmentRef.current === "hour" || hourFromDigits(hourDigitsRef.current) != null);

  const commit = (el: HTMLInputElement) => {
    let next = canonicalTime(el.value);
    const start = splitTime(focusValueRef.current);
    const final = splitTime(next);
    const typedHour = hourFromDigits(hourDigitsRef.current);
    let hour = final.hour;
    if (typedHour && (hour === start.hour || !hour)) hour = typedHour;
    if (hourOnlyEntry() && hour) {
      next = `${hour}:00`;
      lockedValueRef.current = next;
    }
    lastSegmentRef.current = null;
    hourDigitsRef.current = "";
    minuteModeRef.current = false;
    armedForMinutesRef.current = false;
    nativeValueRef.current = next;
    if (canonicalTime(el.value) !== next) el.value = next;
    return next;
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="time"
      step={step}
      defaultValue={canonicalTime(value)}
      disabled={disabled}
      onChange={(event) => {
        if (disabled) return;
        const locked = lockedValueRef.current;
        if (locked) {
          if (canonicalTime(event.target.value) !== locked) event.target.value = locked;
          publish(locked);
          return;
        }
        const next = canonicalTime(event.target.value);
        if (!next) return;
        noteSegmentChange(nativeValueRef.current, next);
        publish(next);
      }}
      onFocus={(event) => {
        focusedRef.current = true;
        const current = canonicalTime(event.currentTarget.value) || canonicalTime(valueRef.current);
        focusValueRef.current = current;
        nativeValueRef.current = current;
        lastSegmentRef.current = null;
        editKindRef.current = null;
        hourDigitsRef.current = "";
        minuteModeRef.current = false;
        armedForMinutesRef.current = false;
        lockedValueRef.current = null;
        onFocus?.(event);
      }}
      onKeyDown={(event) => {
        if (!disabled) {
          if (/^\d$/.test(event.key)) {
            editKindRef.current = "digit";
            lockedValueRef.current = null;
            if (armedForMinutesRef.current || minuteModeRef.current) {
              minuteModeRef.current = true;
              armedForMinutesRef.current = false;
            } else {
              hourDigitsRef.current = (hourDigitsRef.current + event.key).slice(0, 2);
            }
          } else if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight"
          ) {
            editKindRef.current = "arrow";
          } else if (event.key === "Enter" || event.key === "Tab") {
            if (!hourOnlyEntry()) {
              if (event.key === "Enter") {
                event.preventDefault();
                publish(commit(event.currentTarget));
              }
            } else {
              event.preventDefault();
              const el = event.currentTarget;
              publish(commit(el));
              if (event.key === "Tab") focusAdjacent(el, event.shiftKey);
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            const restore = focusValueRef.current;
            event.currentTarget.value = restore;
            lastSegmentRef.current = null;
            nativeValueRef.current = restore;
            publish(restore);
          }
        }
        onKeyDown?.(event);
      }}
      onKeyUp={(event) => {
        editKindRef.current = null;
        onKeyUp?.(event);
      }}
      onBlur={(event) => {
        const locked = lockedValueRef.current;
        if (!disabled && locked) {
          event.currentTarget.value = locked;
          publish(locked);
          window.setTimeout(() => {
            if (lockedValueRef.current === locked) lockedValueRef.current = null;
          }, 0);
        } else if (!disabled) {
          publish(commit(event.currentTarget));
        }
        focusedRef.current = false;
        onBlur?.(event);
      }}
    />
  );
}
