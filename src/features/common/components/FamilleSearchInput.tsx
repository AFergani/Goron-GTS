/**
 * Recherche de famille de sites (autocomplete, min. 3 caractères).
 *
 * Même présentation que la recherche site ou prestataire.
 * La valeur saisie reste libre : une famille absente du référentiel peut être enregistrée.
 */

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSuggestListKeyboard } from "../hooks/useSuggestListKeyboard";
import { SuggestListPortal } from "./SuggestListPortal";

function filterFamilles(familles: string[], query: string, limit = 50): string[] {
  const text = String(query || "").trim().toUpperCase();
  if (text.length < 3) return [];
  return familles.filter((item) => item.toUpperCase().includes(text)).slice(0, limit);
}

type FamilleSearchInputProps = {
  familles: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  labelText?: string | null;
};

export function FamilleSearchInput({
  familles,
  value,
  onChange,
  disabled,
  labelText = "Famille"
}: FamilleSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => filterFamilles(familles, query), [familles, query]);
  const normalizedQuery = query.trim().toUpperCase();
  const canSearch = normalizedQuery.length >= 3;
  const selected = Boolean(normalizedQuery) && familles.some((item) => item.toUpperCase() === normalizedQuery);
  const showList = open && canSearch && !disabled && !selected;
  const showNoResultsHint = !selected && canSearch && filtered.length === 0 && !disabled;
  const showClear = !disabled && Boolean(query.trim());

  const clearField = () => {
    setQuery("");
    onChange("");
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onInputChange = (next: string) => {
    const upper = next.toUpperCase();
    setQuery(upper);
    onChange(upper);
    setOpen(true);
  };

  const pick = useCallback(
    (famille: string) => {
      const upper = famille.toUpperCase();
      onChange(upper);
      setQuery(upper);
      setOpen(false);
    },
    [onChange]
  );

  const listIsOpen = showList && filtered.length > 0;
  const { highlightedIndex, setHighlightedIndex, listboxId, getOptionId, activeDescendantId, listRef, onInputKeyDown } =
    useSuggestListKeyboard({
      items: filtered,
      isOpen: listIsOpen,
      onPick: pick,
      onDismiss: () => setOpen(false),
      resetKey: query
    });

  return (
    <div className="mc-site-field-wrap">
      <label className="mc-field">
        {labelText !== null && labelText !== undefined ? <span>{labelText}</span> : null}
        <div className={`mc-site-input-inner${showClear ? " mc-site-input-inner--with-clear" : ""}`}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            value={query}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 180);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Famille — 3 caractères minimum"
            title="Saisissez au moins 3 caractères pour rechercher une famille, puis utilisez les flèches et Entrée pour choisir."
            disabled={disabled}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={listIsOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendantId}
            className="mc-site-code-input"
          />
          {showClear ? (
            <button
              type="button"
              className="mc-site-clear-icon-btn action-icon-btn"
              title="Effacer la famille"
              aria-label="Effacer la famille"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearField}
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
          <SuggestListPortal open={listIsOpen} anchorRef={inputRef}>
            <ul
              ref={listRef}
              id={listboxId}
              className="mc-site-suggest app-scrollbar"
              role="listbox"
              data-suggest-open="true"
            >
              {filtered.map((famille, index) => (
                <li
                  key={famille}
                  id={getOptionId(index)}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  data-suggest-index={index}
                >
                  <button
                    type="button"
                    className={`mc-site-suggest-item${index === highlightedIndex ? " is-active" : ""}`}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => pick(famille)}
                  >
                    <span className="mc-site-suggest-name">{famille}</span>
                  </button>
                </li>
              ))}
            </ul>
          </SuggestListPortal>
        </div>
      </label>
      {showNoResultsHint ? <p className="muted mc-site-hint">Aucune famille ne correspond à cette recherche.</p> : null}
    </div>
  );
}
