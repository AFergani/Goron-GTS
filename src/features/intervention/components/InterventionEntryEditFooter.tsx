/**
 * Pied de modale édition : facturation, liens créer, enregistrer / clôturer / rouvrir.
 */

import { Link2 } from "lucide-react";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { InterventionEntry } from "../model/intervention.types";

type InterventionEntryEditFooterProps = {
  entry: InterventionEntry;
  mode: "edit" | "facturation";
  isBillable: boolean;
  allowFacturationToggle: boolean;
  isActionSubmitting: boolean;
  canOpenLinkedRonde?: boolean;
  canOpenLinkedGardiennage?: boolean;
  onClose: () => void;
  onRequestNonBillable: () => void;
  onSetFacturable: () => void;
  onOpenLinkedRonde?: () => void;
  onOpenLinkedGardiennage?: () => void;
  onRequestCancel: () => void;
  onCloseIntervention: () => void;
  onReopen: () => void;
};

export function InterventionEntryEditFooter({
  entry,
  mode,
  isBillable,
  allowFacturationToggle,
  isActionSubmitting,
  canOpenLinkedRonde,
  canOpenLinkedGardiennage,
  onClose,
  onRequestNonBillable,
  onSetFacturable,
  onOpenLinkedRonde,
  onOpenLinkedGardiennage,
  onRequestCancel,
  onCloseIntervention,
  onReopen
}: InterventionEntryEditFooterProps) {
  return (
    <div className="mc-modal-footer mc-modal-footer-split">
      <div className="mc-modal-footer-start">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="mc-modal-footer-end">
        {allowFacturationToggle ? (
          <div style={{ width: 170, flexShrink: 0 }}>
            <ToggleSwitch
              label="Facturable"
              labelFirst
              checked={isBillable}
              onChange={(next) => {
                if (next) {
                  onSetFacturable();
                  return;
                }
                onRequestNonBillable();
              }}
            />
          </div>
        ) : null}
        {mode === "edit" && canOpenLinkedRonde && onOpenLinkedRonde ? (
          <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onOpenLinkedRonde}>
            <span className="mc-footer-btn-with-icon">
              <Link2 size={16} aria-hidden />
              Créer une ronde
            </span>
          </button>
        ) : null}
        {mode === "edit" && canOpenLinkedGardiennage && onOpenLinkedGardiennage ? (
          <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onOpenLinkedGardiennage}>
            <span className="mc-footer-btn-with-icon">
              <Link2 size={16} aria-hidden />
              Créer un gardiennage
            </span>
          </button>
        ) : null}
        {entry.status === "EN_COURS" ? (
          <>
            <button type="button" className="btn-danger" disabled={isActionSubmitting} onClick={onRequestCancel}>
              Annuler l&apos;intervention
            </button>
            <button type="submit" className="mc-btn-primary" disabled={isActionSubmitting}>
              {isActionSubmitting ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onCloseIntervention}>
              Clôturer l&apos;intervention
            </button>
          </>
        ) : entry.status === "CLOTURE" || entry.status === "ANNULE" ? (
          <button type="button" className="mc-btn-primary" disabled={isActionSubmitting} onClick={onReopen}>
            Rouvrir
          </button>
        ) : (
          <button type="submit" className="mc-btn-primary" disabled={isActionSubmitting}>
            {isActionSubmitting ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
      </div>
    </div>
  );
}
