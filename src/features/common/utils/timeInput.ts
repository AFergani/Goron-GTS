/**
 * Saisie horaire compacte pour les champs `type="time"` (Entrée / blur).
 *
 * Exemples : `12` → `12:00`, `1` ou `01` → `01:00`, `1230` → `12:30`.
 */

/**
 * Indique si la valeur est une heure 24 h valide (`HH:MM`).
 *
 * @param value - Chaîne à tester
 * @returns `true` si format et plage valides
 */
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

/**
 * Normalise une saisie compacte en `HH:MM`, ou retourne une chaîne vide si invalide.
 *
 * @param value - Chiffres seuls, `HH:MM` partiel ou complet
 * @returns Heure normalisée, ou chaîne vide si non interprétable
 */
export function normalizeTimeForSave(value: string): string {
  const normalized = normalizeCompactTimeInput(value);
  return normalized ?? "";
}

/**
 * Interprète une saisie rapide (1 à 4 chiffres ou `H:MM`) en heure complète.
 *
 * @param input - Valeur brute du champ
 * @returns `HH:MM` ou `null` si invalide
 */
export function normalizeCompactTimeInput(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (isValidTime(raw)) return raw;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 1) {
    const h = Number(digits);
    if (h >= 0 && h <= 9) return `0${h}:00`;
  }
  if (digits.length === 2) {
    const h = Number(digits);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }
  if (digits.length === 3) {
    const h = Number(digits.slice(0, 1));
    const m = Number(digits.slice(1));
    if (h <= 9 && m <= 59) return `0${h}:${String(m).padStart(2, "0")}`;
  }
  if (digits.length === 4) {
    const h = Number(digits.slice(0, 2));
    const m = Number(digits.slice(2));
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const partial = raw.match(/^(\d{1,2}):(\d{0,2})$/);
  if (partial) {
    const h = Number(partial[1]);
    const minPart = partial[2];
    const m = minPart === "" ? 0 : Number(minPart);
    if (Number.isFinite(h) && Number.isFinite(m) && h <= 23 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  return null;
}
