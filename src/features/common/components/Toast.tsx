/**
 * Pile de notifications toast (bas-droite), max 4, clic pour fermer.
 * Variantes : success (vert), warning (orange), error (rouge).
 */

import type { ToastItem, ToastVariant } from "../model/toast.types";

type ToastStackProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

/**
 * Libellé accessible selon la sévérité.
 *
 * @param variant - Type de toast
 * @returns Rôle ARIA adapté
 */
function ariaRoleForVariant(variant: ToastVariant): "status" | "alert" {
  return variant === "error" ? "alert" : "status";
}

/**
 * Affiche la pile de toasts empilés vers le haut depuis le bas-droit.
 *
 * @param props.toasts - Entrées visibles (ordre chronologique)
 * @param props.onDismiss - Fermeture manuelle (clic)
 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.variant}`}
          role={ariaRoleForVariant(toast.variant)}
          title="Fermer la notification"
          aria-label={`${toast.message} — Fermer`}
          onClick={() => onDismiss(toast.id)}
        >
          <span className="toast__message">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
