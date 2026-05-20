import type { ReactNode } from "react";

/** Modales métier « Nouvelle … » à titre uniforme */
export type CreateEntryModalKind = "mainCourante" | "ronde" | "intervention" | "gardiennage";

const TITLES: Record<CreateEntryModalKind, string> = {
  mainCourante: "Nouvelle Main courante",
  ronde: "Nouvelle Ronde",
  intervention: "Nouvelle Intervention",
  gardiennage: "Nouveau Gardiennage"
};

export function CreateEntryModalHeader({
  kind,
  onCloseRequest
}: {
  kind: CreateEntryModalKind;
  onCloseRequest: () => void;
}) {
  return (
    <header className="mc-modal-head mc-modal-head-compact mc-create-entry-modal-head">
      <h3 className="mc-modal-title">{TITLES[kind]}</h3>
      <button type="button" className="mc-modal-close" aria-label="Fermer" onClick={onCloseRequest}>
        ×
      </button>
    </header>
  );
}

/** Pied réservé à la création : Annuler | textes d&apos;aide | Créer (submit) */
export function CreateEntryModalFooter({
  hintContent,
  onCancel,
  submitDisabled,
  submitLabel = "Créer",
  submitting = false,
  submittingLabel = "Enregistrement…"
}: {
  hintContent: ReactNode;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  submitting?: boolean;
  submittingLabel?: string;
}) {
  return (
    <div className="mc-modal-footer mc-modal-footer-create-unified">
      <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
        Annuler
      </button>
      <div className="mc-modal-footer-hints-center muted">{hintContent}</div>
      <button type="submit" className="mc-btn-primary" disabled={Boolean(submitDisabled) || submitting}>
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
