/**
 * Mise en forme du HTML généré (couleurs, taille, graisse), dans une modale
 * au gabarit des profils de programmation.
 */

import { useCallback, useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { useModalEscape } from "../../common/hooks/useModalEscape";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { TextStyle, VideoRemarkDocument, VideoSection } from "../model/videoRemarkTypes";

type StyleTarget = {
  id: string;
  label: string;
  style: TextStyle;
};

type VideoRemarkStylesPanelProps = {
  doc: VideoRemarkDocument;
  onChangeStyle: (targetId: string, next: TextStyle) => void;
  onReset: () => void;
};

/**
 * Cibles de style : titre de chaque section, puis styles globaux du lien et des champs.
 *
 * @param doc - Document courant.
 */
function styleTargets(doc: VideoRemarkDocument): StyleTarget[] {
  const sectionTargets = doc.video.sections.map((section: VideoSection) => ({
    id: `section:${section.id}`,
    label: `Titre « ${section.title || "Section"} »`,
    style: section.titleStyle
  }));
  return [
    ...sectionTargets,
    { id: "link", label: "Lien vidéo", style: doc.video.styles.link },
    { id: "labels", label: "Libellés des champs", style: doc.video.styles.labels },
    { id: "notice", label: "Consignes importantes", style: doc.video.styles.notice },
    { id: "summary", label: "Lien d'ouverture", style: doc.video.styles.summary },
    { id: "bottomText", label: "Texte d'aide du bas", style: doc.video.styles.bottomText }
  ];
}

/**
 * Un bloc de mise en forme : chaque réglage est dans son propre conteneur.
 */
function StyleRow({
  target,
  onChange
}: {
  target: StyleTarget;
  onChange: (next: TextStyle) => void;
}) {
  const style = target.style;
  return (
    <section className="vr-style-card" aria-label={target.label}>
      <h4 className="vr-style-card__title">{target.label}</h4>
      <div className="vr-style-card__grid">
        <div className="vr-style-control">
          <ToggleSwitch
            label="Texte"
            ariaLabel={`Couleur du texte de ${target.label}`}
            checked={style.colorOn}
            onChange={(colorOn) => onChange({ ...style, colorOn })}
          />
          <input
            type="color"
            aria-label={`Couleur de ${target.label}`}
            value={style.colorValue}
            disabled={!style.colorOn}
            onChange={(event) => onChange({ ...style, colorValue: event.target.value })}
          />
        </div>
        <div className="vr-style-control">
          <ToggleSwitch
            label="Fond"
            ariaLabel={`Couleur de fond de ${target.label}`}
            checked={style.bgOn}
            onChange={(bgOn) => onChange({ ...style, bgOn })}
          />
          <input
            type="color"
            aria-label={`Fond de ${target.label}`}
            value={style.bgValue}
            disabled={!style.bgOn}
            onChange={(event) => onChange({ ...style, bgValue: event.target.value })}
          />
        </div>
        <label className="vr-style-control">
          <span>Taille</span>
          <span className="vr-size">
            <input
              type="number"
              aria-label={`Taille de ${target.label} en pixels`}
              min={8}
              max={72}
              step={1}
              value={style.size}
              onChange={(event) => onChange({ ...style, size: Number(event.target.value) || 16 })}
            />
            px
          </span>
        </label>
        <div className="vr-style-control">
          <ToggleSwitch label="Gras" checked={style.bold} onChange={(bold) => onChange({ ...style, bold })} />
        </div>
        <div className="vr-style-control">
          <ToggleSwitch label="Italique" checked={style.italic} onChange={(italic) => onChange({ ...style, italic })} />
        </div>
        <div className="vr-style-control">
          <ToggleSwitch
            label="Souligné"
            checked={style.underline}
            onChange={(underline) => onChange({ ...style, underline })}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Bouton d'ouverture et modale de mise en forme (même largeur que les profils de programmation).
 */
export function VideoRemarkStylesPanel({ doc, onChangeStyle, onReset }: VideoRemarkStylesPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  useModalEscape(isOpen, close);

  return (
    <>
      <button type="button" className="vr-add" onClick={() => setIsOpen(true)}>
        <Palette size={16} /> Mise en forme
      </button>
      {isOpen ? (
        <div className="modal-overlay" onClick={close}>
          <section
            className="modal fransor-help-modal vr-styles-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vr-styles-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="vr-styles-modal__head">
              <h3 id="vr-styles-title">Mise en forme</h3>
              <div className="row-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Réinitialiser la mise en forme"
                  aria-label="Réinitialiser la mise en forme"
                  onClick={onReset}
                >
                  <RotateCcw size={16} />
                </button>
                <button type="button" className="btn-light" onClick={close}>
                  Fermer
                </button>
              </div>
            </header>
            <div className="vr-styles-modal__body app-scrollbar">
              {styleTargets(doc).map((target) => (
                <StyleRow key={target.id} target={target} onChange={(next) => onChangeStyle(target.id, next)} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
