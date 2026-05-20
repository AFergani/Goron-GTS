import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { GardiennagePlanningLineV1 } from "../model/gardiennage.types";
import { GARDIENNAGE_WEEKDAY_BITS } from "../model/gardiennagePlanningCalendar";

type GardiennagePlanningLineWeekdaysProps = {
  line: GardiennagePlanningLineV1;
  disabled?: boolean;
  onChange: (patch: Partial<GardiennagePlanningLineV1>) => void;
};

export function GardiennagePlanningLineWeekdays({
  line,
  disabled = false,
  onChange
}: GardiennagePlanningLineWeekdaysProps) {
  if (line.anchorDate) {
    return (
      <p className="muted mc-ref-hint gardiennage-planning-line__weekday-hint">
        Ligne datée : les jours de la semaine et jours fériés ne s&apos;appliquent pas.
      </p>
    );
  }

  return (
    <div className="gardiennage-planning-line__weekday-toggles">
      <span className="gardiennage-planning-line__weekday-lead muted">L à D</span>
      {GARDIENNAGE_WEEKDAY_BITS.map((d) => (
        <ToggleSwitch
          key={d.bit}
          label={d.label}
          checked={(line.weekdaysMask & d.bit) !== 0}
          disabled={disabled}
          labelFirst
          onChange={(next) =>
            onChange({ weekdaysMask: next ? line.weekdaysMask | d.bit : line.weekdaysMask & ~d.bit })
          }
        />
      ))}
      <ToggleSwitch
        label="Jours fériés"
        checked={line.includeHolidays}
        disabled={disabled}
        labelFirst
        onChange={(next) => onChange({ includeHolidays: next })}
      />
    </div>
  );
}
