import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "../../types";
import { gtsApiClient, setGtsApiSessionToken, setOnSessionExpired } from "../../infrastructure/api/gtsApiClient";

export type Session = { user: User; sessionToken: string } | null;

type SessionContextValue = {
  session: Session;
  setSession: (next: Session) => void;
  clearSession: () => void;
};

const SESSION_STORAGE_KEY = "gts.session";
const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session>(null);
  // En production, isDevMode est false : aucune persistance localStorage.
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
    if (isDevMode === null) return; // Attendre la réponse isDev.
    if (!isDevMode) return;        // Production : reconnexion obligatoire.
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
    return () => { isCancelled = true; };
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

  // Déconnexion automatique sur session expirée détectée côté IPC.
  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;
  useEffect(() => {
    setOnSessionExpired(() => clearSessionRef.current());
  }, []);

  useEffect(() => {
    // Durcissement production : DevTools activables uniquement pour le profil DEV connecté.
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

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession doit être utilisé dans SessionProvider");
  }
  return value;
}
