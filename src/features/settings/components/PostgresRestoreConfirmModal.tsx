/**
 * Double confirmation avant restauration PostgreSQL : mot de passe du compte
 * responsable / directeur (ou code Admin) et saisie du mot RESTAURER.
 *
 * Ouverte depuis la liste des dumps ou depuis la fenêtre de comparaison.
 */

import { useEffect, useState } from "react";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { PasswordInput } from "../../common/components/PasswordInput";
import { isRestoreConfirmPhraseValid, RESTORE_CONFIRM_PHRASE } from "../model/postgresRestoreConfirm";

type PostgresRestoreConfirmModalProps = {
  isOpen: boolean;
  dumpLabel: string;
  busy: boolean;
  askDisplayName?: boolean;
  onCancel: () => void;
  onConfirm: (payload: { accountPassword: string; confirmPhrase: string; managerFullName?: string }) => void | Promise<void>;
};

/**
 * @param props.isOpen - Fenêtre visible
 * @param props.dumpLabel - Nom du fichier dump
 * @param props.busy - Restauration en cours
 * @param props.askDisplayName - Saisie du nom affiché (écran hors session)
 * @param props.onCancel - Fermeture
 * @param props.onConfirm - Envoi mot de passe + mot de confirmation
 */
export function PostgresRestoreConfirmModal({
  isOpen,
  dumpLabel,
  busy,
  askDisplayName = false,
  onCancel,
  onConfirm
}: PostgresRestoreConfirmModalProps) {
  const [accountPassword, setAccountPassword] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [managerFullName, setManagerFullName] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setAccountPassword("");
      setConfirmPhrase("");
      setManagerFullName("");
    }
  }, [isOpen]);

  const phraseOk = isRestoreConfirmPhraseValid(confirmPhrase);
  const displayOk = !askDisplayName || managerFullName.trim().length > 0;
  const canConfirm = Boolean(accountPassword) && phraseOk && displayOk && !busy;

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Restaurer cette sauvegarde ?"
      message={`Toutes les données actuelles seront remplacées par « ${dumpLabel || "cette sauvegarde"} ». L'opération est irréversible. PostgreSQL doit être démarré.`}
      confirmLabel={busy ? "Restauration…" : "Restaurer la base"}
      confirmClassName="btn-danger"
      confirmDisabled={!canConfirm}
      onCancel={() => {
        if (busy) return;
        onCancel();
      }}
      onConfirm={() =>
        onConfirm({
          accountPassword,
          confirmPhrase,
          managerFullName: askDisplayName ? managerFullName.trim() : undefined
        })
      }
    >
      <div className="postgres-restore-confirm">
        {askDisplayName ? (
          <label className="mc-field">
            <span>Nom affiché du responsable ou du directeur</span>
            <input
              value={managerFullName}
              onChange={(e) => setManagerFullName(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </label>
        ) : null}
        <label className="mc-field">
          <span>Mot de passe de votre compte</span>
          <PasswordInput
            value={accountPassword}
            onChange={setAccountPassword}
            disabled={busy}
            required
            autoComplete="off"
            aria-label="Mot de passe du compte responsable ou directeur"
          />
        </label>
        <label className="mc-field">
          <span>
            Pour confirmer, saisissez le mot <strong>{RESTORE_CONFIRM_PHRASE}</strong>
          </span>
          <input
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            placeholder={RESTORE_CONFIRM_PHRASE}
            aria-label={`Saisir le mot ${RESTORE_CONFIRM_PHRASE}`}
          />
        </label>
      </div>
    </ConfirmModal>
  );
}
