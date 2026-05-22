/**
 * Modale d’aide modèle Word (liste des jetons, copie presse-papiers).
 */

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import type { Role } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { DOCUMENT_TEMPLATE_HELP } from "./documentTemplateHelpContent";
import { fransorResponsableWordSlug } from "../../fransor/utils/fransorResponsableWordSlug";
import type { FormVariableDef } from "../model/formVariables.types";
import type { FormTarget } from "../model/formVariables.types";

type DocumentTemplateHelpModalProps = {
  helpId: string | null;
  onClose: () => void;
  onNotify?: (message: string) => void;
  /** Pour lister les jetons `{resp_…}` réels (référentiel Fransor). */
  requesterRole?: Role;
};

export function DocumentTemplateHelpModal({
  helpId,
  onClose,
  onNotify,
  requesterRole
}: DocumentTemplateHelpModalProps) {
  const [fransorTokenRows, setFransorTokenRows] = useState<Array<{ token: string; description: string }>>([]);
  const [fransorTokensLoading, setFransorTokensLoading] = useState(false);
  const [templateCustomRows, setTemplateCustomRows] = useState<Array<{ token: string; description: string }>>([]);
  const [templateCustomLoading, setTemplateCustomLoading] = useState(false);

  function helpIdToFormTargets(value: string): FormTarget[] {
    if (value === "main-courante") return ["MAIN_COURANTE"];
    if (value === "intervention") return ["INTERVENTION"];
    if (value === "gardiennage") return ["GARDIENNAGE"];
    if (value === "ronde" || value === "custom-docx") return ["RONDE_PLANIFIEE", "RONDE_EXCEPTIONNELLE"];
    return [];
  }

  useEffect(() => {
    if (helpId !== "fransor-recap" || !requesterRole) {
      setFransorTokenRows([]);
      setFransorTokensLoading(false);
      return;
    }
    let cancelled = false;
    setFransorTokensLoading(true);
    void gtsApiClient
      .listFransorResponsables({ requesterRole })
      .then((rows) => {
        if (cancelled) return;
        const out: Array<{ token: string; description: string }> = [];
        for (const r of rows) {
          const name = String(r.name || "").trim();
          if (!name) continue;
          const slug = fransorResponsableWordSlug(name);
          out.push({
            token: `{resp_${slug}_nom}`,
            description: `Nom affiché du responsable (« ${name} »).`
          });
          out.push({
            token: `{resp_${slug}_ouvertures}`,
            description: `Ouvertures du mois pour « ${name} » (récap).`
          });
          out.push({
            token: `{resp_${slug}_fermetures}`,
            description: `Fermetures du mois pour « ${name} » (récap).`
          });
        }
        setFransorTokenRows(out);
      })
      .catch(() => {
        if (!cancelled) setFransorTokenRows([]);
      })
      .finally(() => {
        if (!cancelled) setFransorTokensLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [helpId, requesterRole]);

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

  const block = helpId ? DOCUMENT_TEMPLATE_HELP[helpId] : undefined;

  const displayVariables = useMemo(() => {
    if (!block) return [];
    const withFransor = helpId === "fransor-recap" ? [...block.variables, ...fransorTokenRows] : [...block.variables];
    return [...withFransor, ...templateCustomRows];
  }, [helpId, block, fransorTokenRows, templateCustomRows]);

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
        {helpId === "fransor-recap" && fransorTokensLoading ? (
          <p className="muted document-template-help-modal__intro">Chargement des jetons depuis le référentiel Fransor…</p>
        ) : null}
        {helpId === "fransor-recap" && !fransorTokensLoading && requesterRole && !fransorTokenRows.length ? (
          <p className="muted document-template-help-modal__intro">
            Aucun responsable dans le référentiel : ajoutez-en dans Paramètres → Données → Fransor pour voir les jetons{' '}
            <code>{'{resp_…}'}</code> ici.
          </p>
        ) : null}
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
