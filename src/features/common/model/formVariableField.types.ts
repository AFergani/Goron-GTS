/**
 * Champ personnalisé déjà filtré pour un formulaire métier (saisie UI).
 */

import type { FormVariableEntryStage, FormVariableFieldType } from "../../settings/model/formVariables.types";

export type FormVariableFieldDef = {
  id: string;
  sortOrder: number;
  fieldKey: string;
  label: string;
  fieldType: FormVariableFieldType;
  placeholder: string;
  options: string[];
  entryStage: FormVariableEntryStage;
  createdAt: string;
  updatedAt: string;
};

export function splitFormVariableDefs(defs: FormVariableFieldDef[]): {
  requestDefs: FormVariableFieldDef[];
  closureDefs: FormVariableFieldDef[];
} {
  return {
    requestDefs: defs.filter((def) => def.entryStage === "REQUEST"),
    closureDefs: defs.filter((def) => def.entryStage !== "REQUEST")
  };
}
