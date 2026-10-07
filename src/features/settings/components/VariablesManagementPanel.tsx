/**
 * Panneau variables de formulaire (affectations site/famille/profil, types de champs).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { Role, SiteRef } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { RondePlannedProfileRef } from "../../rondes/model/rondePlanned.types";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { FamilleSearchInput } from "../../common/components/FamilleSearchInput";
import { SiteSearchInput } from "../../common/components/SiteSearchInput";
import {
  FORM_VARIABLE_ENTRY_STAGE_OPTIONS,
  formVariableEntryStageLabel,
  normalizeFormVariableEntryStage,
  type FormTarget,
  type FormVariableDef,
  type FormVariableDeletion,
  type FormVariableEntryStage,
  type FormVariablePayload
} from "../model/formVariables.types";
import { WORD_TEMPLATE_FIELD_TYPES, labelToFieldKey, wordTemplateFieldTypeLabel } from "../model/wordTemplateFieldTypes";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { DOCX_VARIABLE_GROUPS, systemDocxVariableTypeLabel, type DocxVariableGroup } from "./documentTemplateHelpContent";

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

function docxToken(fieldKey: string): string {
  const key = String(fieldKey || "").trim();
  if (!key) return "";
  return key.startsWith("{") ? key : `{${key}}`;
}

function scopeLabel(row: FormVariableDef, sites: SiteRef[]): string {
  const siteScope = row.assignments.find((assignment) => assignment.kind === "SITE");
  if (siteScope) {
    const site = sites.find((item) => item.id === siteScope.value);
    return site ? `Site: ${site.name} (${site.code})` : `Site: ${siteScope.value}`;
  }
  const familleScope = row.assignments.find((assignment) => assignment.kind === "FAMILLE");
  if (familleScope) return `Famille: ${familleScope.value}`;
  return "Tous";
}

function profilesLabel(row: FormVariableDef, profiles: RondePlannedProfileRef[]): string {
  const profileAssignments = row.assignments.filter((assignment) => assignment.kind === "PROFILE");
  const hasContractuelle = row.assignments.some(
    (assignment) => assignment.kind === "FORM" && assignment.value === "RONDE_PLANIFIEE"
  );
  if (hasContractuelle && profileAssignments.length === 0) return "Toutes";
  return (
    profileAssignments
      .map((assignment) => profiles.find((profile) => profile.id === assignment.value)?.label || assignment.value)
      .join(", ") || "—"
  );
}

function customRowsForGroup(rows: FormVariableDef[], group: DocxVariableGroup): FormVariableDef[] {
  if (!group.formTarget) return [];
  const formTarget = group.formTarget;
  return rows.filter((row) =>
    row.assignments.some((assignment) => assignment.kind === "FORM" && assignment.value === formTarget)
  );
}

function VariableTokenButton({ token, onCopy }: { token: string; onCopy: (token: string) => void }) {
  if (!token) return null;
  return (
    <button
      type="button"
      className="variables-token-copy"
      title="Copier la variable"
      aria-label={`Copier ${token}`}
      onClick={() => onCopy(token)}
    >
      <code>{token}</code>
    </button>
  );
}

function RecapHead({ showProfiles }: { showProfiles: boolean }) {
  return (
    <thead>
      <tr>
        <th>Libellé</th>
        <th>Variable</th>
        <th>Type</th>
        <th>Portée</th>
        <th>Saisie</th>
        {showProfiles ? <th>Profils ronde contractuelle</th> : null}
        <th>Actions</th>
      </tr>
    </thead>
  );
}

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
  const [duplicateSourceKey, setDuplicateSourceKey] = useState<string | null>(null);
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
  const [deleteReason, setDeleteReason] = useState("");
  const [draftOpenTick, setDraftOpenTick] = useState(0);
  const [draftBaseline, setDraftBaseline] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DOCX_VARIABLE_GROUPS.map((group) => [group.id, !group.collapsedByDefault]))
  );
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
    async (nextRows: FormVariableDef[], deletions?: FormVariableDeletion[]) => {
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
          variables: payload,
          deletions
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

  const fillDraftFromRow = (row: FormVariableDef) => {
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
  };

  const openCreateModal = () => {
    setEditKey(null);
    setDuplicateSourceKey(null);
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
    setDuplicateSourceKey(null);
    fillDraftFromRow(row);
    setModalOpen(true);
    setDraftOpenTick((tick) => tick + 1);
  };

  const openDuplicateModal = (row: FormVariableDef) => {
    setEditKey(null);
    setDuplicateSourceKey(row.fieldKey);
    fillDraftFromRow(row);
    setModalOpen(true);
    setDraftOpenTick((tick) => tick + 1);
  };

  const draftFieldKey = editKey ? editKey : labelToFieldKey(draftLabel);
  const technicalKeyTaken =
    !editKey && Boolean(draftFieldKey) && rows.some((row) => row.fieldKey === draftFieldKey);
  const draftCanSubmit = Boolean(draftLabel.trim() && draftFieldKey && draftForms.length >= 1 && !technicalKeyTaken);
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
    onClose: () => {
      setModalOpen(false);
      setDuplicateSourceKey(null);
    }
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
      : technicalKeyTaken
        ? duplicateSourceKey && draftFieldKey === duplicateSourceKey
          ? "Changez le libellé : il produit la même variable technique que la variable d’origine."
          : "Cette variable technique existe déjà. Modifiez le libellé."
      : draftForms.length < 1
        ? "Sélectionnez au moins un formulaire cible."
        : scopeValidationMessage
          ? scopeValidationMessage
        : "";

  const toggleChoice = (current: string[], value: string): string[] =>
    current.includes(value) ? current.filter((x) => x !== value) : [...current, value];

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
                  entryStage: draftEntryStage,
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
              entryStage: draftEntryStage,
              createdAt: now,
              updatedAt: now
            }
          ];
    try {
      await persist(nextRows);
      setModalOpen(false);
      setDuplicateSourceKey(null);
      onNotify?.(
        editKey
          ? "Champ personnalisé mis à jour."
          : duplicateSourceKey
            ? "Champ personnalisé dupliqué."
            : "Champ personnalisé ajouté."
      );
    } catch {
      // Message déjà remonté dans persist.
    }
  };

  const copyVariableToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      onNotify?.("Variable copiée.");
    } catch {
      onNotify?.("Impossible de copier la variable.");
    }
  };

  const confirmDeleteVariable = async () => {
    const reason = deleteReason.trim();
    if (!deleteFieldKey || !reason) {
      onNotify?.("Le motif de suppression est obligatoire.");
      return;
    }
    const nextRows = rows.filter((v) => v.fieldKey !== deleteFieldKey);
    try {
      await persist(nextRows, [{ fieldKey: deleteFieldKey, reason }]);
      setDeleteFieldKey(null);
      setDeleteReason("");
      onNotify?.("Variable supprimée.");
    } catch {
      // Message déjà remonté dans persist.
    }
  };

  return (
    <div className="variables-management-panel">
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
      <p className="muted variables-management-panel__intro">
        Cliquez une variable pour copier le jeton Word. Les variables système se remplissent toutes seules : elles ne se modifient pas.
      </p>
      {DOCX_VARIABLE_GROUPS.map((group) => {
        const customRows = customRowsForGroup(rows, group);
        const count = group.systemVariables.length + (loading ? 0 : customRows.length);
        const showProfiles = group.id === "ronde-planifiee";
        const columnCount = showProfiles ? 7 : 6;
        return (
          <details
            key={group.id}
            className="variables-group"
            open={openGroups[group.id]}
            onToggle={(event) => {
              const next = event.currentTarget.open;
              setOpenGroups((prev) => (prev[group.id] === next ? prev : { ...prev, [group.id]: next }));
            }}
          >
            <summary>
              <span>{group.title}</span>
              <span className="muted variables-group__count">{count}</span>
            </summary>
            <p className="muted variables-group__hint">{group.hint}</p>
            <div className="table-scroll-x">
              <table className="data-table-fixed">
                <RecapHead showProfiles={showProfiles} />
                <tbody>
                  {group.systemVariables.map((variable) => (
                    <tr key={`${group.id}-${variable.token}`}>
                      <td>{variable.description}</td>
                      <td>
                        <VariableTokenButton token={variable.token} onCopy={(token) => void copyVariableToken(token)} />
                      </td>
                      <td>{systemDocxVariableTypeLabel(variable.token, group.formTarget)}</td>
                      <td>{group.formTarget ? "Tous" : "Tous les exports Word"}</td>
                      <td>Automatique</td>
                      {showProfiles ? <td>Toutes</td> : null}
                      <td>
                        <span className="muted" title="Variable système : non modifiable ni supprimable">
                          Variable système
                        </span>
                      </td>
                    </tr>
                  ))}
                  {loading && group.formTarget ? (
                    <tr>
                      <td colSpan={columnCount} className="muted">
                        Chargement des variables personnalisées…
                      </td>
                    </tr>
                  ) : (
                    customRows.map((row) => (
                      <tr key={`${group.id}-${row.fieldKey}`}>
                        <td>{row.label}</td>
                        <td>
                          <VariableTokenButton
                            token={docxToken(row.fieldKey)}
                            onCopy={(token) => void copyVariableToken(token)}
                          />
                        </td>
                        <td>{wordTemplateFieldTypeLabel(row.fieldType)}</td>
                        <td>{scopeLabel(row, sites)}</td>
                        <td>{formVariableEntryStageLabel(normalizeFormVariableEntryStage(row.entryStage))}</td>
                        {showProfiles ? <td>{profilesLabel(row, rondePlannedProfiles)}</td> : null}
                        <td>
                          {canEdit ? (
                            <div className="row-actions table-row-actions table-row-actions--text">
                              <button
                                type="button"
                                className="table-action-btn table-action-btn--text"
                                disabled={saving}
                                onClick={() => openEditModal(row)}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="table-action-btn table-action-btn--text"
                                disabled={saving}
                                onClick={() => openDuplicateModal(row)}
                              >
                                Dupliquer
                              </button>
                              <button
                                type="button"
                                className="table-action-btn table-action-btn--text table-action-btn--danger"
                                disabled={saving}
                                onClick={() => {
                                  setDeleteReason("");
                                  setDeleteFieldKey(row.fieldKey);
                                }}
                              >
                                Supprimer
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                  {!loading && !group.systemVariables.length && !customRows.length ? (
                    <tr>
                      <td colSpan={columnCount} className="muted">
                        Aucune variable pour ce formulaire.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
      {modalOpen ? (
        <div className="modal-overlay" onClick={requestClose}>
          <section className="modal fransor-help-modal variables-field-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {editKey
                ? "Modifier un champ personnalisé"
                : duplicateSourceKey
                  ? "Dupliquer un champ personnalisé"
                  : "Ajouter un champ personnalisé"}
            </h3>
            <p className="muted">
              {duplicateSourceKey
                ? "Les réglages sont repris. Changez le libellé : la variable technique se met à jour et doit rester unique."
                : "Configurez le champ supplémentaire sur le(s) formulaire(s) souhaité(s)."}
            </p>
            <div className="form">
              <div className="modal-grid-two">
                <label>
                  Libellé
                  <input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="Ex. Libellé exemple" />
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
                <label>
                  Variable technique
                  <input value={draftFieldKey} disabled />
                </label>
              </div>
              {draftType === "select" ? (
                <label>
                  Valeurs liste (séparées par virgule)
                  <input value={draftOptions} onChange={(e) => setDraftOptions(e.target.value)} placeholder="A, B, C" />
                </label>
              ) : null}
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
                  <SiteSearchInput
                    sites={sites}
                    selectedSite={draftScopeSite}
                    onSelectedSiteChange={setDraftScopeSite}
                    copyNotify={onNotify}
                  />
                ) : draftScopeKind === "FAMILLE" ? (
                  <FamilleSearchInput familles={familles} value={draftScopeFamille} onChange={setDraftScopeFamille} />
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
                </label>
              ) : null}
              <label>
                Profils ronde contractuelle
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
                Fermer
              </button>
              <button type="button" onClick={() => void saveDraftIntoRows()} disabled={saving || !draftCanSubmit}>
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
      <DiscardConfirmModal
        isOpen={showDiscardConfirm}
        onCancel={cancelDiscard}
        onConfirm={confirmDiscardAndClose}
      />
      <ConfirmModal
        isOpen={Boolean(deleteFieldKey)}
        title="Motif de suppression"
        message={
          deleteFieldKey
            ? `Motif obligatoire - ${rows.find((row) => row.fieldKey === deleteFieldKey)?.label || deleteFieldKey}`
            : "Motif obligatoire"
        }
        confirmLabel="Confirmer suppression"
        confirmClassName="btn-danger"
        confirmDisabled={saving || !deleteReason.trim()}
        onCancel={() => {
          setDeleteFieldKey(null);
          setDeleteReason("");
        }}
        onConfirm={() => void confirmDeleteVariable()}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
            Motif (obligatoire) <span className="text-error">*</span>
          </span>
          <textarea
            className="mc-textarea"
            rows={2}
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="Ex. Motif exemple"
            autoFocus
          />
        </label>
      </ConfirmModal>
    </div>
  );
}
