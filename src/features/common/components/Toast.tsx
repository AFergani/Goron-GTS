/**
 * Notification éphémère en bas d’écran (message utilisateur court).
 *
 * Affichage conditionnel : rien si `message` est vide. Le délai de disparition
 * est géré par le parent (`AppShell` : `setTimeout` ~2,6 s sur l’état `toast`).
 */

type ToastProps = {
  message: string;
  variant?: "default" | "error";
};

export function Toast({ message, variant = "default" }: ToastProps) {
  if (!message) return null;
  return (
    <div className={variant === "error" ? "toast toast--error" : "toast"} role={variant === "error" ? "alert" : "status"}>
      {message}
    </div>
  );
}
