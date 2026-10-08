/**
 * Cellule photo : collage d'une capture ou choix d'un fichier PNG / JPEG.
 * L'image est réduite en JPEG pour rester transportable vers la base.
 */

import { useRef } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import type { PvVideoImage } from "../model/pvVideoForm";
import { GLOBAL_IMAGE_LIMITS, preparePvImageFile } from "../model/preparePvImage";
import { ToolbarTextButton } from "../../common/components/SitePageToolbar";

type PvVideoImageCellProps = {
  image: PvVideoImage | null;
  disabled?: boolean;
  onImage: (image: PvVideoImage) => void;
  onClear: () => void;
  onReject: (message: string) => void;
};

/**
 * Aperçu, collage et parcours de la capture globale du site.
 */
export function PvVideoImageCell({ image, disabled, onImage, onClear, onReject }: PvVideoImageCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = image ? `data:${image.mime};base64,${image.base64}` : "";

  const acceptFile = (file: File) => {
    void preparePvImageFile(file, GLOBAL_IMAGE_LIMITS).then(onImage, (error: unknown) => {
      onReject(error instanceof Error ? error.message : "Impossible de lire cette image.");
    });
  };

  return (
    <div className="pv-image-block">
      <div className="pv-image-head">
        <span className="pv-image-label">Capture globale</span>
        <div className="pv-image-actions">
          <ToolbarTextButton
            icon={<FolderOpen size={16} />}
            label="Parcourir"
            title="Choisir une image"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          />
          {image ? (
            <button
              type="button"
              className="icon-btn"
              title="Retirer la photo"
              aria-label="Retirer la photo"
              disabled={disabled}
              onClick={onClear}
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
      <div
        className="pv-image-cell"
        tabIndex={disabled ? -1 : 0}
        onPaste={(event) => {
          if (disabled) return;
          const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
          if (!file) return;
          event.preventDefault();
          acceptFile(file);
        }}
        aria-label="Zone de capture globale : coller une image ou parcourir un fichier"
      >
        {preview ? (
          <img src={preview} alt="Photo du raccordement" />
        ) : (
          <p>Collez la capture globale du site (Windows+Maj+S) ou choisissez un fichier.</p>
        )}
      </div>
    </div>
  );
}
