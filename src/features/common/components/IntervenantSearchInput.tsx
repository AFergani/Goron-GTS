/**
 * Recherche prestataire (autocomplete, min. 3 caractères).
 *
 * Réutilisé via SearchEntry et les modales intervention / rondes.
 * Affiche le nom, pas d’identifiant technique.
 * Navigation clavier : flèches haut/bas dans la liste, Entrée pour valider.
 */

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { IntervenantRef, SiteRef } from "../../../types";
import { useSuggestListKeyboard } from "../hooks/useSuggestListKeyboard";
import { PendingSiteIntervenantRefActions } from "./PendingSiteIntervenantRefActions";
import { SuggestListPortal } from "./SuggestListPortal";

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
  selectedSite?: SiteRef | null;
  showPendingIntervenantForm?: boolean;
  onTogglePendingIntervenant?: () => void;
  pendingIntervenantForm?: ReactNode;
  intervenantButtonLabel?: string;
  showIntervenantAction?: boolean;
  labelText?: string | null;
};

export function IntervenantSearchInput({
  intervenants,
  disabled,
  selectedIntervenant,
  onSelectedIntervenantChange,
  selectedSite = null,
  showPendingIntervenantForm = false,
  onTogglePendingIntervenant,
  pendingIntervenantForm,
  intervenantButtonLabel = "À créer ?",
  showIntervenantAction,
  labelText = "Prestataire"
}: IntervenantSearchInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onInputChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (selectedIntervenant && selectedIntervenant.name !== value.trim()) {
      onSelectedIntervenantChange(null);
    }
  };

  const pick = useCallback(
    (item: IntervenantRef) => {
      onSelectedIntervenantChange(item);
      setQuery(item.name);
      setOpen(false);
    },
    [onSelectedIntervenantChange]
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
      <div className="mc-field-with-inline-action">
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
              placeholder="Prestataire — 3 caractères minimum"
              title="Saisissez au moins 3 caractères pour rechercher un prestataire, puis utilisez les flèches et Entrée pour choisir."
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
                title="Effacer la recherche prestataire"
                aria-label="Effacer la recherche prestataire"
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
                {filtered.map((item, index) => (
                  <li
                    key={item.id}
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
                      onClick={() => pick(item)}
                    >
                      <span className="mc-site-suggest-name">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </SuggestListPortal>
          </div>
        </label>
        {onTogglePendingIntervenant ? (
          <PendingSiteIntervenantRefActions
            withIntervenant={true}
            selectedSite={selectedSite}
            selectedIntervenant={selectedIntervenant}
            showPendingSiteForm={false}
            showPendingIntervenantForm={showPendingIntervenantForm}
            onTogglePendingSite={() => {}}
            onTogglePendingIntervenant={onTogglePendingIntervenant}
            pendingSiteForm={<></>}
            pendingIntervenantForm={pendingIntervenantForm ?? <></>}
            showSiteAction={false}
            showIntervenantAction={showIntervenantAction ?? !selectedIntervenant}
            intervenantButtonLabel={intervenantButtonLabel}
          />
        ) : null}
      </div>
      {showPendingIntervenantForm && !selectedIntervenant && pendingIntervenantForm ? (
        <div className="pending-ref-inline-form-layout pending-ref-inline-form-layout--full">
          <div className="pending-ref-inline-form-column pending-ref-inline-form-column--full">{pendingIntervenantForm}</div>
        </div>
      ) : null}
      {showNoResultsHint ? <p className="muted mc-site-hint">Aucun prestataire ne correspond à cette recherche.</p> : null}
    </div>
  );
}
