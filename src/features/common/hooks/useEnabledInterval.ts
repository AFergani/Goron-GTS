/**
 * Timer conditionnel : exécute une charge tout de suite, puis à intervalle régulier.
 *
 * Sert les badges de navigation (`AppShell`) et peut être réutilisé par les presenters
 * qui pollent tant qu'une session / permission est active.
 *
 * `extraDeps` relance le cycle (ex. changement de session ou de rôle). `load` et
 * `onDisabled` sont lus via refs pour éviter de recréer le timer à chaque rendu.
 */

import { useEffect, useRef } from "react";

/**
 * Lance `load` immédiatement puis toutes les `intervalMs` ms tant que `enabled` est vrai.
 * Si `enabled` devient faux, appelle `onDisabled` (remettre un compteur à 0, etc.).
 *
 * @param enabled - Active le polling ; faux = arrêt + `onDisabled`.
 * @param intervalMs - Délai entre deux appels après le premier.
 * @param load - Lecture à exécuter (peut être async).
 * @param extraDeps - Dépendances qui relancent le timer (session, droit page…).
 * @param onDisabled - Nettoyage quand le polling s'arrête.
 */
export function useEnabledInterval(
  enabled: boolean,
  intervalMs: number,
  load: () => void | Promise<void>,
  extraDeps: readonly unknown[] = [],
  onDisabled?: () => void
): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  const onDisabledRef = useRef(onDisabled);
  onDisabledRef.current = onDisabled;

  useEffect(() => {
    if (!enabled) {
      onDisabledRef.current?.();
      return;
    }
    const run = () => {
      void loadRef.current();
    };
    run();
    const timer = setInterval(run, intervalMs);
    return () => clearInterval(timer);
    // extraDeps : relance volontaire (session, rôle, permission)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps fournies par l'appelant
  }, [enabled, intervalMs, ...extraDeps]);
}
