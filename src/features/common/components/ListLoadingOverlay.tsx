/**
 * Voile de chargement léger sur la zone liste (tableau / journée / pagination).
 *
 * Le bandeau d’actions et les filtres restent stables : plus de clignotement
 * « Chargement… » ↔ résultats. Utilisé par : main courante, interventions, rondes, gardiennage.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ListLoadingOverlayProps = {
  loading: boolean;
  children: ReactNode;
};

export function ListLoadingOverlay({ loading, children }: ListLoadingOverlayProps) {
  return (
    <div className="list-loading-overlay-host" aria-busy={loading || undefined}>
      {children}
      {loading ? (
        <div className="list-loading-overlay" role="status" aria-live="polite">
          <Loader2 size={20} className="login-spinner" aria-hidden />
          <span>Chargement…</span>
        </div>
      ) : null}
    </div>
  );
}
