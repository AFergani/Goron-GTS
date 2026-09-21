/**
 * Panneau variables de formulaire (affectations site/famille/profil, types de champs).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Role, SiteRef } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { RondePlannedProfileRef } from "../../rondes/model/rondePlanned.types";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import {
  FORM_VARIABLE_ENTRY_STAGE_OPTIONS,
  formVariableEntryStageLabel,
  normalizeFormVariableEntryStage,
  type FormTarget,
  type FormVariableDef,
  type FormVariableEntryStage,
  type FormVariablePayload
} from "../model/formVariables.types";
import { WORD_TEMPLATE_FIELD_TYPES, labelToFieldKey, wordTemplateFieldTypeLabel } from "../model/wordTemplateFieldTypes";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";

type VariablesManagementPanelProps = {
  requesterRole: Role;
  requesterUsername: string;
  sites: SiteRef[];
  rondePlannedProfiles: RondePlannedProfileRef[];
  onNotify?: (message: string) => void;
};

const FORM_TARGET_OPTIONS: Array<{ value: FormTarget; label: string }> = [
  { value: "RONDE_PLANIFIEE", label: "Ronde contractuelle" },
  { value: "RONDE_EXCEPTIONNELLE", label: "Ronde exceptionnelle" },
  { value: "INTERVENTION", label: "Intervention" },
  { value: "MAIN_COURANTE", label: "Main courante" },
  { value: "GARDIENNAGE", label: "Gardiennage" }
];

export function VariablesManagementPanel({
  requesterRole,
  requesterUsername,
  sites,
  rondePlannedProfiles,
  onNotify
}: VariablesManagementPanelProps) {
  const [rows, setRows] = useState<FormVariableDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPlaceholder, setDraftPlaceholder] = useState("");
  const [draftType, setDraftType] = useState<FormVariableDef["fieldType"]>("text");
  const [draftOptions, setDraftOptions] = useState("");
  const [draftForms, setDraftForms] = useState<FormTarget[]>([]);
  const [draftProfileIds, setDraftProfileIds] = useState<string[]>([]);
  const [draftScopeKind, setDraftScopeKind] = useState<"ALL" | "SITE" | "FAMILLE">("ALL");
  const [draftScopeSite, setDraftScopeSite] = useState<SiteRef | null>(null);
  const [draftScopeFamille, setDraftScopeFamille] = useState("");
  const [draftEntryStage, setDraftEntryStage] = useState<FormVariableEntryStage>("CLOSURE");
  const [deleteFieldKey, setDeleteFieldKey] = useState<string | null>(null);
  const [draftOpenTick, setDraftOpenTick] = useState(0);
  const [draftBaseline, setDraftBaseline] = useState("");
  const canEdit = requesterRole === "RESPONSABLE" || requesterRole === "DEV";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const vars = await gtsApiClient.listFormVariables({ requesterRole });
      setRows(vars);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Impossible de charger les variables.");
    } finally {
      setLoading(false);
    }
  }, [requesterRole, onNotify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const persist = useCallback(
    async (nextRows: FormVariableDef[]) => {
      if (!canEdit) return;
      setSaving(true);
      try {
        const payload: FormVariablePayload[] = nextRows.map((v) => ({
          fieldKey: v.fieldKey,
          label: v.label,
          fieldType: v.fieldType,
          placeholder: v.placeholder,
          required: v.required,
          options: v.options,
          assignments: v.assignments,
          entryStage: v.entryStage
        }));
        const saved = await gtsApiClient.saveFormVariables({
          requesterRole,
          requesterUsername,
          variables: payload
        });
        setRows(saved);
      } catch (err) {
        onNotify?.(err instanceof Error ? err.message : "Impossible d'enregistrer les variables.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, requesterRole, requesterUsername, onNotify]
  );

  const editingRow = useMemo(() => {
    if (!editKey) return null;
    return rows.find((r) => r.fieldKey === editKey) ?? null;
  }, [rows, editKey]);

  const openCreateModal = () => {
    setEditKey(null);
    setDraftLabel("");
    setDraftPlaceholder("");
    setDraftType("text");
    setDraftOptions("");
    setDraftForms([]);
    setDraftProfileIds([]);
    setDraftScopeKind("ALL");
    setDraftScopeSite(null);
    setDraftScopeFamille("");
    setDraftEntryStage("CLOSURE");
    setModalOpen(true);
    setDraftOpenTick((tick) => tick + 1);
  };

  const openEditModal = (row: FormVariableDef) => {
    setEditKey(row.fieldKey);
    setDraftLabel(row.label);
    setDraftPlaceholder(row.placeholder);
    setDraftType(row.fieldType);
    setDraftOptions(row.options.join(", "));
    const formTargets = row.assignments.filter((a) => a.kind === "FORM").map((a) => a.value as FormTarget);
    setDraftForms(formTargets);
    const profileIds = row.assignments.filter((a) => a.kind === "PROFILE").map((a) => a.value);
    setDraftProfileIds(formTargets.includes("RONDE_PLANIFIEE") ? profileIds : []);
    const scopeSite = row.assignments.find((a) => a.kind === "SITE");
    const scopeFamille = row.assignments.find((a) => a.kind === "FAMILLE");
    if (scopeSite?.value) {
      const site = sites.find((s) => s.id === scopeSite.value) ?? null;
      setDraftScopeKind("SITE");
      setDraftScopeSite(site);
      setDraftScopeFamille("");
    } else if (scopeFamille?.value) {
      setDraftScopeKind("FAMILLE");
      setDraftScopeSite(null);
      setDraftScopeFamille(scopeFamille.value);
    } else {
      setDraftScopeKind("ALL");
      setDraftScopeSite(null);
      setDraftScopeFamille("");
    }
    setDraftEntryStage(normalizeFormVariableEntryStage(row.entryStage));
    setModalOpen(true);
    setDraftOpenTick((tick) => tick + 1);
  };

  const draftFieldKey = editKey ? editKey : labelToFieldKey(draftLabel);
  const draftCanSubmit = Boolean(draftLabel.trim() && draftFieldKey && draftForms.length >= 1);
  const draftSignature = JSON.stringify({
    draftLabel,
    draftPlaceholder,
    draftType,
    draftOptions,
    draftForms,
    draftProfileIds,
    draftScopeKind,
    siteId: draftScopeSite?.id ?? "",
    draftScopeFamille,
    draftEntryStage
  });
  useEffect(() => {
    if (!modalOpen) {
      setDraftBaseline("");
      return;
    }
    setDraftBaseline(draftSignature);
    // Capture après ouverture / préremplissage, pas à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, draftOpenTick]);
  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } = useCreateModalCloseGuard({
    enabled: modalOpen && !saving,
    isDirty: Boolean(draftBaseline) && draftSignature !== draftBaseline,
    onClose: () => setModalOpen(false)
  });
  const familles = useMemo(
    () =>
      Array.from(
        new Set(
          sites
            .map((s) => String(s.famille || "").trim().toUpperCase())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [sites]
  );
  const normalizedScopeFamille = String(draftScopeFamille || "").trim().toUpperCase();
  const scopeValidationMessage =
    draftScopeKind === "SITE" && !draftScopeSite
      ? "Sélectionnez un site pour la portée."
      : draftScopeKind === "FAMILLE" && !normalizedScopeFamille
        ? "Saisissez une famille pour la portée."
        : "";
  const draftValidationMessage = !draftLabel.trim()
    ? "Le libellé est obligatoire."
    : !draftFieldKey
      ? "Le libellé doit contenir au moins une lettre pour générer une variable technique."
      : draftForms.length < 1
        ? "Sélectionnez au moins un formulaire cible."
        : scopeValidationMessage
          ? scopeValidationMessage
        : "";

  const toggleChoice = (current: string[], value: string): string[] =>
    current.includes(value) ? current.filter((x) => x !== value) : [...current, value];

  const formTargetLabel = useMemo(
    () => Object.fromEntries(FORM_TARGET_OPTIONS.map((o) => [o.value, o.label])) as Record<FormTarget, string>,
    []
  );

  const saveDraftIntoRows = async () => {
    if (!draftCanSubmit) {
      onNotify?.(draftValidationMessage || "Renseignez les champs obligatoires de la variable.");
      return;
    }
    const now = new Date().toISOString();
    const options = draftType === "select"
      ? draftOptions.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const profileAssignmentsForSave =
      draftForms.includes("RONDE_PLANIFIEE") && draftProfileIds.length > 0
        ? draftProfileIds.map((value) => ({ kind: "PROFILE" as const, value }))
        : [];
    const assignments: FormVariableDef["assignments"] = [
      ...draftForms.map((value) => ({ kind: "FORM" as const, value })),
      ...profileAssignmentsForSave
    ];
    if (draftScopeKind === "SITE" && draftScopeSite?.id) {
      assignments.push({ kind: "SITE", value: draftScopeSite.id });
    } else if (draftScopeKind === "FAMILLE" && normalizedScopeFamille) {
      assignments.push({ kind: "FAMILLE", value: normalizedScopeFamille });
    }
    const entryStage = draftEntryStage;

    const nextRows =
      editKey && editingRow
        ? rows.map((row) =>
            row.fieldKey === editKey
              ? {
                  ...row,
                  label: draftLabel.trim(),
                  fieldType: draftType,
                  placeholder: draftPlaceholder.trim(),
                  options,
                  assignments,
                  entryStage,
                  updatedAt: now
                }
              : row
          )
        : [
            ...rows,
            {
              id: `tmp-${draftFieldKey}`,
              sortOrder: rows.length,
              fieldKey: draftFieldKey,
              label: draftLabel.trim(),
              fieldType: draftType,
              placeholder: draftPlaceholder.trim(),
              required: false,
              options,
              assignments,
              entryStage,
              createdAt: now,
              updatedAt: now
            }
          ];
    try {
      await persist(nextRows);
      setModalOpen(false);
      onNotify?.(editKey ? "Champ personnalisé mis à jour." : "Champ personnalisé ajouté.");
    } catch {
      // Message déjà remonté dans persist.
    }
  };

  const confirmDeleteVariable = async () => {
    if (!deleteFieldKey) return;
    const nextRows = rows.filter((v) => v.fieldKey !== deleteFieldKey);
    try {
      await persist(nextRows);
      setDeleteFieldKey(null);
      onNotify?.("Variable supprimée.");
    } catch {
      // Message déjà remonté dans persist.
    }
  };

  return (
    <div>
      <div className="row settings-tab-toolbar settings-tab-toolbar--end">
        <div className="row-actions">
          <button
            type="button"
            className="btn-light"
            title="Actualiser"
            aria-label="Actualiser"
            disabled={loading}
            onClick={() => void loadData()}
          >
            <RotateCcw size={16} aria-hidden />
            Actualiser
          </button>
          {canEdit ? (
            <button
              type="button"
              className="mc-btn-primary"
              title="Ajouter une variable"
              disabled={saving}
              onClick={openCreateModal}
            >
              <Plus size={16} aria-hidden />
              Nouvelle variable
            </button>
          ) : null}
        </div>
      </div>
      <div className="table-scroll-x">
        <table className="data-table-fixed">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Variable</th>
              <th>Type</th>
              <th>Portée</th>
              <th>Formulaires</th>
              <th>Saisie</th>
              <th>Profils ronde contractuelle</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="muted">
                  Chargement...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={row.fieldKey}>
                  <td>{row.label}</td>
                  <td>
                    <code>{row.fieldKey}</code>
                  </td>
                  <td>{wordTemplateFieldTypeLabel(row.fieldType)}</td>
                  <td>
                    {(() => {
                      const siteScope = row.assignments.find((a) => a.kind === "SITE");
                      if (siteScope) {
                        const site = sites.find((s) => s.id === siteScope.value);
                        return site ? `Site: ${site.name} (${site.code})` : `Site: ${siteScope.value}`;
                      }
                      const familleScope = row.assignments.find((a) => a.kind === "FAMILLE");
                      if (familleScope) return `Famille: ${familleScope.value}`;
                      return "Tous";
                    })()}
                  </td>
                  <td>
                    {row.assignments
                      .filter((a) => a.kind === "FORM")
                      .map((a) => formTargetLabel[a.value as FormTarget] || a.value)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {formVariableEntryStageLabel(normalizeFormVariableEntryStage(row.entryStage))}
                  </td>
                  <td>
                    {(() => {
                      const profileAssignments = row.assignments.filter((a) => a.kind === "PROFILE");
                      const hasContractuelle = row.assignments.some(
                        (a) => a.kind === "FORM" && a.value === "RONDE_PLANIFIEE"
                      );
                      if (hasContractuelle && profileAssignments.length === 0) {
                        return "Toutes";
                      }
                      return (
                        profileAssignments
                          .map((a) => rondePlannedProfiles.find((p) => p.id === a.value)?.label || a.value)
                          .join(", ") || "—"
                      );
                    })()}
                  </td>
                  <td>
                    {canEdit ? (
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn-light action-icon-btn"
                          title="Modifier"
                          aria-label="Modifier"
                          disabled={saving}
                          onClick={() => openEditModal(row)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-danger action-icon-btn"
                          title="Supprimer"
                          aria-label="Supprimer"
                          disabled={saving}
                          onClick={() => setDeleteFieldKey(row.fieldKey)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="muted">
                  Aucune variable définie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {modalOpen ? (
        <div className="modal-overlay" onClick={requestClose}>
          <section className="modal fransor-help-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editKey ? "Modifier un champ personnalisé" : "Ajouter un champ personnalisé"}</h3>
            <p className="muted">
              Configurez le champ supplémentaire sur le(s) formulaire(s) souhaité(s).
            </p>
            <div className="form">
              <div className="modal-grid-two">
                <label>
                  Libellé
                  <input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="Ex. Référence contrat" />
                </label>
                <label>
                  Placeholder
                  <input value={draftPlaceholder} onChange={(e) => setDraftPlaceholder(e.target.value)} placeholder="Optionnel" />
                </label>
              </div>
              <div className="modal-grid-two">
                <label>
                  Type
                  <select value={draftType} onChange={(e) => setDraftType(e.target.value as FormVariableDef["fieldType"])}>
                    {WORD_TEMPLATE_FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {draftType === "select" ? (
                  <label>
                    Valeurs liste (séparées par virgule)
                    <input value={draftOptions} onChange={(e) => setDraftOptions(e.target.value)} placeholder="A, B, C" />
                  </label>
                ) : (
                  <label>
                    Variable technique
                    <input value={draftFieldKey} disabled />
                  </label>
                )}
              </div>
              <div className="modal-grid-two">
                <label>
                  Portée
                  <select
                    value={draftScopeKind}
                    onChange={(e) => {
                      const next = e.target.value as "ALL" | "SITE" | "FAMILLE";
                      setDraftScopeKind(next);
                      if (next !== "SITE") setDraftScopeSite(null);
                      if (next !== "FAMILLE") setDraftScopeFamille("");
                    }}
                  >
                    <option value="ALL">Tous les sites/familles</option>
                    <option value="SITE">Site</option>
                    <option value="FAMILLE">Famille</option>
                  </select>
                </label>
                {draftScopeKind === "SITE" ? (
                  <label>
                    Site
                    <SiteSearchInput
                      sites={sites}
                      selectedSite={draftScopeSite}
                      onSelectedSiteChange={setDraftScopeSite}
                      copyNotify={onNotify}
                    />
                  </label>
                ) : draftScopeKind === "FAMILLE" ? (
                  <label>
                    Famille
                    <input
                      value={draftScopeFamille}
                      onChange={(e) => setDraftScopeFamille(e.target.value.toUpperCase())}
                      list="variables-familles-list"
                      placeholder="Saisissez au moins 3 caractères"
                    />
                    <datalist id="variables-familles-list">
                      {normalizedScopeFamille.length >= 3
                        ? familles
                            .filter((f) => f.includes(normalizedScopeFamille))
                            .map((f) => <option key={f} value={f} />)
                        : null}
                    </datalist>
                  </label>
                ) : (
                  <label>
                    Cible
                    <input value="Tous" disabled />
                  </label>
                )}
              </div>
              <label>
                Formulaires (choix multiple)
                <div className="settings-variables-checklist">
                  {FORM_TARGET_OPTIONS.map((opt) => (
                    <ToggleSwitch
                      key={opt.value}
                      checked={draftForms.includes(opt.value)}
                      onChange={() =>
                        setDraftForms((prev) => {
                          const next = toggleChoice(prev, opt.value) as FormTarget[];
                          if (opt.value === "RONDE_PLANIFIEE" && !next.includes("RONDE_PLANIFIEE")) {
                            setDraftProfileIds([]);
                          }
                          return next;
                        })
                      }
                      label={opt.label}
                      labelFirst
                    />
                  ))}
                </div>
              </label>
              {draftForms.length ? (
                <label>
                  Moment de saisie
                  <select
                    value={draftEntryStage}
                    onChange={(e) => setDraftEntryStage(normalizeFormVariableEntryStage(e.target.value))}
                  >
                    {FORM_VARIABLE_ENTRY_STAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ display: "block", marginTop: 6, fontWeight: "normal" }}>
                    À la demande : saisi à la création, repris en lecture seule à la clôture. À la clôture : uniquement
                    sur le retour terrain (ou le traitement responsable en main courante).
                  </span>
                </label>
              ) : null}
              <label>
                Profils ronde contractuelle (choix multiple)
                <p className="muted" style={{ marginTop: 6, marginBottom: 8, fontWeight: "normal" }}>
                  {draftForms.includes("RONDE_PLANIFIEE")
                    ? "Sans profil coché, le champ s’applique à toutes les rondes contractuelles. Cochez un ou plusieurs profils pour restreindre."
                    : "Cochez « Ronde contractuelle » ci-dessus pour activer le filtrage par profil."}
                </p>
                <div className="settings-variables-checklist">
                  {rondePlannedProfiles.map((opt) => (
                    <ToggleSwitch
                      key={opt.id}
                      checked={draftProfileIds.includes(opt.id)}
                      disabled={!draftForms.includes("RONDE_PLANIFIEE")}
                      onChange={() => setDraftProfileIds((prev) => toggleChoice(prev, opt.id))}
                      label={opt.label}
                      labelFirst
                    />
                  ))}
                </div>
              </label>
            </div>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={requestClose}>
                Annuler
              </button>
              <button type="button" onClick={() => void saveDraftIntoRows()} disabled={saving}>
                Enregistrer
              </button>
            </div>
            {draftValidationMessage ? (
              <p className="muted" style={{ marginTop: 8 }}>
                {draftValidationMessage}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
      <ConfirmModal
        isOpen={showDiscardConfirm}
        title="Abandonner la saisie ?"
        message="Les informations saisies seront perdues."
        cancelLabel="Rester"
        confirmLabel="Abandonner"
        confirmClassName="btn-danger"
        onCancel={cancelDiscard}
        onConfirm={confirmDiscardAndClose}
      />
      <ConfirmModal
        isOpen={Boolean(deleteFieldKey)}
        title="Supprimer cette variable ?"
        message="La variable sera retirée de la base de données. Cette action est immédiate."
        confirmLabel="Supprimer"
        confirmClassName="btn-danger"
        onCancel={() => setDeleteFieldKey(null)}
        onConfirm={() => void confirmDeleteVariable()}
      />
    </div>
  );
}
