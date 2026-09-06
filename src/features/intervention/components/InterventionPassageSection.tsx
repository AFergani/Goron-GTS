/**
 * Bloc passage : arrivée / départ / N° bon + compte-rendu.
 */

import { TimeInput } from "../../common/components/TimeInput";
import { INTERVENTION_NO_WORK_ORDER_LABEL } from "../model/intervention.types";

type InterventionPassageSectionProps = {
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  departureTime: string;
  workOrderNumber: string;
  report: string;
  formLockedClosed: boolean;
  shiftedAfterMidnight: boolean;
  onArrivalDateChange: (value: string) => void;
  onArrivalTimeChange: (value: string) => void;
  onDepartureDateChange: (value: string) => void;
  onDepartureTimeChange: (value: string) => void;
  onWorkOrderNumberChange: (value: string) => void;
  onReportChange: (value: string) => void;
};

export function InterventionPassageSection({
  arrivalDate,
  arrivalTime,
  departureDate,
  departureTime,
  workOrderNumber,
  report,
  formLockedClosed,
  shiftedAfterMidnight,
  onArrivalDateChange,
  onArrivalTimeChange,
  onDepartureDateChange,
  onDepartureTimeChange,
  onWorkOrderNumberChange,
  onReportChange
}: InterventionPassageSectionProps) {
  return (
    <>
      <div className="intervention-passage-row">
        <div className="intervention-passage-group">
          <span className="intervention-passage-group__label">Arrivée</span>
          <div className="intervention-passage-group__inputs">
            <input
              type="date"
              value={arrivalDate}
              disabled={formLockedClosed}
              aria-label="Date d'arrivée"
              onChange={(e) => onArrivalDateChange(e.target.value)}
            />
            <TimeInput
              value={arrivalTime}
              disabled={formLockedClosed}
              aria-label="Heure d'arrivée"
              onChange={onArrivalTimeChange}
            />
          </div>
        </div>
        <div className="intervention-passage-group">
          <span className="intervention-passage-group__label">Départ</span>
          <div className="intervention-passage-group__inputs">
            <input
              type="date"
              value={departureDate}
              disabled={formLockedClosed}
              aria-label="Date de départ"
              onChange={(e) => onDepartureDateChange(e.target.value)}
            />
            <TimeInput
              value={departureTime}
              disabled={formLockedClosed}
              aria-label="Heure de départ"
              onChange={onDepartureTimeChange}
            />
          </div>
        </div>
        <label className="mc-field intervention-passage-bon">
          <span>N° bon intervention</span>
          <input
            value={workOrderNumber}
            disabled={formLockedClosed}
            placeholder={INTERVENTION_NO_WORK_ORDER_LABEL}
            onChange={(e) => onWorkOrderNumberChange(e.target.value)}
          />
        </label>
      </div>
      {shiftedAfterMidnight ? (
        <p className="muted mc-ref-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          Date logique auto-calculée : passage après minuit détecté.
        </p>
      ) : null}
      <label className="mc-field mc-field-full">
        <span>Compte-rendu</span>
        <textarea
          value={report}
          disabled={formLockedClosed}
          onChange={(e) => onReportChange(e.target.value)}
          className="mc-textarea"
        />
      </label>
    </>
  );
}
