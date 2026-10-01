/**
 * Historique d'activité au-dessus du champ de saisie de la prochaine ligne.
 *
 * Le texte déjà enregistré reste en lecture seule. Le champ ne contient que le complément.
 */

type ActivityJournalPanelProps = {
  historyText: string;
  /** Ligne encore non enregistrée, affichée dans le même cadre que l'historique. */
  pendingLine?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  locked?: boolean;
  draftLabel: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
};

export function ActivityJournalPanel({
  historyText,
  pendingLine = "",
  draft,
  onDraftChange,
  locked = false,
  draftLabel,
  placeholder,
  required = false,
  minLength
}: ActivityJournalPanelProps) {
  const history = [String(historyText || "").trim(), String(pendingLine || "").trim()]
    .filter(Boolean)
    .join("\n---\n");
  return (
    <div className="activity-journal">
      {history ? (
        <pre className="activity-journal__history app-scrollbar">{history}</pre>
      ) : null}
      <label className="mc-field mc-field-full">
        <span>{draftLabel}</span>
        <textarea
          className="mc-textarea"
          rows={3}
          value={draft}
          readOnly={locked}
          required={required}
          minLength={required ? minLength : undefined}
          maxLength={2000}
          placeholder={placeholder}
          aria-label={draftLabel}
          onChange={(event) => onDraftChange(event.target.value)}
        />
      </label>
    </div>
  );
}
