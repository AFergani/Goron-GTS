/**
 * Paramètres des liens vidéo (lien principal, liens supplémentaires, texte d'aide).
 */

import { Plus, Trash2 } from "lucide-react";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { createLocalId } from "../model/videoRemarkDocument";
import type { ExtraLink, VideoRemarkDocument } from "../model/videoRemarkTypes";

type VideoRemarkLinksPanelProps = {
  doc: VideoRemarkDocument;
  onChange: (video: VideoRemarkDocument["video"]) => void;
};

/**
 * Panneau des URL collées dans la remarque.
 */
export function VideoRemarkLinksPanel({ doc, onChange }: VideoRemarkLinksPanelProps) {
  const video = doc.video;

  const setExtraLinks = (extraLinks: ExtraLink[]) => onChange({ ...video, extraLinks });

  return (
    <details className="vr-panel" open>
      <summary>
        Paramètres des liens
        <button
          type="button"
          className="vr-add vr-add--end"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExtraLinks([...video.extraLinks, { id: createLocalId(), url: "", text: "" }]);
          }}
        >
          <Plus size={14} /> Ajouter un lien
        </button>
      </summary>
      <div className="vr-panel__body">
        <div className="vr-extra-link">
          <label className="vr-field">
            <span>URL lien 1</span>
            <input
              type="url"
              value={video.url}
              placeholder="https://…"
              onChange={(event) => onChange({ ...video, url: event.target.value })}
            />
          </label>
          <label className="vr-field">
            <span>Texte lien 1</span>
            <input
              type="text"
              value={video.linkText}
              placeholder="Saisir la valeur"
              onChange={(event) => onChange({ ...video, linkText: event.target.value })}
            />
          </label>
          <span className="icon-btn vr-extra-link__spacer" aria-hidden="true" />
        </div>
        {video.extraLinks.map((link, index) => (
          <div key={link.id} className="vr-extra-link">
            <label className="vr-field">
              <span>URL lien {index + 2}</span>
              <input
                type="url"
                value={link.url}
                placeholder="https://…"
                onChange={(event) => {
                  const extraLinks = video.extraLinks.slice();
                  extraLinks[index] = { ...link, url: event.target.value };
                  setExtraLinks(extraLinks);
                }}
              />
            </label>
            <label className="vr-field">
              <span>Texte lien {index + 2}</span>
              <input
                type="text"
                value={link.text}
                placeholder="Saisir la valeur"
                onChange={(event) => {
                  const extraLinks = video.extraLinks.slice();
                  extraLinks[index] = { ...link, text: event.target.value };
                  setExtraLinks(extraLinks);
                }}
              />
            </label>
            <button
              type="button"
              className="icon-btn"
              title="Supprimer ce lien"
              aria-label={`Supprimer le lien ${index + 2}`}
              onClick={() => setExtraLinks(video.extraLinks.filter((item) => item.id !== link.id))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="vr-switch-row">
          <ToggleSwitch
            label="Inclure le lien vidéo"
            checked={video.includeVideoLink}
            onChange={(includeVideoLink) => onChange({ ...video, includeVideoLink })}
          />
          <ToggleSwitch
            label="Inclure le texte d'aide"
            checked={video.includeFooterHelp}
            onChange={(includeFooterHelp) => onChange({ ...video, includeFooterHelp })}
          />
        </div>
      </div>
    </details>
  );
}
