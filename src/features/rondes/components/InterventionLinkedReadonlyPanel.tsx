/**
 * Panneau lecture seule de l’intervention liée (ronde créée depuis une intervention).
 */

import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import type { InterventionEntry } from "../../intervention/model/intervention.types";

function formatDateFr(dateIso: string) {
  if (!dateIso) return "—";
  const t = Date.parse(`${dateIso}T12:00:00`);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type InterventionLinkedReadonlyPanelProps = {
  entry: InterventionEntry;
  onNotify?: (message: string) => void;
};

export function InterventionLinkedReadonlyPanel({ entry, onNotify }: InterventionLinkedReadonlyPanelProps) {
  return (
    <aside className="linked-intervention-readonly" aria-label="Intervention d'origine en lecture seule">
      <h4 className="mc-block-title">Intervention d&apos;origine</h4>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: 13 }}>
        Lecture seule — rapprochement avec la ronde créée à partir de cette intervention.
      </p>
      <div className="linked-intervention-ro-field linked-intervention-ro-field--site">
        <span>Site</span>
        <SiteDisplayCopyButton siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
      </div>
      <div className="linked-intervention-ro-field">
        <span>Date / heure de la demande</span>
        {formatDateFr(entry.requestDate)}
        {entry.requestTime ? ` · ${entry.requestTime}` : ""}
      </div>
      <div className="linked-intervention-ro-field">
        <span>Motif intervention</span>
        {entry.requestReason.trim() || "—"}
      </div>
      <div className="linked-intervention-ro-field">
        <span>Prestataire</span>
        {entry.intervenantName || "—"}
      </div>
      <div className="linked-intervention-ro-field">
        <span>Horaires terrain</span>
        {entry.arrivalTime || "—"} → {entry.departureTime || "—"}
      </div>
      <div className="linked-intervention-ro-field">
        <span>N° bon</span>
        {entry.workOrderNumber || "—"}
      </div>
      <div className="linked-intervention-ro-field">
        <span>Compte rendu intervention</span>
        <span style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>{entry.report.trim() || "—"}</span>
      </div>
    </aside>
  );
}
