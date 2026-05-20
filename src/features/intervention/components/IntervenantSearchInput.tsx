import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { IntervenantRef } from "../../../types";

function filterIntervenantsByName(intervenants: IntervenantRef[], query: string, limit = 50): IntervenantRef[] {
  const text = String(query || "").trim().toLowerCase();
  if (text.length < 3) return [];
  return intervenants.filter((item) => item.name.toLowerCase().includes(text)).slice(0, limit);
}

type IntervenantSearchInputProps = {
  intervenants: IntervenantRef[];
  disabled?: boolean;
  selectedIntervenant: IntervenantRef | null;
  onSelectedIntervenantChange: (intervenant: IntervenantRef | null) => void;
};

export function IntervenantSearchInput({
  intervenants,
  disabled,
  selectedIntervenant,
  onSelectedIntervenantChange
}: IntervenantSearchInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!selectedIntervenant) {
      setQuery("");
      return;
    }
    setQuery(selectedIntervenant.name);
  }, [selectedIntervenant]);

  const filtered = useMemo(() => filterIntervenantsByName(intervenants, query), [intervenants, query]);
  const canSearch = query.trim().length >= 3;
  const showList = open && canSearch && !disabled && !selectedIntervenant;
  const showNoResultsHint = !selectedIntervenant && canSearch && filtered.length === 0 && !disabled;
  const showClear = !disabled && Boolean(query.trim() || selectedIntervenant);

  const clearField = () => {
    setQuery("");
    onSelectedIntervenantChange(null);
    setOpen(false);
  };

  const onInputChange = (value: string) => {
    setQuery(value);
    if (selectedIntervenant && selectedIntervenant.name !== value.trim()) {
      onSelectedIntervenantChange(null);
    }
  };

  const pick = (item: IntervenantRef) => {
    onSelectedIntervenantChange(item);
    setQuery(item.name);
    setOpen(false);
  };

  return (
    <div className="mc-site-field-wrap">
      <label className="mc-field">
        <span>Prestataire</span>
        <div className={`mc-site-input-inner${showClear ? " mc-site-input-inner--with-clear" : ""}`}>
          <input
            type="text"
            value={query}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 180);
            }}
            placeholder="Prestataire — 3 caractères minimum"
            title="Saisissez au moins 3 caractères pour rechercher un prestataire."
            disabled={disabled}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showList && filtered.length > 0}
            className="mc-site-code-input"
          />
          {showClear ? (
            <button
              type="button"
              className="mc-site-clear-icon-btn action-icon-btn"
              title="Effacer la recherche prestataire"
              aria-label="Effacer la recherche prestataire"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearField}
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
          {showList && filtered.length > 0 ? (
            <ul className="mc-site-suggest app-scrollbar" role="listbox">
              {filtered.map((item) => (
                <li key={item.id} role="option">
                  <button
                    type="button"
                    className="mc-site-suggest-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(item)}
                  >
                    <span className="mc-site-suggest-name">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </label>
      {showNoResultsHint ? <p className="muted mc-site-hint">Aucun prestataire ne correspond à cette recherche.</p> : null}
    </div>
  );
}
