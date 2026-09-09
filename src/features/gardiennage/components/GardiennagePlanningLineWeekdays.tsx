/**
 * Ligne de planning : interrupteurs Lun–Dim + veilles / jours fériés (masque `weekdaysMask`).
 *
 * Masqué si la ligne a une `anchorDate` (journée ponctuelle ancrée).
 * Verrou possible si la plage de validité est courte (≤ 7 jours).
 */

import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { GardiennagePlanningLineV1 } from "../model/gardiennage.types";
import { GARDIENNAGE_WEEKDAY_BITS } from "../model/gardiennagePlanningCalendar";

type GardiennagePlanningLineWeekdaysProps = {
  line: GardiennagePlanningLineV1;
  disabled?: boolean;
  /** Plage de validité courte : jours / fériés figés. */
  lockWeekdaysFromValidityRange?: boolean;
  onChange: (patch: Partial<GardiennagePlanningLineV1>) => void;
};

export function GardiennagePlanningLineWeekdays({
  line,
  disabled = false,
  lockWeekdaysFromValidityRange = false,
  onChange
}: GardiennagePlanningLineWeekdaysProps) {
  if (line.anchorDate) {
    return (
      <p className="muted mc-ref-hint gardiennage-planning-line__weekday-hint">
        Ligne datée : les jours de la semaine et jours fériés ne s&apos;appliquent pas.
      </p>
    );
  }

  const togglesDisabled = disabled || lockWeekdaysFromValidityRange;

  return (
    <div className="gardiennage-planning-line__weekday-toggles">
      <span className="gardiennage-planning-line__weekday-lead muted">L à D</span>
      {GARDIENNAGE_WEEKDAY_BITS.map((d) => (
        <ToggleSwitch
          key={d.bit}
          label={d.label}
          checked={(line.weekdaysMask & d.bit) !== 0}
          disabled={togglesDisabled}
          labelFirst
          onChange={(next) =>
            onChange({ weekdaysMask: next ? line.weekdaysMask | d.bit : line.weekdaysMask & ~d.bit })
          }
        />
      ))}
      <ToggleSwitch
        label="Veille jour férié"
        checked={line.includeHolidayEves}
        disabled={togglesDisabled}
        labelFirst
        onChange={(next) => onChange({ includeHolidayEves: next })}
      />
      <ToggleSwitch
        label="Jours fériés"
        checked={line.includeHolidays}
        disabled={togglesDisabled}
        labelFirst
        onChange={(next) => onChange({ includeHolidays: next })}
      />
    </div>
  );
}
