/**
 * Modale bloquante : PostgreSQL injoignable.
 *
 * Affichée tant que le serveur est offline — non fermable (pas de clic overlay,
 * pas de « Fermer »). Seul recours utilisateur : quitter l'application.
 * Disparaît automatiquement quand la sonde PG repasse accessible.
 */

type PgOfflineBlockingModalProps = {
  isOpen: boolean;
  onQuitApp: () => void | Promise<void>;
};

/**
 * Alerte plein écran (alertdialog) pour panne PostgreSQL.
 *
 * @param props.isOpen - Visible tant que PG est injoignable
 * @param props.onQuitApp - Quitte l'application Electron
 */
export function PgOfflineBlockingModal({ isOpen, onQuitApp }: PgOfflineBlockingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay modal-overlay--pg-offline" role="presentation">
      <section
        className="modal confirm-modal pg-offline-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pg-offline-title"
        aria-describedby="pg-offline-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pg-offline-title">Base PostgreSQL inaccessible</h3>
        <p id="pg-offline-desc" className="pg-offline-modal__message">
          Le serveur PostgreSQL n&apos;est pas joignable.
        </p>
        <p className="muted pg-offline-modal__hint">
          Cette fenêtre reste affichée tant que la base n&apos;est pas de nouveau accessible. Vous pouvez
          quitter l&apos;application et la relancer après le redémarrage du serveur.
        </p>
        <div className="row-actions modal-actions pg-offline-modal__actions">
          <button type="button" className="btn-danger" onClick={() => void onQuitApp()}>
            Quitter l&apos;application
          </button>
        </div>
      </section>
    </div>
  );
}
