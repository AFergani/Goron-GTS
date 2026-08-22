/**
 * Jeton de session IPC et garde d'expiration pour `gtsApiClient`.
 *
 * `SessionProvider` enregistre le jeton et le callback de déconnexion.
 * Tous les appels authentifiés passent par `sessionCall` / `sessionOnlyCall`
 * pour injecter le token et réagir à `SESSION_EXPIRED` / `SESSION_INVALID`.
 */

let gtsSessionToken: string | null = null;
let onSessionExpiredCallback: (() => void) | null = null;

/** Met à jour le jeton injecté dans chaque appel authentifié (`SessionProvider`). */
export function setGtsApiSessionToken(token: string | null) {
  gtsSessionToken = token;
}

/** Jeton courant, ou `null` hors session (logout, boot). */
export function getGtsApiSessionToken(): string | null {
  return gtsSessionToken;
}

/** Enregistre un callback appelé automatiquement quand une réponse IPC indique une session expirée. */
export function setOnSessionExpired(cb: () => void) {
  onSessionExpiredCallback = cb;
}

function isSessionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes("SESSION_EXPIRED:") || msg.includes("SESSION_INVALID:");
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
    if (isSessionError(err) && onSessionExpiredCallback) {
      onSessionExpiredCallback();
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
  if (!gtsSessionToken) {
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
