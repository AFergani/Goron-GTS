/**
 * Modale d’aide modèle Word (liste des jetons, copie presse-papiers).
 */

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import type { Role } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { helpIdToFormTargets, resolveDocumentTemplateHelpBlock } from "./documentTemplateHelpContent";
import type { FormVariableDef } from "../model/formVariables.types";
import type { FormTarget } from "../model/formVariables.types";
import { useModalEscape } from "../../common/hooks/useModalEscape";

type DocumentTemplateHelpModalProps = {
  helpId: string | null;
  onClose: () => void;
  onNotify?: (message: string) => void;
  requesterRole?: Role;
};

export function DocumentTemplateHelpModal({
  helpId,
  onClose,
  onNotify,
  requesterRole
}: DocumentTemplateHelpModalProps) {
  const [templateCustomRows, setTemplateCustomRows] = useState<Array<{ token: string; description: string }>>([]);
  const [templateCustomLoading, setTemplateCustomLoading] = useState(false);

  useEffect(() => {
    if (!helpId || !requesterRole) {
      setTemplateCustomRows([]);
      setTemplateCustomLoading(false);
      return;
    }
    let cancelled = false;
    setTemplateCustomLoading(true);
    void gtsApiClient
      .listFormVariables({ requesterRole })
      .then((rows: FormVariableDef[]) => {
        if (cancelled) return;
        const customRows: Array<{ token: string; description: string }> = [];
        const targetForms = helpIdToFormTargets(helpId);
        for (const row of rows) {
          if (targetForms.length > 0) {
            const hasFormAssignment = row.assignments.some((a) => a.kind === "FORM" && targetForms.includes(a.value as FormTarget));
            if (!hasFormAssignment) continue;
          }
          const key = String(row.fieldKey || "").trim();
          if (!key) continue;
          customRows.push({
            token: `{${key}}`,
            description: `Variable custom: ${row.label || key}`
          });
        }
        setTemplateCustomRows(customRows);
      })
      .catch(() => {
        if (!cancelled) setTemplateCustomRows([]);
      })
      .finally(() => {
        if (!cancelled) setTemplateCustomLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [helpId, requesterRole]);

  const block = helpId ? resolveDocumentTemplateHelpBlock(helpId) : undefined;

  const displayVariables = useMemo(() => {
    if (!block) return [];
    return [...block.variables, ...templateCustomRows];
  }, [block, templateCustomRows]);

  useModalEscape(Boolean(helpId), onClose);

  if (!helpId || !block) return null;

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      onNotify?.("Variable copiée.");
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal fransor-help-modal document-template-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3>{block.title}</h3>
        </div>
        {block.intro ? <p className="muted document-template-help-modal__intro">{block.intro}</p> : null}
        {templateCustomLoading ? (
          <p className="muted document-template-help-modal__intro">Chargement des variables custom…</p>
        ) : null}
        <div className="table-scroll-x">
          <table className="data-table-fixed document-template-help-modal__table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Description</th>
                <th className="document-template-help-modal__col-copy"> </th>
              </tr>
            </thead>
            <tbody>
              {displayVariables.map((row, index) => (
                <tr key={`${row.token}-${index}`}>
                  <td>
                    <code className="document-template-help-modal__token">{row.token}</code>
                  </td>
                  <td>{row.description}</td>
                  <td className="document-template-help-modal__cell-copy">
                    <button
                      type="button"
                      className="btn-light action-icon-btn"
                      title="Copier la variable"
                      aria-label={`Copier ${row.token}`}
                      onClick={() => void copyToken(row.token)}
                    >
                      <Copy size={16} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {block.footerNote ? <p className="muted document-template-help-modal__footer">{block.footerNote}</p> : null}
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={onClose}>
            Fermer
          </button>
        </div>
      </section>
    </div>
  );
}
