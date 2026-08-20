/**
 * Recherche site par code ou nom (autocomplete, min. 3 caractères).
 *
 * Site facultatif (`optional`). Copie du code site si sélection catalogue.
 * Réutilisé par : main courante, interventions, rondes, gardiennage.
 */

import { Copy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SiteRef } from "../../../types";
import { PendingSiteIntervenantRefActions } from "../../common/components/PendingSiteIntervenantRefActions";
import { copySiteDisplayCode } from "../../common/utils/siteDisplayCopy";
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
    setOpen(false);
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (selectedSite && formatSiteSelectedLabel(selectedSite) !== value.trim()) {
      onSelectedSiteChange(null);
    }
  };

  const pick = (site: SiteRef) => {
    onSelectedSiteChange(site);
    setQuery(formatSiteSelectedLabel(site));
    setOpen(false);
  };

  return (
    <div className="mc-site-field-wrap">
      <div className="mc-field-with-inline-action">
        <label className="mc-field">
          {labelText !== null && labelText !== undefined ? <span>{labelText ?? (optional ? "Site (facultatif)" : "Site")}</span> : null}
          <div className={innerClassName}>
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setOpen(false), 180);
              }}
              placeholder="Code site — 3 caractères minimum"
              title="Saisissez au moins 3 caractères pour rechercher parmi les codes et les noms de site."
              disabled={disabled}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showList && filtered.length > 0}
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
            {showList && filtered.length > 0 ? (
              <ul className="mc-site-suggest app-scrollbar" role="listbox">
                {filtered.map((s) => (
                  <li key={s.id} role="option">
                    <button
                      type="button"
                      className="mc-site-suggest-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(s)}
                    >
                      <span className="mc-site-suggest-code">{s.code}</span>
                      <span className="mc-site-suggest-name">{s.name}</span>
                      {s.parc?.trim() ? <span className="mc-site-suggest-parc">{s.parc}</span> : null}
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
              <div className="pending-ref-inline-grid">
                <label className="mc-field">
                  <span>Nouveau code site</span>
                  <input value="" onChange={() => {}} />
                </label>
                <label className="mc-field">
                  <span>Nouveau nom de site</span>
                  <input value="" onChange={() => {}} />
                </label>
              </div>
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
