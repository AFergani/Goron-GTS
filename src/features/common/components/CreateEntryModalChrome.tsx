/**
 * En-tête et pied de page communs des modales « Nouvelle entrée » (création métier).
 *
 * Uniformise titres et disposition Fermer | aides | Créer sur main courante,
 * intervention et ronde. Le type `gardiennage` est prévu dans les titres si une modale
 * l’adopte plus tard (gardiennage utilise aujourd’hui un chrome dédié).
 */

import type { ReactNode } from "react";

/** Modules métier supportés pour le titre de modale de création. */
type CreateEntryModalKind = "mainCourante" | "ronde" | "intervention" | "gardiennage";

const TITLES: Record<CreateEntryModalKind, string> = {
  mainCourante: "Nouvelle Main courante",
  ronde: "Nouvelle Ronde",
  intervention: "Nouvelle Intervention",
  gardiennage: "Nouveau Gardiennage"
};

/** Titre + bouton fermer (×) pour modales de création. */
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

/**
 * Pied de modale création : Fermer, zone d’aide centrale, bouton submit (type submit du formulaire parent).
 */
export function CreateEntryModalFooter({
  hintContent,
  onCancel,
  submitDisabled,
  submitLabel = "Créer",
  submitting = false,
  submittingLabel = "Enregistrement…"
}: {
  hintContent?: ReactNode;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  submitting?: boolean;
  submittingLabel?: string;
}) {
  return (
    <div className="mc-modal-footer mc-modal-footer-create-unified">
      <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
        Fermer
      </button>
      <div className="mc-modal-footer-hints-center muted">{hintContent ?? null}</div>
      <button type="submit" className="mc-btn-primary" disabled={Boolean(submitDisabled) || submitting}>
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
