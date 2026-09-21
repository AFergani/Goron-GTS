/**
 * Choix à la fermeture : Fermer, déconnexion (si session), minimiser ou quitter.
 *
 * Affichée depuis `AppShell` (bouton Power sidebar ou croix de fenêtre via preload).
 */

import { useModalEscape } from "../features/common/hooks/useModalEscape";

type AppExitChoiceModalProps = {
  isOpen: boolean;
  hasSession: boolean;
  onCancel: () => void;
  onDisconnect: () => void;
  onMinimize: () => void;
  onQuit: () => void;
};

/**
 * Modale non métier (quatre actions) — distincte de `ConfirmModal` (oui/non).
 */
export function AppExitChoiceModal({
  isOpen,
  hasSession,
  onCancel,
  onDisconnect,
  onMinimize,
  onQuit
}: AppExitChoiceModalProps) {
  useModalEscape(isOpen, onCancel);
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <section className="modal confirm-modal app-exit-choice-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Fermeture de l&apos;application</h3>
        <p className="muted">Déconnexion, réduction en zone de notification ou arrêt complet.</p>
        <div className="row-actions app-exit-choice-modal__actions">
          <button type="button" className="btn-light" onClick={onCancel}>
            Fermer
          </button>
          {hasSession ? (
            <button type="button" className="btn-light" onClick={onDisconnect}>
              Déconnexion
            </button>
          ) : null}
          <button type="button" onClick={onMinimize}>
            Minimiser
          </button>
          <button type="button" className="btn-danger" onClick={onQuit}>
            Quitter
          </button>
        </div>
      </section>
    </div>
  );
}
