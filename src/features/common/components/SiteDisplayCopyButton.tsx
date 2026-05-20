import { copySiteDisplayCode } from "../utils/siteDisplayCopy";

type SiteDisplayCopyButtonProps = {
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
