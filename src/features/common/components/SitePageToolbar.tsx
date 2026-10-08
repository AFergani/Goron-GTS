/**
 * Barre commune : recherche de site et actions en boutons libellés.
 *
 * Utilisée par Remarques vidéo et PV Vidéo.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { SiteSearchInput } from "./SiteSearchInput";
import type { SiteRef } from "../../../types";

type SitePageToolbarProps = {
  sites: SiteRef[];
  selectedSite: SiteRef | null;
  onSelectedSiteChange: (site: SiteRef | null) => void;
  onCopyNotify?: (message: string) => void;
  labelText?: string;
  /** La recherche occupe toute la largeur restante avant les boutons. */
  fill?: boolean;
  children?: ReactNode;
};

/**
 * Recherche de site à gauche, boutons d'action à droite du champ.
 */
export function SitePageToolbar({
  sites,
  selectedSite,
  onSelectedSiteChange,
  onCopyNotify,
  labelText = "Site",
  fill = false,
  children
}: SitePageToolbarProps) {
  return (
    <div className={fill ? "site-page-toolbar site-page-toolbar--fill" : "site-page-toolbar"}>
      <SiteSearchInput
        sites={sites}
        selectedSite={selectedSite}
        onSelectedSiteChange={onSelectedSiteChange}
        labelText={labelText}
        copyNotify={onCopyNotify}
      />
      {children}
    </div>
  );
}

type ToolbarTextButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
};

/**
 * Bouton plein de barre : icône et libellé visibles.
 */
export function ToolbarTextButton({ icon, label, type = "button", ...rest }: ToolbarTextButtonProps) {
  return (
    <button type={type} className="toolbar-text-btn" {...rest}>
      {icon}
      {label}
    </button>
  );
}
