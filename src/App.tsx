/**
 * Racine React de Goron-GTS (montée depuis `main.tsx`).
 *
 * Enveloppe toute l'application dans `SessionProvider` puis affiche `AppShell`
 * (authentification, navigation et pages métier).
 */

import { AppShell } from "./app/AppShell";
import { SessionProvider } from "./app/session/SessionProvider";

/** Composant racine exporté vers le point d'entrée Vite/Electron. */
export function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}
