/**
 * Jeton de session IPC et garde d'expiration pour `gtsApiClient`.
 *
 * `SessionProvider` / `AppShell` enregistrent le jeton et le callback de déconnexion.
 * Tous les appels authentifiés passent par `sessionCall` / `sessionOnlyCall`
 * pour injecter le token et réagir à `SESSION_EXPIRED` / `SESSION_INVALID`.
 *
 * En cas d'invalidation, le callback n'est déclenché qu'une seule fois : les appels
 * IPC parallèles ne doivent pas multiplier déconnexions ni toasts.
 */

let gtsSessionToken: string | null = null;
let onSessionExpiredCallback: ((message: string) => void) | null = null;
/** Évite N déconnexions / alertes quand plusieurs IPC échouent en parallèle. */
let sessionInvalidationInProgress = false;

/** Met à jour le jeton injecté dans chaque appel authentifié (`SessionProvider`). */
export function setGtsApiSessionToken(token: string | null) {
  gtsSessionToken = token;
  if (token) {
    sessionInvalidationInProgress = false;
  }
}

/** Jeton courant, ou `null` hors session (logout, boot). */
export function getGtsApiSessionToken(): string | null {
  return gtsSessionToken;
}

/**
 * Enregistre un callback appelé une seule fois quand une réponse IPC indique
 * une session expirée ou invalide (message utilisateur déjà normalisé).
 */
export function setOnSessionExpired(cb: ((message: string) => void) | null) {
  onSessionExpiredCallback = cb;
}

/** Indique une erreur IPC de session expirée ou invalide. */
export function isSessionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes("SESSION_EXPIRED:") || msg.includes("SESSION_INVALID:");
}

/**
 * Détecte un message déjà affiché (ou à supprimer) lié à une déconnexion session,
 * y compris les wrappers Electron « Error invoking remote method… ».
 */
export function isSessionUserFacingMessage(message: string): boolean {
  const msg = String(message || "");
  if (!msg.trim()) return false;
  if (/SESSION_(INVALID|EXPIRED)/i.test(msg)) return true;
  if (/session invalide/i.test(msg)) return true;
  if (/session a expiré/i.test(msg)) return true;
  if (/session expirée/i.test(msg)) return true;
  if (/session requise/i.test(msg)) return true;
  return false;
}

function resolveSessionErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (msg.includes("SESSION_EXPIRED:")) {
    return "Votre session a expiré (limite 13h). Reconnectez-vous.";
  }
  return "Session invalide. Reconnectez-vous.";
}

/**
 * Exécute un appel IPC et déclenche la déconnexion si la session est invalide ou expirée.
 *
 * @param fn - Promesse IPC.
 * @returns Résultat de `fn` (l'erreur session est relancée après le callback).
 */
export async function guardSession<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isSessionError(err) && onSessionExpiredCallback && !sessionInvalidationInProgress) {
      sessionInvalidationInProgress = true;
      // Le jeton reste disponible pour `clearSession` / `logout` (révocation côté main).
      // `withSession` refuse les nouveaux appels tant que le flag est actif.
      onSessionExpiredCallback(resolveSessionErrorMessage(err));
    }
    throw err;
  }
}

/**
 * Ajoute `sessionToken` au payload ; lève si hors session.
 *
 * @param payload - Corps métier (sans jeton).
 */
export function withSession<P extends object>(payload: P): P & { sessionToken: string } {
  if (!gtsSessionToken || sessionInvalidationInProgress) {
    throw new Error("Session requise. Connectez-vous.");
  }
  return { ...payload, sessionToken: gtsSessionToken };
}

/** Payload réduit au jeton de session. */
export function withSessionOnly(): { sessionToken: string } {
  return withSession({});
}

/**
 * Appel authentifié avec payload métier : jeton injecté + garde d'expiration.
 *
 * @param method - Canal `window.gtsApi`.
 * @param payload - Arguments sans `sessionToken`.
 */
export function sessionCall<P extends object, R>(
  method: (payload: P & { sessionToken: string }) => Promise<R>,
  payload: P
): Promise<R> {
  return guardSession(() => method(withSession(payload)));
}

/**
 * Appel authentifié sans autre champ que le jeton.
 *
 * @param method - Canal `window.gtsApi` qui n'attend que la session.
 */
export function sessionOnlyCall<R>(method: (payload: { sessionToken: string }) => Promise<R>): Promise<R> {
  return guardSession(() => method(withSessionOnly()));
}
