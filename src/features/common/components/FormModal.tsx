/**
 * Modale formulaire réutilisable (titre, contenu, annuler / soumettre).
 *
 * Utilisée pour les créations référentiel, alertes à bouton unique ou formulaires
 * métier avec validation locale avant soumission async.
 * Échap ferme la fenêtre ; si un champ a été modifié, une confirmation d’abandon s’affiche.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { useCreateModalCloseGuard } from "../hooks/useCreateModalCloseGuard";

type FormModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Masque le bouton annuler (alerte à bouton unique) */
  hideCancel?: boolean;
  /** Désactive les actions pendant une opération externe */
  busy?: boolean;
  error?: string;
  submitDisabled?: boolean;
};

/**
 * Empreinte des champs natifs d’une modale (détection de saisie sans lier chaque state).
 *
 * @param root - Conteneur de la modale
 * @returns Chaîne comparable entre deux instantanés
 */
function serializeModalFieldValues(root: HTMLElement | null): string {
  if (!root) return "";
  const nodes = root.querySelectorAll("input, textarea, select");
  const parts: string[] = [];
  nodes.forEach((node, index) => {
    if (node instanceof HTMLInputElement) {
      if (node.type === "button" || node.type === "submit" || node.type === "reset" || node.type === "hidden") {
        return;
      }
      if (node.type === "file") {
        parts.push(`${index}:file:${node.files?.length ?? 0}:${node.value}`);
        return;
      }
      if (node.type === "checkbox" || node.type === "radio") {
        parts.push(`${index}:${node.name}:${node.checked ? "1" : "0"}`);
        return;
      }
      parts.push(`${index}:${node.name}:${node.value}`);
      return;
    }
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      parts.push(`${index}:${node.name}:${node.value}`);
    }
  });
  return parts.join("\n");
}

export function FormModal({
  isOpen,
  title,
  onClose,
  children,
  onSubmit,
  submitLabel = "Enregistrer",
  cancelLabel = "Annuler",
  hideCancel = false,
  busy = false,
  error,
  submitDisabled = false
}: FormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const bodyRef = useRef<HTMLElement>(null);
  const snapshotRef = useRef("");
  const disabled = busy || isSubmitting;

  useEffect(() => {
    if (!isOpen) {
      snapshotRef.current = "";
      setIsDirty(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      snapshotRef.current = serializeModalFieldValues(bodyRef.current);
      setIsDirty(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const root = bodyRef.current;
    if (!root) return;
    const sync = () => {
      setIsDirty(serializeModalFieldValues(root) !== snapshotRef.current);
    };
    const onSwitchClick = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[role="switch"]')) sync();
    };
    root.addEventListener("input", sync);
    root.addEventListener("change", sync);
    root.addEventListener("click", onSwitchClick);
    return () => {
      root.removeEventListener("input", sync);
      root.removeEventListener("change", sync);
      root.removeEventListener("click", onSwitchClick);
    };
  }, [isOpen]);

  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } = useCreateModalCloseGuard({
    enabled: isOpen && !disabled,
    isDirty,
    onClose
  });

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!onSubmit || disabled || submitDisabled) return;
    setIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={() => (!disabled ? requestClose() : undefined)}>
        <section ref={bodyRef} className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{title}</h3>
          {children}
          {error ? <p className="error">{error}</p> : null}
          <div className="row-actions modal-actions">
            {!hideCancel ? (
              <button type="button" className="btn-light" onClick={requestClose} disabled={disabled}>
                {cancelLabel}
              </button>
            ) : null}
            {onSubmit ? (
              <button type="button" onClick={() => void handleSubmit()} disabled={disabled || submitDisabled}>
                {disabled ? "Enregistrement…" : submitLabel}
              </button>
            ) : null}
          </div>
        </section>
      </div>
      <ConfirmModal
        isOpen={showDiscardConfirm}
        title="Abandonner la saisie ?"
        message="Les informations saisies seront perdues."
        cancelLabel="Rester"
        confirmLabel="Abandonner"
        confirmClassName="btn-danger"
        onCancel={cancelDiscard}
        onConfirm={confirmDiscardAndClose}
      />
    </>
  );
}
