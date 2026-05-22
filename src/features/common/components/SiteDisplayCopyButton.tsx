/**
 * Bouton affichant le libellé site et copiant le code entre parenthèses au clic.
 *
 * Délègue à `copySiteDisplayCode` (toast optionnel via `onNotify`). Variante visuelle
 * champ formulaire (`field`) ou cellule tableau (`table`). Pas d’UUID affiché — libellé métier uniquement.
 */

import { copySiteDisplayCode } from "../utils/siteDisplayCopy";

type SiteDisplayCopyButtonProps = {
  /** Libellé site affiché (ex. « Nom (CODE123) »). */
  siteLabel: string;
  onNotify?: (message: string) => void;
  /** Champ type formulaire (modales) ou cellule tableau */
  variant?: "field" | "table";
  className?: string;
};

export function SiteDisplayCopyButton({
  siteLabel,
  onNotify,
  variant = "field",
  className
}: SiteDisplayCopyButtonProps) {
  const display = siteLabel.trim() || "—";
  const cls =
    className ?? (variant === "table" ? "mc-site-copy-btn" : "mc-input-readonly mc-site-copy-field");

  return (
    <button
      type="button"
      className={cls}
      onClick={() => void copySiteDisplayCode(siteLabel, onNotify)}
      title="Copier le code site (entre parenthèses)"
      aria-label="Copier le code site"
    >
      {display}
    </button>
  );
}
