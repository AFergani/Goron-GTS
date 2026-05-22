/**
 * Notification éphémère en bas d’écran (message utilisateur court).
 *
 * Affichage conditionnel : rien si `message` est vide. Le délai de disparition
 * est géré par le parent (`AppShell` : `setTimeout` ~2,6 s sur l’état `toast`).
 */

type ToastProps = {
  message: string;
};

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
