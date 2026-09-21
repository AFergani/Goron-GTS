import type { HolidayRef } from "../../../types";
import { getLocalDateIso } from "../../common/utils/localDateIso";

/**
 * Helpers calendrier en date/heure locales (Éviter toISOString() pour la partie date :
 * avant l’aube en Europe la date UTC peut être la veille, ce qui désaligne l’UI sur la sidebar).
 */
export function formatLocalDateIso(d: Date): string {
  return getLocalDateIso(d);
}

export function formatLocalTimeHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/**
 * Jours fériés fixes FR (métropole) reconduits automatiquement chaque année.
 * Les jours variables (Pâques/Ascension/Pentecôte...) restent gérés via la table de données.
 *
 * Les objets synthétiques sont renvoyés sous le type métier `HolidayRef` pour rester
 * compatible avec les hooks et composants qui stockent des jours fériés dans le state.
 */
export function buildFrenchFixedHolidaysForYear(year: number): HolidayRef[] {
  const yy = String(year);
  const fixed = [
    { md: "01-01", label: "Jour de l'An" },
    { md: "05-01", label: "Fête du Travail" },
    { md: "05-08", label: "Victoire 1945" },
    { md: "07-14", label: "Fête Nationale" },
    { md: "08-15", label: "Assomption" },
    { md: "11-01", label: "Toussaint" },
    { md: "11-11", label: "Armistice 1918" },
    { md: "12-25", label: "Noël" }
  ];
  return fixed.map((item) => {
    const dateIso = `${yy}-${item.md}`;
    return {
      id: `fr-fixed-${dateIso}`,
      dateIso,
      label: item.label,
      createdAt: "",
      updatedAt: null
    } satisfies HolidayRef;
  });
}

export function mergeWithFrenchFixedHolidays(existing: HolidayRef[], years: number[]): HolidayRef[] {
  const uniqYears = Array.from(new Set(years.filter((y) => Number.isFinite(y) && y >= 1900 && y <= 2200)));
  const merged = new Map<string, HolidayRef>();

  for (const item of existing) {
    if (!item?.dateIso) continue;
    merged.set(item.dateIso, item);
  }

  for (const year of uniqYears) {
    for (const item of buildFrenchFixedHolidaysForYear(year)) {
      if (merged.has(item.dateIso)) continue;
      merged.set(item.dateIso, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
