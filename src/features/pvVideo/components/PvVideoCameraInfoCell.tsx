/**
 * Case Information d'une caméra : texte, collage ou fichier.
 * La capture globale du site reste le cadre en bas de fiche.
 */

import { useRef } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import type { PvVideoImage } from "../model/pvVideoForm";
import { CAMERA_IMAGE_LIMITS, preparePvImageFile } from "../model/preparePvImage";
import { ToolbarTextButton } from "../../common/components/SitePageToolbar";

type PvVideoCameraInfoCellProps = {
  index: number;
  text: string;
  image: PvVideoImage | null;
  disabled?: boolean;
  onText: (value: string) => void;
  onImage: (image: PvVideoImage) => void;
  onClearImage: () => void;
  onReject: (message: string) => void;
};

/**
 * Saisie mixte d'une information de caméra.
 */
export function PvVideoCameraInfoCell({
  index,
  text,
  image,
  disabled,
  onText,
  onImage,
  onClearImage,
  onReject
}: PvVideoCameraInfoCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = image ? `data:${image.mime};base64,${image.base64}` : "";

  const acceptFile = (file: File) => {
    void preparePvImageFile(file, CAMERA_IMAGE_LIMITS).then(
      (next) => onImage(next),
      (error: unknown) => onReject(error instanceof Error ? error.message : "Impossible de lire cette image.")
    );
  };

  return (
    <div
      className="pv-camera-info"
      onPasteCapture={(event) => {
        if (disabled) return;
        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
        if (!file) return;
        event.preventDefault();
        acceptFile(file);
      }}
    >
      <div className="pv-camera-info-line">
        <textarea
          value={text}
          disabled={disabled}
          rows={2}
          aria-label={`Information caméra ${index + 1}`}
          placeholder="Texte libre"
          title="Vous pouvez aussi coller une capture dans cette case."
          onChange={(event) => onText(event.target.value)}
        />
        {preview ? <img src={preview} alt={`Photo caméra ${index + 1}`} /> : null}
        <ToolbarTextButton
          icon={<FolderOpen size={16} />}
          label="Parcourir"
          title="Choisir une image pour cette caméra"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        />
        {image ? (
          <button
            type="button"
            className="icon-btn"
            title="Retirer la photo de cette caméra"
            aria-label={`Retirer la photo de la caméra ${index + 1}`}
            disabled={disabled}
            onClick={onClearImage}
          >
            <Trash2 size={16} />
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) acceptFile(file);
          }}
        />
      </div>
    </div>
  );
}
