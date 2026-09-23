/**
 * Récapitulatif des lignes + compteurs preview (demande exceptionnelle ou profil contractuel).
 */

import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import {
  formatLineDraftSummary,
  rondeRequestLineDisplayNumber,
  type LineDraft
} from "../model/rondeRequestLineDraft";
import { isRondeTimeHm } from "../utils/rondeDateTime";

type RondeRequestLinesRecapProps = {
  lines: LineDraft[];
  isEdit: boolean;
  isContract: boolean;
  isSingleDay: boolean;
  validFrom: string;
  validFromTime: string;
  validTo: string;
  validToTime: string;
  exceptionalPerLine: number[];
  exceptionalTotal: number;
  /** Texte si ouverture/fermeture ancrent la série d’intervalle. */
  intervalHonorNote?: string;
};

export function RondeRequestLinesRecap({
  lines,
  isEdit,
  isContract,
  isSingleDay,
  validFrom,
  validFromTime,
  validTo,
  validToTime,
  exceptionalPerLine,
  exceptionalTotal,
  intervalHonorNote = ""
}: RondeRequestLinesRecapProps) {
  return (
    <section className="panel ronde-request-recap" style={{ marginTop: 8, padding: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        {isEdit ? "Récapitulatif de la programmation" : "Récapitulatif"}
      </div>
      {lines.length === 0 ? (
        <div className="muted">Aucune ligne de planification.</div>
      ) : (
        lines.map((line, index) => (
          <div key={`recap-line-${line.id || index}`} className="muted ronde-request-recap__line">
            Ligne {rondeRequestLineDisplayNumber(index, lines.length)}:{" "}
            {formatLineDraftSummary(line, {
              omitWeekdayRecurrence: isSingleDay
            })}
            {!isEdit ? (
              <>
                {" "}
                → {exceptionalPerLine[index] ?? 0} ronde
                {(exceptionalPerLine[index] ?? 0) > 1 ? "s" : ""}
              </>
            ) : null}
          </div>
        ))
      )}
      {(isContract || isEdit) && validFrom.trim() ? (
        <div style={{ marginTop: 6 }} className="muted">
          Validité : du {formatDateShortFr(validFrom.trim()) || "—"}
          {isRondeTimeHm(validFromTime.trim()) ? ` ${validFromTime.trim()}` : ""}
          {" au "}
          {formatDateShortFr((isSingleDay ? validFrom.trim() : validTo.trim()) || "") || "—"}
          {isRondeTimeHm(validToTime.trim()) ? ` ${validToTime.trim()}` : ""}
          {isSingleDay ? " · Jour unique" : ""}
        </div>
      ) : null}
      {intervalHonorNote ? (
        <div className="muted" style={{ marginTop: 8 }}>
          {intervalHonorNote}
        </div>
      ) : null}
      {!isEdit ? (
        <>
          {isContract ? (
            <div className="muted" style={{ marginTop: 6 }}>
              Aperçu pour la nuit du début de validité (puis récurrence du profil).
            </div>
          ) : null}
          <div style={{ marginTop: 6, fontWeight: 600 }}>
            Total : {exceptionalTotal} ronde{exceptionalTotal > 1 ? "s" : ""}
          </div>
        </>
      ) : null}
    </section>
  );
}
