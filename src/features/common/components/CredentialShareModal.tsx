/**
 * Modale post-création ou réinitialisation utilisateur : transmission des identifiants temporaires.
 *
 * Enveloppe `CredentialShareCard` (copie presse-papiers). Ouverte depuis `AppShell` lorsque
 * le presenter Paramètres fournit `credentialsToShare` après création de compte ou reset MDP.
 */

import { CredentialShareCard } from "./CredentialShareCard";

type CredentialShareModalProps = {
  isOpen: boolean;
  /** Nom affiché de connexion transmis à l’opérateur. */
  username: string;
  temporaryPassword: string;
  onClose: () => void;
};

export function CredentialShareModal({ isOpen, username, temporaryPassword, onClose }: CredentialShareModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Utilisateur créé</h3>
        <p className="muted">Transmettez ces identifiants de façon sécurisée.</p>
        <CredentialShareCard username={username} temporaryPassword={temporaryPassword} />
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={onClose}>
            Fermer
          </button>
        </div>
      </section>
    </div>
  );
}
