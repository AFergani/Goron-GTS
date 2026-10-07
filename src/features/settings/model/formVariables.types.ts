/**
 * Variables de formulaire configurables (cibles ronde, intervention, gardiennage, etc.).
 */

import type { RondeClosureFieldType } from "../../rondes/model/rondePlanned.types";

/** Type d’une variable de formulaire, y compris la case à cocher. */
export type FormVariableFieldType = RondeClosureFieldType | "checkbox";

export type FormTarget = "RONDE_PLANIFIEE" | "RONDE_EXCEPTIONNELLE" | "INTERVENTION" | "MAIN_COURANTE" | "GARDIENNAGE";
export type VariableAssignmentKind = "FORM" | "PROFILE" | "TEMPLATE" | "SITE" | "FAMILLE";
/** Moment de saisie (demande vs clôture). Défaut clôture. */
export type FormVariableEntryStage = "REQUEST" | "CLOSURE";

export const FORM_VARIABLE_ENTRY_STAGE_OPTIONS: Array<{ value: FormVariableEntryStage; label: string }> = [
  { value: "CLOSURE", label: "À la clôture" },
  { value: "REQUEST", label: "À la demande" }
];

export function formVariableEntryStageLabel(stage: FormVariableEntryStage): string {
  return FORM_VARIABLE_ENTRY_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage;
}

export function normalizeFormVariableEntryStage(raw: unknown): FormVariableEntryStage {
  return String(raw || "").trim().toUpperCase() === "REQUEST" ? "REQUEST" : "CLOSURE";
}

export type FormVariableAssignment = {
  kind: VariableAssignmentKind;
  value: string;
};

export type FormVariableDef = {
  id: string;
  sortOrder: number;
  fieldKey: string;
  label: string;
  fieldType: FormVariableFieldType;
  placeholder: string;
  required: boolean;
  options: string[];
  assignments: FormVariableAssignment[];
  /** Demande (création) ou clôture (retour terrain / traitement responsable). */
  entryStage: FormVariableEntryStage;
  createdAt: string;
  updatedAt: string;
};

export type FormVariablePayload = {
  fieldKey: string;
  label: string;
  fieldType: FormVariableFieldType;
  placeholder: string;
  required: boolean;
  options: string[];
  assignments: FormVariableAssignment[];
  entryStage?: FormVariableEntryStage;
};

/** Suppression tracée : le motif est obligatoire, comme pour les autres référentiels. */
export type FormVariableDeletion = {
  fieldKey: string;
  reason: string;
};
