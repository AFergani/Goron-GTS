/**
 * Pile de notifications toast (bas-droite), max 4.
 * Succès : fermeture automatique. Alerte orange ou rouge : croix ou clic à l'extérieur.
 */

import { useEffect } from "react";
import { X } from "lucide-react";
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
  return variant === "success" ? "status" : "alert";
}

/**
 * Affiche la pile de toasts empilés vers le haut depuis le bas-droit.
 * Largeur et hauteur suivent le texte, plafonnées à 15 cm × 5 cm.
 *
 * @param props.toasts - Entrées visibles (ordre chronologique)
 * @param props.onDismiss - Fermeture manuelle
 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  const persistentKey = toasts
    .filter((toast) => toast.variant !== "success")
    .map((toast) => toast.id)
    .join("\0");

  useEffect(() => {
    const ids = persistentKey ? persistentKey.split("\0") : [];
    if (!ids.length) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".toast")) return;
      for (const id of ids) onDismiss(id);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onDismiss, persistentKey]);

  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const persistent = toast.variant !== "success";
        const message = <span className="toast__message app-scrollbar">{toast.message}</span>;
        if (!persistent) {
          return (
            <div
              key={toast.id}
              className={`toast toast--${toast.variant}`}
              role={ariaRoleForVariant(toast.variant)}
              tabIndex={0}
              title="Fermer la notification"
              onClick={() => onDismiss(toast.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onDismiss(toast.id);
              }}
            >
              {message}
            </div>
          );
        }
        return (
          <div key={toast.id} className={`toast toast--${toast.variant}`} role={ariaRoleForVariant(toast.variant)}>
            {message}
            <button
              type="button"
              className="toast__close"
              aria-label="Fermer la notification"
              title="Fermer"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
