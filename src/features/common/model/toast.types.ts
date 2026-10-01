/**
 * Types du système de notifications toast (stack bas-droite).
 * Aligné sur le pattern RenExtract : succès / alerte / erreur.
 */

/** Sévérité visuelle d'un toast. */
export type ToastVariant = "success" | "warning" | "error";

/** Entrée affichée dans la pile (max 4). */
export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  /**
   * Durée d'affichage en ms avant disparition auto.
   * `0` : le toast reste jusqu'à fermeture manuelle (alerte orange ou rouge).
   */
  durationMs: number;
};

/**
 * API de notification partagée (AppShell → pages / presenters).
 * Une chaîne vide est ignorée (compatibilité avec d'anciens `onError("")`).
 */
export type NotifyToast = (message: string, variant?: ToastVariant) => void;

/**
 * Durées par défaut (ms).
 * Le succès disparaît seul. Les alertes orange et rouge restent jusqu'à la croix
 * ou un clic en dehors du toast.
 */
export const TOAST_DURATIONS_MS: Record<ToastVariant, number> = {
  success: 5000,
  warning: 0,
  error: 0
};

/** Nombre maximum de toasts visibles simultanément. */
export const TOAST_STACK_MAX = 4;
