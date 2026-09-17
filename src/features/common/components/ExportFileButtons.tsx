/**
 * Boutons d’export fichier : Excel en barre d’outils, Word en pied de fiche (modale).
 *
 * Libellés distincts de « Ouvrir la fiche » (liste) : enregistrer un .docx / .xlsx,
 * puis ouvrir ce fichier dans Word ou Excel.
 */

import { exportFileBasename } from "../utils/workstationExportPaths";

export const SAVE_WORD_LABEL = "Enregistrer Word";
export const OPEN_WORD_LABEL = "Ouvrir le Word";
export const OPEN_EXCEL_LABEL = "Ouvrir l'Excel";

type ListExportButtonsProps = {
  exportDisabled: boolean;
  canOpenLast: boolean;
  lastFilePath: string | null;
  onExport: () => void;
  onOpenLast: () => void;
  exportLabel?: string;
  exportTitle?: string;
  exportAriaLabel?: string;
};

/**
 * Couple « Exporter données » + « Ouvrir l'Excel » pour les listes.
 */
export function ListExportButtons({
  exportDisabled,
  canOpenLast,
  lastFilePath,
  onExport,
  onOpenLast,
  exportLabel = "Exporter données",
  exportTitle,
  exportAriaLabel
}: ListExportButtonsProps) {
  const openTitle = lastFilePath
    ? `Ouvrir ${exportFileBasename(lastFilePath)} dans Excel (disponible 20 s après l'export)`
    : "Ouvrir le dernier classeur Excel — réexportez pour réactiver le bouton (20 s)";
  return (
    <div className="export-file-buttons">
      <button
        type="button"
        className="btn-light"
        disabled={exportDisabled}
        title={exportTitle}
        aria-label={exportAriaLabel || exportLabel}
        onClick={onExport}
      >
        {exportLabel}
      </button>
      <button
        type="button"
        className="btn-light"
        disabled={!canOpenLast}
        title={openTitle}
        aria-label={OPEN_EXCEL_LABEL}
        onClick={onOpenLast}
      >
        {OPEN_EXCEL_LABEL}
      </button>
    </div>
  );
}

type WordExportRowButtonsProps = {
  onExportWord: () => void;
  onOpenReport: () => void;
  canOpenReport: boolean;
  lastFilePath: string | null;
  /** Pied de modale (`btn-light`) ; `table` conservé si un écran compact en a besoin. */
  variant?: "table" | "modal";
  disabled?: boolean;
};

/**
 * Couple « Enregistrer Word » + « Ouvrir le Word » (pied de fiche ouverte).
 */
export function WordExportRowButtons({
  onExportWord,
  onOpenReport,
  canOpenReport,
  lastFilePath,
  variant = "modal",
  disabled = false
}: WordExportRowButtonsProps) {
  const openTitle = lastFilePath
    ? `Ouvrir ${exportFileBasename(lastFilePath)} dans Word`
    : "Ouvrir le fichier Word déjà enregistré pour cette fiche";
  const isModal = variant === "modal";
  const saveClass = isModal
    ? "btn-light"
    : "table-action-btn table-action-btn--text table-action-btn--word";
  const openClass = isModal
    ? "btn-light"
    : "table-action-btn table-action-btn--text table-action-btn--open";
  return (
    <div className="export-file-buttons">
      <button
        type="button"
        className={saveClass}
        disabled={disabled}
        title="Enregistrer un fichier Word de cette fiche"
        aria-label={SAVE_WORD_LABEL}
        onClick={onExportWord}
      >
        {SAVE_WORD_LABEL}
      </button>
      <button
        type="button"
        className={openClass}
        disabled={disabled || !canOpenReport}
        title={openTitle}
        aria-label={OPEN_WORD_LABEL}
        onClick={onOpenReport}
      >
        {OPEN_WORD_LABEL}
      </button>
    </div>
  );
}
