/**
 * Formulaire de la fiche PV : champs, caméras et photo.
 * Le nom et l'adresse du site viennent du référentiel, en lecture seule.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cameraLabelUpper, type PvVideoCamera, type PvVideoForm, type PvVideoImage } from "../model/pvVideoForm";
import { ToolbarTextButton } from "../../common/components/SitePageToolbar";
import { PvVideoCameraInfoCell } from "./PvVideoCameraInfoCell";
import { PvVideoImageCell } from "./PvVideoImageCell";

type PvVideoFormFieldsProps = {
  form: PvVideoForm;
  siteId: string;
  siteName: string;
  siteAddress: string;
  image: PvVideoImage | null;
  disabled: boolean;
  onChange: (patch: Partial<PvVideoForm>) => void;
  onCameras: (cameras: PvVideoCamera[]) => void;
  onImage: (image: PvVideoImage) => void;
  onClearImage: () => void;
  onReject: (message: string) => void;
};

/**
 * @param cameras - Liste courante.
 * @param index - Ligne à modifier.
 * @param patch - Champs de la ligne.
 */
function patchCamera(cameras: PvVideoCamera[], index: number, patch: Partial<PvVideoCamera>): PvVideoCamera[] {
  return cameras.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
}

/**
 * Saisie de la fiche, hors barre de site.
 */
export function PvVideoFormFields({
  form,
  siteId,
  siteName,
  siteAddress,
  image,
  disabled,
  onChange,
  onCameras,
  onImage,
  onClearImage,
  onReject
}: PvVideoFormFieldsProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const allRef = useRef<HTMLInputElement>(null);
  const allChecked = form.cameras.length > 0 && selected.size === form.cameras.length;

  useEffect(() => {
    setSelected(new Set());
  }, [siteId]);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selected.size > 0 && !allChecked;
  }, [allChecked, selected.size]);

  /**
   * Coche ou décoche une ligne du listing.
   *
   * @param index - Position de la caméra.
   */
  const toggleRow = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  /**
   * Retire les caméras cochées et vide la sélection.
   */
  const deleteMarked = () => {
    if (!selected.size) return;
    onCameras(form.cameras.filter((_, index) => !selected.has(index)));
    setSelected(new Set());
  };

  return (
    <div className="pv-form">
      <div className="mc-form-grid">
        <label className="mc-field">
          <span>Date de raccordement</span>
          <input
            type="date"
            value={form.connectionDate}
            disabled={disabled}
            onChange={(event) => onChange({ connectionDate: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Nom responsable TLS</span>
          <input
            type="text"
            value={form.tlsResponsibleName}
            disabled={disabled}
            onChange={(event) => onChange({ tlsResponsibleName: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Nom et téléphone technicien</span>
          <input
            type="text"
            value={form.technicianContact}
            disabled={disabled}
            onChange={(event) => onChange({ technicianContact: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Code transmetteur</span>
          <input
            type="text"
            value={form.transmitterCode}
            disabled={disabled}
            onChange={(event) => onChange({ transmitterCode: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Nom du site</span>
          <input type="text" className="mc-input-readonly" value={siteName} readOnly />
        </label>
        <label className="mc-field">
          <span>Adresse du site</span>
          <input type="text" className="mc-input-readonly" value={siteAddress} readOnly />
        </label>
        <label className="mc-field">
          <span>Méthode de connexion aux vidéos</span>
          <input
            type="text"
            value={form.connectionMethod}
            disabled={disabled}
            onChange={(event) => onChange({ connectionMethod: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Marque et modèle de l'enregistreur</span>
          <input
            type="text"
            value={form.recorderModel}
            disabled={disabled}
            onChange={(event) => onChange({ recorderModel: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Adresse IP</span>
          <input
            type="text"
            value={form.recorderIp}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => onChange({ recorderIp: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Port de l'enregistreur</span>
          <input
            type="text"
            value={form.recorderPort}
            disabled={disabled}
            onChange={(event) => onChange({ recorderPort: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Login</span>
          <input
            type="text"
            value={form.login}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ login: event.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>Mot de passe</span>
          <input
            type="text"
            value={form.password}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ password: event.target.value })}
          />
        </label>
      </div>
      <p className="pv-hint">Le login et le mot de passe sont chiffrés en base. Ils restent lisibles ici et dans l&apos;export.</p>

      <div className="pv-cameras">
        <div className="pv-cameras-head">
          <h2>Listing caméras</h2>
          <div className="pv-cameras-head-actions">
            <ToolbarTextButton
              icon={<Plus size={16} />}
              label="Ajouter"
              title="Ajouter une caméra"
              disabled={disabled}
              onClick={() => onCameras([...form.cameras, { number: "", title: "", information: "", image: null }])}
            />
            <button
              type="button"
              className="icon-btn"
              title="Supprimer les caméras cochées"
              aria-label="Supprimer les caméras cochées"
              disabled={disabled || selected.size === 0}
              onClick={deleteMarked}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {form.cameras.length ? (
          <table className="pv-camera-table">
            <thead>
              <tr>
                <th className="pv-camera-check">
                  <input
                    ref={allRef}
                    type="checkbox"
                    checked={allChecked}
                    disabled={disabled}
                    aria-label="Cocher toutes les caméras"
                    onChange={(event) => {
                      setSelected(event.target.checked ? new Set(form.cameras.map((_, index) => index)) : new Set());
                    }}
                  />
                </th>
                <th>Numéro</th>
                <th>Intitulé</th>
                <th>Information</th>
              </tr>
            </thead>
            <tbody>
              {form.cameras.map((camera, index) => (
                <tr key={`camera-${index}`}>
                  <td className="pv-camera-check">
                    <input
                      type="checkbox"
                      checked={selected.has(index)}
                      disabled={disabled}
                      aria-label={`Cocher la caméra ${index + 1}`}
                      onChange={() => toggleRow(index)}
                    />
                  </td>
                  <td className="pv-camera-number">{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={camera.title}
                      disabled={disabled}
                      aria-label={`Intitulé caméra ${index + 1}`}
                      onChange={(event) =>
                        onCameras(patchCamera(form.cameras, index, { title: cameraLabelUpper(event.target.value) }))
                      }
                    />
                  </td>
                  <td className="pv-camera-info-cell">
                    <PvVideoCameraInfoCell
                      index={index}
                      text={camera.information}
                      image={camera.image}
                      disabled={disabled}
                      onText={(information) =>
                        onCameras(patchCamera(form.cameras, index, { information: cameraLabelUpper(information) }))
                      }
                      onImage={(image) => onCameras(patchCamera(form.cameras, index, { image }))}
                      onClearImage={() => onCameras(patchCamera(form.cameras, index, { image: null }))}
                      onReject={onReject}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pv-hint">Aucune caméra pour l&apos;instant.</p>
        )}
      </div>

      <PvVideoImageCell
        image={image}
        disabled={disabled}
        onImage={onImage}
        onClear={onClearImage}
        onReject={onReject}
      />
    </div>
  );
}
