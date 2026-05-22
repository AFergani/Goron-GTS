/**
 * Contexte React de session utilisateur (connexion, jeton IPC, persistance dev).
 *
 * Enveloppe l'application dans `App.tsx`. Synchronise `gtsApiClient` avec le jeton
 * serveur, restaure la session depuis `localStorage` uniquement en mode développement,
 * et déclenche la déconnexion si le backend signale une session expirée ou invalide.
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "../../types";
import { gtsApiClient, setGtsApiSessionToken, setOnSessionExpired } from "../../infrastructure/api/gtsApiClient";

/** Utilisateur connecté + jeton de session Electron, ou absence de session. */
export type Session = { user: User; sessionToken: string } | null;

type SessionContextValue = {
  session: Session;
  setSession: (next: Session) => void;
  clearSession: () => void;
};

const SESSION_STORAGE_KEY = "gts.session";
const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/**
 * Fournit la session à toute l'arborescence React et pilote le jeton IPC / DevTools DEV.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session>(null);
  /** `null` tant que `getDbConfig` n'a pas répondu ; évite une restauration localStorage avant le mode connu. */
  const [isDevMode, setIsDevMode] = useState<boolean | null>(null);

  useEffect(() => {
    gtsApiClient.getDbConfig()
      .then((cfg) => setIsDevMode(Boolean(cfg?.isDev)))
      .catch(() => setIsDevMode(false));
  }, []);

  /** Met à jour le jeton IPC avant le prochain rendu : évite les appels gtsApi sans session juste après connexion. */
  const setSession = useCallback((next: Session) => {
    setGtsApiSessionToken(next?.sessionToken ?? null);
    setSessionState(next);
  }, []);

  // Restauration de la session persistée (dev uniquement).
  useEffect(() => {
    if (isDevMode === null) return;
    if (!isDevMode) return;
    let isCancelled = false;
    void (async () => {
      try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Session;
        if (!parsed?.user || !parsed?.sessionToken) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }
        if (isCancelled) return;
        setGtsApiSessionToken(parsed.sessionToken);
        setSessionState(parsed);
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [isDevMode]);

  // Persistance de la session (dev uniquement).
  useEffect(() => {
    if (!isDevMode) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [session, isDevMode]);

  /** Déconnexion IPC, purge du jeton et du stockage local, puis état React à null. */
  const clearSession = useCallback(() => {
    void (async () => {
      try {
        await gtsApiClient.logout();
      } catch {
        /* ignorer */
      }
      setGtsApiSessionToken(null);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      setSessionState(null);
    })();
  }, []);

  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;
  useEffect(() => {
    setOnSessionExpired(() => clearSessionRef.current());
  }, []);

  useEffect(() => {
    const enabled = Boolean(session && session.user.role === "DEV");
    void gtsApiClient.setDevToolsEnabled(enabled).catch(() => {
      // On conserve le comportement applicatif si l'appel système échoue ponctuellement.
    });
  }, [session?.sessionToken, session?.user.role]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, setSession, clearSession }),
    [session, setSession, clearSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Accès à la session courante ; lève une erreur si le composant n'est pas sous `SessionProvider`.
 */
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession doit être utilisé dans SessionProvider");
  }
  return value;
}
