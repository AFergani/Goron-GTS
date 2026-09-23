/**
 * Panneau modèles Word (upload, installation, aide par type de document).
 */

import { useCallback, useEffect, useState } from "react";
import { CircleHelp, FileUp, FolderOpen, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Role, SiteRef } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { DocumentTemplateListItem, TemplateFlowKind } from "../model/documentTemplates.types";
import { DocumentTemplateHelpModal } from "./DocumentTemplateHelpModal";
import {
  helpIdFromFlowKind,
  resolveDocumentTemplateHelpBlock
} from "./documentTemplateHelpContent";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";

type TemplatesManagementPanelProps = {
  requesterRole: Role;
  requesterUsername: string;
  sites: SiteRef[];
  onNotify?: (message: string) => void;
};

type TemplateAssignmentRow = {
  id: string;
  flowKind: TemplateFlowKind;
  scopeKind: "SITE" | "FAMILLE";
  scopeValue: string;
  scopeLabel: string;
  templateFileName: string;
  createdAt: string;
  updatedAt: string;
};

function formatTemplateNameWithFile(title: string, fileName: string): string {
  const suffix = `(${fileName})`;
  if (title.includes(suffix)) return title;
  return `${title} ${suffix}`;
}

export function TemplatesManagementPanel({ requesterRole, requesterUsername, sites, onNotify }: TemplatesManagementPanelProps) {
  const [templates, setTemplates] = useState<DocumentTemplateListItem[]>([]);
  const [assignments, setAssignments] = useState<TemplateAssignmentRow[]>([]);
  const [writableDir, setWritableDir] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [replacingFileName, setReplacingFileName] = useState<string | null>(null);
  const [helpId, setHelpId] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignFlowKind, setAssignFlowKind] = useState<TemplateFlowKind>("INTERVENTION");
  const [assignScopeKind, setAssignScopeKind] = useState<"SITE" | "FAMILLE">("SITE");
  const [assignSite, setAssignSite] = useState<SiteRef | null>(null);
  const [assignFamille, setAssignFamille] = useState("");
  const [deleteAssignmentId, setDeleteAssignmentId] = useState<string | null>(null);
  const [deleteCustomFileName, setDeleteCustomFileName] = useState<string | null>(null);
  const [restoreBuiltinFileName, setRestoreBuiltinFileName] = useState<string | null>(null);
  const [assignOpenTick, setAssignOpenTick] = useState(0);
  const [assignBaseline, setAssignBaseline] = useState("");

  const refreshTemplates = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await gtsApiClient.listDocumentTemplates();
      setTemplates(res.templates as DocumentTemplateListItem[]);
      setWritableDir(res.writableTemplatesDir ?? null);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Impossible de charger la liste des modèles.");
    } finally {
      setLoadingList(false);
    }
  }, [onNotify]);

  const refreshAssignments = useCallback(async () => {
    try {
      const rows = await gtsApiClient.listTemplateAssignments({ requesterRole });
      setAssignments(rows);
    } catch {
      setAssignments([]);
    }
  }, [requesterRole]);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);
  useEffect(() => {
    void refreshAssignments();
  }, [refreshAssignments]);

  const replaceTemplate = async (fileName: string) => {
    setReplacingFileName(fileName);
    try {
      const res = await gtsApiClient.installDocumentTemplateCopy(fileName);
      if (res.canceled) return;
      onNotify?.(`Modèle installé : ${res.fileName ?? fileName} (data/templates).`);
      await refreshTemplates();
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Remplacement impossible.");
    } finally {
      setReplacingFileName(null);
    }
  };

  const openTemplatesDirectory = async () => {
    try {
      const res = await gtsApiClient.openTemplatesFolder();
      if (!res.success) {
        onNotify?.(res.error || "Impossible d’ouvrir le dossier des modèles.");
        return;
      }
      onNotify?.("Dossier des modèles ouvert. Vous pouvez y placer ou modifier les fichiers .docx (même noms que dans le tableau).");
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Impossible d’ouvrir le dossier des modèles.");
    }
  };

  const uniqueFamilles = Array.from(
    new Set(
      sites
        .map((s) => String(s.famille || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    )
  );

  const assignFlowHelpId = helpIdFromFlowKind(assignFlowKind);
  const assignFlowHelp = resolveDocumentTemplateHelpBlock(assignFlowHelpId);
  const assignSignature = JSON.stringify({
    assignFlowKind,
    assignScopeKind,
    siteId: assignSite?.id ?? "",
    assignFamille
  });
  useEffect(() => {
    if (!assignModalOpen) {
      setAssignBaseline("");
      return;
    }
    setAssignBaseline(assignSignature);
    // Capture après ouverture, pas à chaque changement de champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignModalOpen, assignOpenTick]);
  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } = useCreateModalCloseGuard({
    enabled: assignModalOpen && !helpId,
    isDirty: Boolean(assignBaseline) && assignSignature !== assignBaseline,
    onClose: () => setAssignModalOpen(false)
  });

  const flowKindLabel = (flowKind: string) => {
    if (flowKind === "INTERVENTION") return "Intervention";
    if (flowKind === "RONDE_PLANIFIEE") return "Ronde contractuelle";
    if (flowKind === "GARDIENNAGE") return "Gardiennage";
    return "Ronde exceptionnelle";
  };

  const submitAssignment = async () => {
    const scopeValue = assignScopeKind === "SITE" ? assignSite?.id || "" : assignFamille.trim();
    const scopeLabel =
      assignScopeKind === "SITE" ? `${assignSite?.name || ""}${assignSite?.code ? ` (${assignSite.code})` : ""}` : assignFamille.trim();
    if (!scopeValue || !scopeLabel) {
      onNotify?.("Sélectionnez un site ou une famille avant de choisir le modèle.");
      return;
    }
    try {
      const res = await gtsApiClient.upsertScopedDocumentTemplate({
        requesterRole,
        requesterUsername,
        flowKind: assignFlowKind,
        scopeKind: assignScopeKind,
        scopeValue,
        scopeLabel
      });
      if (res.canceled) return;
      onNotify?.("Modèle personnalisé attribué.");
      setAssignModalOpen(false);
      setAssignSite(null);
      setAssignFamille("");
      await refreshTemplates();
      await refreshAssignments();
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Attribution impossible.");
    }
  };

  const confirmDeleteAssignment = async () => {
    if (!deleteAssignmentId) return;
    try {
      await gtsApiClient.deleteTemplateAssignment({
        requesterRole,
        requesterUsername,
        id: deleteAssignmentId,
        reason: "Nettoyage attribution modèle personnalisé"
      });
      setDeleteAssignmentId(null);
      onNotify?.("Attribution supprimée.");
      await refreshAssignments();
      await refreshTemplates();
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Suppression impossible.");
    }
  };

  const confirmDeleteCustomFile = async () => {
    if (!deleteCustomFileName) return;
    try {
      await gtsApiClient.deleteCustomDocumentTemplate({
        requesterRole,
        requesterUsername,
        targetFileName: deleteCustomFileName
      });
      setDeleteCustomFileName(null);
      onNotify?.("Modèle personnalisé supprimé.");
      await refreshTemplates();
      await refreshAssignments();
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Suppression impossible.");
    }
  };

  const confirmRestoreBuiltin = async () => {
    if (!restoreBuiltinFileName) return;
    try {
      await gtsApiClient.restoreBuiltinDocumentTemplate({
        requesterRole,
        requesterUsername,
        targetFileName: restoreBuiltinFileName
      });
      setRestoreBuiltinFileName(null);
      onNotify?.("Modèle embarqué rétabli.");
      await refreshTemplates();
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Impossible de rétablir le modèle embarqué.");
    }
  };

  return (
    <>
      <div className="templates-management-panel">
        <div className="row settings-tab-toolbar">
          {writableDir ? (
            <p className="muted templates-management-panel__writable" title={writableDir}>
              Dossier d’écriture des remplacements : <code>{writableDir}</code>
            </p>
          ) : (
            <p className="muted templates-management-panel__writable">
              Base non configurée : impossible de déterminer le dossier d’écriture.
            </p>
          )}
          <div className="row-actions">
            <button
              type="button"
              className="btn-light"
              title="Ouvrir le dossier data/templates"
              aria-label="Ouvrir le dossier des modèles Word"
              disabled={!writableDir}
              onClick={() => void openTemplatesDirectory()}
            >
              <FolderOpen size={16} aria-hidden />
              Ouvrir le dossier
            </button>
            <button
              type="button"
              className="btn-light"
              title="Actualiser la liste"
              aria-label="Actualiser la liste"
              disabled={loadingList}
              onClick={() => void refreshTemplates()}
            >
              <RotateCcw size={16} aria-hidden />
              Actualiser
            </button>
            <button
              type="button"
              className="mc-btn-primary"
              title="Ajouter un modèle personnalisé"
              onClick={() => {
                setAssignFlowKind("INTERVENTION");
                setAssignScopeKind("SITE");
                setAssignSite(null);
                setAssignFamille("");
                setAssignModalOpen(true);
                setAssignOpenTick((tick) => tick + 1);
              }}
            >
              <Plus size={16} aria-hidden />
              Nouvelle attribution
            </button>
          </div>
        </div>

        <div className="table-scroll-x">
          <table className="data-table-fixed templates-management-panel__table templates-management-panel__table--files">
            <colgroup>
              <col />
              <col />
              <col className="templates-management-panel__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Modèle</th>
                <th>Chemin résolu</th>
                <th className="templates-management-panel__col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Chargement…
                  </td>
                </tr>
              ) : (
                templates.map((row) => (
                  <tr key={row.templateKey}>
                    <td className="templates-management-panel__name-cell" title={formatTemplateNameWithFile(row.title, row.fileName)}>
                      {formatTemplateNameWithFile(row.title, row.fileName)}
                    </td>
                    <td className="templates-management-panel__path-cell">
                      <span
                        className={
                          row.exists
                            ? "templates-management-panel__path--ok"
                            : "templates-management-panel__path--missing"
                        }
                        title={
                          row.exists
                            ? `Présent — ${row.resolvedPath}`
                            : "Absent — défaut embarqué ou fichier absent"
                        }
                      >
                        {row.resolvedPath || "— (défaut embarqué ou fichier absent)"}
                      </span>
                    </td>
                    <td className="templates-management-panel__col-actions">
                      <div className="templates-management-panel__row-actions">
                        <button
                          type="button"
                          className="btn-light"
                          title="Variables du modèle"
                          aria-label={`Variables du modèle ${row.title}`}
                          onClick={() => setHelpId(row.helpId)}
                        >
                          <CircleHelp size={16} aria-hidden />
                          Variable
                        </button>
                        <button
                          type="button"
                          className="btn-light"
                          title="Remplacer par un fichier .docx (copie dans data/templates)"
                          aria-label={`Remplacer le modèle ${row.fileName}`}
                          disabled={replacingFileName === row.fileName || !writableDir}
                          onClick={() => void replaceTemplate(row.fileName)}
                        >
                          <FileUp size={16} aria-hidden />
                          Remplacer
                        </button>
                        {row.kind === "builtin" && row.overridden ? (
                          <button
                            type="button"
                            className="btn-light"
                            title="Retirer le fichier personnalisé et revenir au modèle embarqué"
                            aria-label={`Rétablir le modèle embarqué ${row.fileName}`}
                            disabled={!writableDir}
                            onClick={() => setRestoreBuiltinFileName(row.fileName)}
                          >
                            <RotateCcw size={16} aria-hidden />
                            Rétablir
                          </button>
                        ) : null}
                        {row.kind === "custom" ? (
                          <button
                            type="button"
                            className="btn-danger"
                            title="Supprimer ce fichier modèle personnalisé"
                            aria-label={`Supprimer le modèle ${row.fileName}`}
                            disabled={!writableDir}
                            onClick={() => setDeleteCustomFileName(row.fileName)}
                          >
                            <Trash2 size={16} aria-hidden />
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <h4 className="templates-management-panel__subsection-title">Attributions personnalisées</h4>
        <div className="table-scroll-x">
          <table className="data-table-fixed templates-management-panel__table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col className="templates-management-panel__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Flux</th>
                <th>Portée</th>
                <th>Valeur</th>
                <th>Modèle</th>
                <th className="templates-management-panel__col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length ? (
                assignments.map((row) => (
                  <tr key={row.id}>
                    <td>{flowKindLabel(row.flowKind)}</td>
                    <td>{row.scopeKind === "SITE" ? "Site" : "Famille"}</td>
                    <td>{row.scopeLabel}</td>
                    <td>
                      <code>{row.templateFileName}</code>
                    </td>
                    <td className="templates-management-panel__col-actions">
                      <div className="templates-management-panel__row-actions">
                        <button
                          type="button"
                          className="btn-light"
                          title="Variables du modèle (mêmes champs que le modèle par défaut de ce flux)"
                          aria-label={`Variables du modèle ${flowKindLabel(row.flowKind)}`}
                          onClick={() => setHelpId(helpIdFromFlowKind(row.flowKind))}
                        >
                          <CircleHelp size={16} aria-hidden />
                          Variable
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          title="Supprimer l'attribution"
                          aria-label="Supprimer l'attribution"
                          onClick={() => setDeleteAssignmentId(row.id)}
                        >
                          <Trash2 size={16} aria-hidden />
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="muted">
                    Aucune attribution personnalisée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {assignModalOpen ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!helpId) requestClose();
          }}
        >
          <section className="modal fransor-help-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter un modèle personnalisé</h3>
            <p className="muted">
              Sélectionnez le flux, la portée, puis choisissez le fichier Word. Ce modèle personnalisé accepte{" "}
              <strong>les mêmes champs</strong> que le modèle par défaut du flux, plus les variables custom affectées à ce flux.
            </p>
            <div className="form">
              <label>
                <span className="templates-assign-modal__flow-label">
                  Flux
                  <button
                    type="button"
                    className="action-icon-btn btn-light"
                    title="Afficher tous les champs Word de ce flux"
                    aria-label="Afficher tous les champs Word de ce flux"
                    onClick={() => setHelpId(assignFlowHelpId)}
                  >
                    <CircleHelp size={16} aria-hidden />
                  </button>
                </span>
                <select
                  value={assignFlowKind}
                  onChange={(e) => setAssignFlowKind(e.target.value as TemplateFlowKind)}
                >
                  <option value="INTERVENTION">Intervention</option>
                  <option value="RONDE_PLANIFIEE">Ronde contractuelle</option>
                  <option value="RONDE_EXCEPTIONNELLE">Ronde exceptionnelle</option>
                </select>
              </label>
              {assignFlowHelp ? (
                <div className="templates-assign-modal__tokens app-scroll-panel" role="region" aria-label="Champs Word du flux">
                  <p className="muted templates-assign-modal__tokens-intro">
                    Champs du modèle par défaut « {flowKindLabel(assignFlowKind)} » (à coller dans le .docx) :
                  </p>
                  <ul className="templates-assign-modal__tokens-list">
                    {assignFlowHelp.variables.map((item) => (
                      <li key={item.token}>
                        <code>{item.token}</code>
                        <span> — {item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label>
                Portée
                <select value={assignScopeKind} onChange={(e) => setAssignScopeKind(e.target.value as "SITE" | "FAMILLE")}>
                  <option value="SITE">Site</option>
                  <option value="FAMILLE">Famille</option>
                </select>
              </label>
              {assignScopeKind === "SITE" ? (
                <div className="templates-assign-modal__site-search">
                  <SiteSearchInput
                    sites={sites}
                    selectedSite={assignSite}
                    onSelectedSiteChange={setAssignSite}
                    copyNotify={onNotify}
                  />
                </div>
              ) : (
                <label>
                  Famille
                  <input list="familles-list" value={assignFamille} onChange={(e) => setAssignFamille(e.target.value)} placeholder="Ex. Famille exemple" />
                  <datalist id="familles-list">
                    {uniqueFamilles.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </label>
              )}
            </div>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={requestClose}>
                Fermer
              </button>
              <button type="button" onClick={() => void submitAssignment()}>
                Choisir et attribuer le modèle
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <DocumentTemplateHelpModal
        helpId={helpId}
        onClose={() => setHelpId(null)}
        onNotify={onNotify}
        requesterRole={requesterRole}
      />
      <DiscardConfirmModal
        isOpen={showDiscardConfirm}
        onCancel={cancelDiscard}
        onConfirm={confirmDiscardAndClose}
      />
      <ConfirmModal
        isOpen={Boolean(deleteAssignmentId)}
        title="Supprimer cette attribution ?"
        message="L’attribution sera retirée pour ce flux et cette portée. Si plus aucun flux n’utilise le fichier, il sera aussi retiré du dossier des modèles."
        confirmLabel="Supprimer"
        confirmClassName="btn-danger"
        onCancel={() => setDeleteAssignmentId(null)}
        onConfirm={() => void confirmDeleteAssignment()}
      />
      <ConfirmModal
        isOpen={Boolean(deleteCustomFileName)}
        title="Supprimer ce modèle personnalisé ?"
        message="Le fichier sera retiré du dossier des modèles. Les attributions éventuelles qui l’utilisent seront aussi supprimées."
        confirmLabel="Supprimer"
        confirmClassName="btn-danger"
        onCancel={() => setDeleteCustomFileName(null)}
        onConfirm={() => void confirmDeleteCustomFile()}
      />
      <ConfirmModal
        isOpen={Boolean(restoreBuiltinFileName)}
        title="Revenir au modèle embarqué ?"
        message="Le fichier personnalisé de ce poste sera retiré. Les prochains exports utiliseront le modèle livré avec l’application."
        confirmLabel="Rétablir"
        onCancel={() => setRestoreBuiltinFileName(null)}
        onConfirm={() => void confirmRestoreBuiltin()}
      />
    </>
  );
}
