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
  /** Durée d'affichage en ms avant disparition auto. */
  durationMs: number;
};

/**
 * API de notification partagée (AppShell → pages / presenters).
 * Une chaîne vide est ignorée (compatibilité avec d'anciens `onError("")`).
 */
export type NotifyToast = (message: string, variant?: ToastVariant) => void;

/** Durées par défaut (ms), proches de RenExtract ; succès à 5 s comme demandé labo. */
export const TOAST_DURATIONS_MS: Record<ToastVariant, number> = {
  success: 5000,
  warning: 5000,
  error: 7000
};

/** Nombre maximum de toasts visibles simultanément. */
export const TOAST_STACK_MAX = 4;
