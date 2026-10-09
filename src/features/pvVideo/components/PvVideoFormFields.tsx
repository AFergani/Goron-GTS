/**
 * Formulaire de la fiche PV : champs, caméras et photo.
 * Le nom et l'adresse du site viennent du référentiel, en lecture seule.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Images, Trash2 } from "lucide-react";
import { cameraLabelUpper, MAX_PV_CAMERAS, type PvVideoCamera, type PvVideoForm, type PvVideoImage } from "../model/pvVideoForm";
import { describePvPhotoImport, planPvPhotoImport } from "../model/importPvPhotos";
import { CAMERA_IMAGE_LIMITS, GLOBAL_IMAGE_LIMITS, preparePvImageFile } from "../model/preparePvImage";
import { ToolbarTextButton } from "../../common/components/SitePageToolbar";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { ToastVariant } from "../../common/model/toast.types";
import { PvVideoCameraInfoCell } from "./PvVideoCameraInfoCell";
import { PvVideoImageCell } from "./PvVideoImageCell";

/**
 * Ligne de caméra vide.
 */
function blankCamera(): PvVideoCamera {
  return { number: "", title: "", information: "", image: null };
}

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
  onNotice: (message: string, variant?: ToastVariant) => void;
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
 * Insère un trou dans les photos à partir d'une ligne. Les intitulés ne bougent pas.
 * La dernière photo passe sur une ligne ajoutée si besoin.
 *
 * @param cameras - Lignes dans l'ordre affiché.
 * @param fromIndex - Première photo à décaler vers le bas.
 * @returns La liste décalée, ou `null` si le plafond de caméras est atteint.
 */
function shiftPhotosDown(cameras: PvVideoCamera[], fromIndex: number): PvVideoCamera[] | null {
  const images = cameras.map((row) => row.image);
  const moved = [...images.slice(0, fromIndex), null, ...images.slice(fromIndex)];
  while (moved.length > cameras.length && moved[moved.length - 1] == null) moved.pop();
  const needsRow = moved.length > cameras.length;
  if (needsRow && cameras.length >= MAX_PV_CAMERAS) return null;
  const next = cameras.map((row) => ({ ...row }));
  if (needsRow) next.push(blankCamera());
  return next.map((row, index) => ({ ...row, image: moved[index] ?? null }));
}

/**
 * Remonte les photos d'un cran à partir d'une ligne vide. Les intitulés ne bougent pas.
 *
 * @param cameras - Lignes dans l'ordre affiché.
 * @param fromIndex - Trou à refermer.
 */
function shiftPhotosUp(cameras: PvVideoCamera[], fromIndex: number): PvVideoCamera[] {
  const images = cameras.map((row) => row.image);
  const moved = [...images.slice(0, fromIndex), ...images.slice(fromIndex + 1)];
  while (moved.length < cameras.length) moved.push(null);
  return cameras.map((row, index) => ({ ...row, image: moved[index] ?? null }));
}

/**
 * Échange uniquement les photos de deux lignes.
 *
 * @param cameras - Lignes dans l'ordre affiché.
 * @param fromIndex - Ligne d'origine de la photo.
 * @param toIndex - Ligne de destination.
 */
function swapPhotos(cameras: PvVideoCamera[], fromIndex: number, toIndex: number): PvVideoCamera[] {
  if (fromIndex === toIndex || !cameras[fromIndex] || !cameras[toIndex]) return cameras;
  return cameras.map((row, index) => {
    if (index === fromIndex) return { ...row, image: cameras[toIndex].image };
    if (index === toIndex) return { ...row, image: cameras[fromIndex].image };
    return row;
  });
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
  onReject,
  onNotice
}: PvVideoFormFieldsProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [lineCountText, setLineCountText] = useState("1");
  const [importing, setImporting] = useState(false);
  const allRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const siteRef = useRef(siteId);
  const camerasRef = useRef(form.cameras);
  siteRef.current = siteId;
  camerasRef.current = form.cameras;
  const allChecked = form.cameras.length > 0 && selected.size === form.cameras.length;
  const remaining = MAX_PV_CAMERAS - form.cameras.length;
  const parsedCount = Number.parseInt(lineCountText, 10);
  const countToAdd =
    remaining < 1 ? 0 : Math.min(Math.max(1, Number.isFinite(parsedCount) ? parsedCount : 1), remaining);

  useEffect(() => {
    setSelected(new Set());
  }, [siteId, form.cameras.length === 0]);

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
   * Ajoute autant de lignes vides que le nombre saisi, dans la limite du plafond.
   */
  const addLines = () => {
    if (countToAdd < 1) return;
    onCameras([...form.cameras, ...Array.from({ length: countToAdd }, () => blankCamera())]);
    setLineCountText(String(countToAdd));
  };

  /**
   * Décale les photos vers le bas à partir d'une ligne, sans toucher aux noms.
   *
   * @param index - Ligne où la capture manque.
   */
  const shiftDown = (index: number) => {
    const next = shiftPhotosDown(form.cameras, index);
    if (!next) {
      onReject(`${MAX_PV_CAMERAS} caméras au maximum. La dernière photo ne peut pas descendre.`);
      return;
    }
    onCameras(next);
  };

  /**
   * Referme un trou de photo en remontant les suivantes. Les noms restent en place.
   *
   * @param index - Ligne vide dont les photos suivantes doivent remonter.
   */
  const shiftUp = (index: number) => {
    if (form.cameras[index]?.image) return;
    onCameras(shiftPhotosUp(form.cameras, index));
  };

  /**
   * Range un lot de photos : 01 sur la ligne 1, global sur la capture globale.
   * Les lignes manquantes sont créées. Les intitulés déjà saisis restent.
   *
   * @param files - Fichiers choisis ensemble.
   */
  const importPhotos = (files: File[]) => {
    const startedSite = siteId;
    const plan = planPvPhotoImport(files);
    if (!plan.cameras.length && !plan.globalFile) {
      onNotice(describePvPhotoImport(0, false, plan.skipped, []).message, "warning");
      return;
    }
    setImporting(true);
    void (async () => {
      const placed: Array<{ number: number; image: PvVideoImage }> = [];
      const skipped = plan.skipped;
      const unreadable: string[] = [];
      await Promise.all(
        plan.cameras.map(async (item) => {
          try {
            const image = await preparePvImageFile(item.file, CAMERA_IMAGE_LIMITS);
            placed.push({ number: item.number, image });
          } catch {
            unreadable.push(item.file.name);
          }
        })
      );
      let globalImage: PvVideoImage | null = null;
      if (plan.globalFile) {
        try {
          globalImage = await preparePvImageFile(plan.globalFile, GLOBAL_IMAGE_LIMITS);
        } catch {
          unreadable.push(plan.globalFile.name);
        }
      }
      if (siteRef.current !== startedSite) return;
      if (placed.length) {
        const highest = Math.max(...placed.map((item) => item.number));
        const next = camerasRef.current.map((row) => ({ ...row }));
        while (next.length < highest) next.push(blankCamera());
        for (const item of placed) {
          next[item.number - 1] = { ...next[item.number - 1], image: item.image };
        }
        onCameras(next);
      }
      if (globalImage) onImage(globalImage);
      const summary = describePvPhotoImport(placed.length, globalImage != null, skipped, unreadable);
      onNotice(summary.message, summary.variant);
    })().finally(() => {
      setImporting(false);
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
        <div className="pv-connection-row">
          <div className="pv-connection-method-head">
            <span>Méthode de connexion aux vidéos</span>
            <ToggleSwitch
              checked={form.vpnEnabled}
              disabled={disabled}
              label="VPN"
              ariaLabel="Activer la connexion VPN"
              onChange={(vpnEnabled) => onChange({ vpnEnabled })}
            />
          </div>
          <div className={form.vpnEnabled ? "pv-connection-fields pv-connection-fields--vpn" : "pv-connection-fields"}>
            <label className="mc-field">
              <span>Logiciel</span>
              <input
                type="text"
                value={form.connectionMethod}
                disabled={disabled}
                onChange={(event) => onChange({ connectionMethod: event.target.value })}
              />
            </label>
            {form.vpnEnabled ? (
              <label className="mc-field">
                <span>VPN</span>
                <input
                  type="text"
                  value={form.vpnName}
                  disabled={disabled}
                  onChange={(event) => onChange({ vpnName: event.target.value })}
                />
              </label>
            ) : null}
          </div>
          <label className="mc-field pv-recorder-field">
            <span>Marque et modèle de l'enregistreur</span>
            <input
              type="text"
              value={form.recorderModel}
              disabled={disabled}
              onChange={(event) => onChange({ recorderModel: event.target.value })}
            />
          </label>
        </div>
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
            <input
              type="number"
              className="pv-camera-add-count"
              min={1}
              max={Math.max(1, remaining)}
              value={lineCountText}
              disabled={disabled || remaining < 1}
              aria-label="Nombre de lignes à ajouter"
              title="Nombre de caméras à créer en une fois"
              onChange={(event) => setLineCountText(event.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={() => setLineCountText(String(Math.max(1, countToAdd)))}
            />
            <ToolbarTextButton
              icon={<Plus size={16} />}
              label={`Ajouter ${Math.max(1, countToAdd)} ligne${countToAdd > 1 ? "s" : ""}`}
              title={
                remaining < 1
                  ? `${MAX_PV_CAMERAS} caméras au maximum`
                  : countToAdd > 1
                    ? `Ajouter ${countToAdd} caméras`
                    : "Ajouter 1 caméra"
              }
              disabled={disabled || countToAdd < 1}
              onClick={addLines}
            />
            <ToolbarTextButton
              icon={<Images size={16} />}
              label="Importer les photos"
              title="Choisir les photos nommées 01, 02… et global. Chaque numéro remplit sa ligne, global remplit la capture globale."
              disabled={disabled || importing}
              onClick={() => importInputRef.current?.click()}
            />
            <input
              ref={importInputRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length) importPhotos(files);
              }}
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
                  <td className="pv-camera-number">
                    <div className="pv-camera-number-cell">
                      <span>{index + 1}</span>
                      <button
                        type="button"
                        className="pv-photo-shift"
                        title="Décaler les photos vers le bas à partir d'ici. Les noms restent en place."
                        aria-label={`Décaler les photos vers le bas à partir de la caméra ${index + 1}`}
                        disabled={disabled}
                        onClick={() => shiftDown(index)}
                      >
                        <ArrowDown size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="pv-photo-shift"
                        title="Remonter les photos suivantes dans ce trou. Les noms restent en place."
                        aria-label={`Remonter les photos à partir de la caméra ${index + 1}`}
                        disabled={disabled || camera.image != null}
                        onClick={() => shiftUp(index)}
                      >
                        <ArrowUp size={14} aria-hidden />
                      </button>
                    </div>
                  </td>
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
                      onDropPhoto={(fromIndex) => onCameras(swapPhotos(form.cameras, fromIndex, index))}
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
