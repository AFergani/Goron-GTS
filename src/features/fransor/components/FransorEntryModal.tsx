/**
 * Modale de saisie quotidienne Fransor (ouverture / fermeture + responsable).
 *
 * La garde Échap / abandon (`useCreateModalCloseGuard`) reste dans `FransorPage`.
 */

import type { Dispatch, SetStateAction } from "react";
import type { FransorResponsableRef } from "../../../types";

type FransorEntryModalProps = {
  isOpen: boolean;
  entryDate: string;
  entryOuvertureDone: boolean;
  entryFermetureDone: boolean;
  entryOuvertureResponsableId: string;
  entryFermetureResponsableId: string;
  responsables: FransorResponsableRef[];
  onRequestClose: () => void;
  onSubmit: () => void;
  setEntryDate: Dispatch<SetStateAction<string>>;
  setEntryOuvertureDone: Dispatch<SetStateAction<boolean>>;
  setEntryFermetureDone: Dispatch<SetStateAction<boolean>>;
  setEntryOuvertureResponsableId: Dispatch<SetStateAction<string>>;
  setEntryFermetureResponsableId: Dispatch<SetStateAction<string>>;
};

/**
 * @param props.isOpen - Affichage de la modale
 * @param props.onRequestClose - Fermeture demandée (overlay, Fermer, Échap)
 * @param props.onSubmit - Enregistrement de la saisie
 */
export function FransorEntryModal({
  isOpen,
  entryDate,
  entryOuvertureDone,
  entryFermetureDone,
  entryOuvertureResponsableId,
  entryFermetureResponsableId,
  responsables,
  onRequestClose,
  onSubmit,
  setEntryDate,
  setEntryOuvertureDone,
  setEntryFermetureDone,
  setEntryOuvertureResponsableId,
  setEntryFermetureResponsableId
}: FransorEntryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onRequestClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Ajouter une saisie Fransor</h3>
        <div className="form">
          <label>
            Date
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </label>
          <label>
            Action : Ouverture
            <div className="fransor-entry-row">
              <button
                type="button"
                className={
                  entryOuvertureDone
                    ? "mc-btn-primary fransor-entry-action-btn"
                    : "btn-light fransor-entry-action-btn"
                }
                onClick={() => setEntryOuvertureDone((prev) => !prev)}
                title="Activer ou désactiver la saisie d’ouverture"
                aria-pressed={entryOuvertureDone}
              >
                Ouverture
              </button>
              <select
                value={entryOuvertureResponsableId}
                onChange={(e) => setEntryOuvertureResponsableId(e.target.value)}
                disabled={!entryOuvertureDone}
              >
                <option value="">Responsable ouverture</option>
                {responsables.map((resp) => (
                  <option key={resp.id} value={resp.id}>
                    {resp.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            Action : Fermeture
            <div className="fransor-entry-row">
              <button
                type="button"
                className={
                  entryFermetureDone
                    ? "mc-btn-primary fransor-entry-action-btn"
                    : "btn-light fransor-entry-action-btn"
                }
                onClick={() => setEntryFermetureDone((prev) => !prev)}
                title="Activer ou désactiver la saisie de fermeture"
                aria-pressed={entryFermetureDone}
              >
                Fermeture
              </button>
              <select
                value={entryFermetureResponsableId}
                onChange={(e) => setEntryFermetureResponsableId(e.target.value)}
                disabled={!entryFermetureDone}
              >
                <option value="">Responsable fermeture</option>
                {responsables.map((resp) => (
                  <option key={resp.id} value={resp.id}>
                    {resp.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={onRequestClose}>
            Fermer
          </button>
          <button type="button" onClick={onSubmit}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
