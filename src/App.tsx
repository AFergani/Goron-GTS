import { AppShell } from "./app/AppShell";
import { SessionProvider } from "./app/session/SessionProvider";

export function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}
