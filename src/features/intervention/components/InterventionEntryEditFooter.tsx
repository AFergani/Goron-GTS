/**
 * Pied de modale édition : liens créer, enregistrer / clôturer / rouvrir, export Word.
 */

import { Link2 } from "lucide-react";
import { WordExportRowButtons } from "../../common/components/ExportFileButtons";
import type { InterventionEntry } from "../model/intervention.types";

type InterventionEntryEditFooterProps = {
  entry: InterventionEntry;
  isActionSubmitting: boolean;
  canOpenLinkedRonde?: boolean;
  canOpenLinkedGardiennage?: boolean;
  onClose: () => void;
  onOpenLinkedRonde?: () => void;
  onOpenLinkedGardiennage?: () => void;
  onRequestCancel: () => void;
  onCloseIntervention: () => void;
  onReopen: () => void;
  onSaveWord?: () => void;
  onOpenWord?: () => void;
  canOpenWord?: boolean;
  lastWordFilePath?: string | null;
};

export function InterventionEntryEditFooter({
  entry,
  isActionSubmitting,
  canOpenLinkedRonde,
  canOpenLinkedGardiennage,
  onClose,
  onOpenLinkedRonde,
  onOpenLinkedGardiennage,
  onRequestCancel,
  onCloseIntervention,
  onReopen,
  onSaveWord,
  onOpenWord,
  canOpenWord = false,
  lastWordFilePath = null
}: InterventionEntryEditFooterProps) {
  const showWordFileActions =
    Boolean(onSaveWord && onOpenWord) && (entry.status === "CLOTURE" || entry.status === "ANNULE");
  return (
    <div className="mc-modal-footer mc-modal-footer-split">
      <div className="mc-modal-footer-start">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="mc-modal-footer-end">
        {showWordFileActions && onSaveWord && onOpenWord ? (
          <WordExportRowButtons
            variant="modal"
            disabled={isActionSubmitting}
            onExportWord={onSaveWord}
            onOpenReport={onOpenWord}
            canOpenReport={canOpenWord}
            lastFilePath={lastWordFilePath}
          />
        ) : null}
        {canOpenLinkedRonde && onOpenLinkedRonde ? (
          <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onOpenLinkedRonde}>
            <span className="mc-footer-btn-with-icon">
              <Link2 size={16} aria-hidden />
              Créer une ronde
            </span>
          </button>
        ) : null}
        {canOpenLinkedGardiennage && onOpenLinkedGardiennage ? (
          <button type="button" className="btn-light" disabled={isActionSubmitting} onClick={onOpenLinkedGardiennage}>
            <span className="mc-footer-btn-with-icon">
              <Link2 size={16} aria-hidden />
              Créer un gardiennage
            </span>
          </button>
        ) : null}
        {entry.status === "EN_COURS" ? (
          <>
            <button
              type="button"
              className="btn-danger"
              disabled={isActionSubmitting}
              onClick={onRequestCancel}
              aria-label="Annuler l'intervention"
            >
              Annuler
            </button>
            <button type="submit" className="mc-btn-primary" disabled={isActionSubmitting}>
              {isActionSubmitting ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              className="btn-light"
              disabled={isActionSubmitting}
              onClick={onCloseIntervention}
              aria-label="Clôturer l'intervention"
            >
              Clôturer
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
