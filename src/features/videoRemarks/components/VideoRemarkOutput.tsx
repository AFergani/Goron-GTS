/**
 * HTML généré et aperçu visuel de la remarque vidéo.
 */

import { Copy } from "lucide-react";
import { buildPreviewDocument } from "../model/buildVideoRemarkHtml";

type VideoRemarkOutputProps = {
  html: string;
  onCopy: () => void;
};

/**
 * Colonne de droite : source HTML en lecture seule et aperçu sur fond blanc.
 */
export function VideoRemarkOutput({ html, onCopy }: VideoRemarkOutputProps) {
  return (
    <div className="vr-output">
      <section className="vr-output__pane">
        <header className="vr-output__head">
          <h2>HTML généré</h2>
          <button type="button" className="vr-add" onClick={onCopy}>
            <Copy size={14} /> Copier le HTML
          </button>
        </header>
        <textarea className="vr-html" readOnly spellCheck={false} value={html} aria-label="HTML généré" />
      </section>
      <section className="vr-output__pane">
        <header className="vr-output__head">
          <h2>Aperçu visuel</h2>
        </header>
        <iframe
          className="vr-preview"
          title="Aperçu HTML"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          srcDoc={buildPreviewDocument(html)}
        />
      </section>
    </div>
  );
}
