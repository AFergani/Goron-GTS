/**
 * Recherche site par code ou nom (autocomplete, min. 3 caractères).
 *
 * Site facultatif (`optional`). Copie du code site si sélection catalogue.
 * Navigation clavier : flèches haut/bas dans la liste, Entrée pour valider.
 * Utilisé par : main courante, interventions, rondes, Paramètres, SearchEntry.
 */

import { Copy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SiteRef } from "../../../types";
import { PendingSiteIntervenantRefActions } from "./PendingSiteIntervenantRefActions";
import { PendingSiteInlineFields } from "./PendingRefInlineFields";
import { copySiteDisplayCode } from "../utils/siteDisplayCopy";
import { useSuggestListKeyboard } from "../hooks/useSuggestListKeyboard";
import { filterSitesByCodeOrName, formatSiteSelectedLabel } from "../model/siteSearch";

type SiteSearchInputProps = {
  sites: SiteRef[];
  disabled?: boolean;
  selectedSite: SiteRef | null;
  onSelectedSiteChange: (site: SiteRef | null) => void;
  /** Si true, le site n’est pas obligatoire à la validation du formulaire */
  optional?: boolean;
  /** Toasts / retours utilisateur lors de la copie du code site (sélection catalogue). */
  copyNotify?: (message: string) => void;
  showPendingSiteForm?: boolean;
  onTogglePendingSite?: () => void;
  pendingSiteForm?: ReactNode;
  siteButtonLabel?: string;
  showSiteAction?: boolean;
  labelText?: string | null;
};

export function SiteSearchInput({
  sites,
  disabled,
  selectedSite,
  onSelectedSiteChange,
  optional,
  copyNotify,
  showPendingSiteForm = false,
  onTogglePendingSite,
  pendingSiteForm,
  siteButtonLabel = "À créer ?",
  showSiteAction,
  labelText = optional ? "Site (facultatif)" : "Site"
}: SiteSearchInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!selectedSite) {
      setQuery("");
    } else {
      setQuery(formatSiteSelectedLabel(selectedSite));
    }
  }, [selectedSite]);

  const filtered = useMemo(() => filterSitesByCodeOrName(sites, query), [sites, query]);
  const q = query.trim();
  const canSearch = q.length >= 3;
  /** Après sélection, le champ affiche « Nom (Code) » : la recherche ne « matche » plus — ne pas afficher « aucun résultat ». */
  const showList = open && canSearch && !disabled && !selectedSite;
  const showNoResultsHint = !selectedSite && canSearch && filtered.length === 0 && !disabled;
  const showCopyCode = Boolean(selectedSite);
  const showClear = !disabled && Boolean(query.trim() || selectedSite);
  const innerClassName = [
    "mc-site-input-inner",
    showCopyCode && showClear
      ? "mc-site-input-inner--with-clear-and-copy"
      : showCopyCode
        ? "mc-site-input-inner--with-copy"
        : showClear
          ? "mc-site-input-inner--with-clear"
          : ""
  ].filter(Boolean).join(" ");

  const clearField = () => {
    setQuery("");
    onSelectedSiteChange(null);
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (selectedSite && formatSiteSelectedLabel(selectedSite) !== value.trim()) {
      onSelectedSiteChange(null);
    }
  };

  const pick = useCallback(
    (site: SiteRef) => {
      onSelectedSiteChange(site);
      setQuery(formatSiteSelectedLabel(site));
      setOpen(false);
    },
    [onSelectedSiteChange]
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
          {labelText !== null && labelText !== undefined ? <span>{labelText ?? (optional ? "Site (facultatif)" : "Site")}</span> : null}
          <div className={innerClassName}>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setOpen(false), 180);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Code site — 3 caractères minimum"
              title="Saisissez au moins 3 caractères pour rechercher parmi les codes et les noms de site, puis utilisez les flèches et Entrée pour choisir."
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
                className={`mc-site-clear-icon-btn action-icon-btn${showCopyCode ? " mc-site-clear-icon-btn--before-copy" : ""}`}
                title="Effacer la recherche site"
                aria-label="Effacer la recherche site"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearField}
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
            {showCopyCode ? (
              <button
                type="button"
                className="mc-site-copy-icon-btn action-icon-btn"
                title="Copier le code site"
                aria-label="Copier le code site"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void copySiteDisplayCode(formatSiteSelectedLabel(selectedSite!), copyNotify)}
              >
                <Copy size={16} aria-hidden />
              </button>
            ) : null}
            {listIsOpen ? (
              <ul
                ref={listRef}
                id={listboxId}
                className="mc-site-suggest app-scrollbar"
                role="listbox"
                data-suggest-open="true"
              >
                {filtered.map((s, index) => (
                  <li
                    key={s.id}
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
                      onClick={() => pick(s)}
                    >
                      <span className="mc-site-suggest-code">{s.code}</span>
                      <span className="mc-site-suggest-name">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </label>
        {onTogglePendingSite ? (
          <PendingSiteIntervenantRefActions
            withIntervenant={false}
            selectedSite={selectedSite}
            showPendingSiteForm={showPendingSiteForm}
            onTogglePendingSite={onTogglePendingSite}
            pendingSiteForm={pendingSiteForm ?? <></>}
            siteButtonLabel={siteButtonLabel}
            showSiteAction={showSiteAction ?? !selectedSite}
          />
        ) : null}
      </div>
      {showPendingSiteForm && !selectedSite ? (
        <div className="pending-ref-inline-form-layout pending-ref-inline-form-layout--full">
          <div className="pending-ref-inline-form-column pending-ref-inline-form-column--full">
            {pendingSiteForm ?? (
              <PendingSiteInlineFields code="" name="" onCodeChange={() => {}} onNameChange={() => {}} />
            )}
          </div>
        </div>
      ) : null}
      {showNoResultsHint ? (
        <p className="muted mc-site-hint">Aucun site ne correspond à cette recherche.</p>
      ) : null}
    </div>
  );
}
