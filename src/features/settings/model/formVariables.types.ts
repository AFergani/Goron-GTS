/**
 * Variables de formulaire configurables (cibles ronde, intervention, gardiennage, etc.).
 */

import type { RondeClosureFieldType } from "../../rondes/model/rondePlanned.types";

export type FormTarget = "RONDE_PLANIFIEE" | "RONDE_EXCEPTIONNELLE" | "INTERVENTION" | "MAIN_COURANTE" | "GARDIENNAGE";
export type VariableAssignmentKind = "FORM" | "PROFILE" | "TEMPLATE" | "SITE" | "FAMILLE";

export type FormVariableAssignment = {
  kind: VariableAssignmentKind;
  value: string;
};

export type FormVariableDef = {
  id: string;
  sortOrder: number;
  fieldKey: string;
  label: string;
  fieldType: RondeClosureFieldType;
  placeholder: string;
  required: boolean;
  options: string[];
  assignments: FormVariableAssignment[];
  createdAt: string;
  updatedAt: string;
};

export type FormVariablePayload = {
  fieldKey: string;
  label: string;
  fieldType: RondeClosureFieldType;
  placeholder: string;
  required: boolean;
  options: string[];
  assignments: FormVariableAssignment[];
};
