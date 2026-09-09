/**
 * Champ date partagé : même empreinte visuelle que « Date de la demande » (intervention).
 *
 * Largeurs / hauteur via design system global (`--gts-input-date-width`, contrôles).
 * Complète `TimeInput` pour les paires date + heure des modales métier.
 */

import type { InputHTMLAttributes } from "react";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Champ `type="date"` standardisé (valeur ISO `YYYY-MM-DD`).
 *
 * @param props - Props HTML transmises à l'input (value, onChange, disabled, …)
 */
export function DateInput(props: DateInputProps) {
  return <input type="date" {...props} />;
}
