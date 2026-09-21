/**
 * Confirmation d’abandon de saisie, partagée par FormModal et les modales métier.
 *
 * Variantes : brouillon générique, création d’entrée, édition avec modifications.
 */

import { ConfirmModal } from "./ConfirmModal";

export type DiscardConfirmKind = "draft" | "create" | "edit";

type DiscardConfirmModalProps = {
  isOpen: boolean;
  /** Brouillon générique par défaut ; création / édition pour les fiches métier. */
  kind?: DiscardConfirmKind;
  onCancel: () => void;
  onConfirm: () => void;
};

const COPY: Record<DiscardConfirmKind, { title: string; message: string; confirmLabel: string }> = {
  draft: {
    title: "Abandonner la saisie ?",
    message: "Les informations saisies seront perdues.",
    confirmLabel: "Abandonner"
  },
  create: {
    title: "Quitter la saisie ?",
    message: "Êtes-vous sûr de vouloir quitter sans créer l'entrée ? Les données saisies seront perdues.",
    confirmLabel: "Quitter sans créer"
  },
  edit: {
    title: "Quitter la saisie ?",
    message: "Les modifications non enregistrées seront perdues.",
    confirmLabel: "Abandonner"
  }
};

/**
 * Modale unique d’abandon, pour éviter de recopier titres et boutons.
 *
 * @param props.isOpen - Visible
 * @param props.kind - Ton du message (brouillon, création, édition)
 */
export function DiscardConfirmModal({
  isOpen,
  kind = "draft",
  onCancel,
  onConfirm
}: DiscardConfirmModalProps) {
  const copy = COPY[kind];
  return (
    <ConfirmModal
      isOpen={isOpen}
      title={copy.title}
      message={copy.message}
      cancelLabel="Rester"
      confirmLabel={copy.confirmLabel}
      confirmClassName="btn-danger"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
