/**
 * En-tête édition : titre + liens ronde/gardiennage + fermer.
 */

type InterventionEntryEditHeaderProps = {
  title: string;
  linkedRondeId?: string | null;
  linkedGardiennageId?: string | null;
  onNavigateToLinkedRonde?: (rondeId: string) => void;
  onNavigateToLinkedGardiennage?: (gardiennageId: string) => void;
  onClose: () => void;
};

export function InterventionEntryEditHeader({
  title,
  linkedRondeId,
  linkedGardiennageId,
  onNavigateToLinkedRonde,
  onNavigateToLinkedGardiennage,
  onClose
}: InterventionEntryEditHeaderProps) {
  return (
    <header className="mc-modal-head mc-modal-head-compact">
      <h3 className="mc-modal-title">{title}</h3>
      <div className="row-actions">
        {linkedRondeId && onNavigateToLinkedRonde ? (
          <button
            type="button"
            className="btn-light"
            title="Ouvrir la ronde liée"
            aria-label="Ronde liée"
            onClick={() => {
              onNavigateToLinkedRonde(linkedRondeId);
              onClose();
            }}
          >
            Ronde liée
          </button>
        ) : null}
        {linkedGardiennageId && onNavigateToLinkedGardiennage ? (
          <button
            type="button"
            className="btn-light"
            title="Ouvrir le gardiennage lié"
            aria-label="Gardiennage lié"
            onClick={() => {
              onNavigateToLinkedGardiennage(linkedGardiennageId);
              onClose();
            }}
          >
            Gardiennage lié
          </button>
        ) : null}
        <button type="button" className="mc-modal-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
    </header>
  );
}
