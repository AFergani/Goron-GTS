/**
 * Types modèles Word (builtin/custom, champs intervention, chemins d’installation).
 */

import type { RondeClosureFieldType } from "../../rondes/model/rondePlanned.types";

/** Flux métier pouvant recevoir un modèle Word personnalisé (site / famille). */
export type TemplateFlowKind = "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";

export type DocumentTemplateListItem = {
  kind: "builtin" | "custom";
  templateKey: string;
  title: string;
  fileName: string;
  helpId: string;
  resolvedPath: string | null;
  exists: boolean;
  targetInstallPath: string | null;
};

export type InterventionWordExtraFieldDef = {
  id: string;
  sortOrder: number;
  fieldKey: string;
  label: string;
  fieldType: RondeClosureFieldType;
  placeholder: string;
  options: string[];
  createdAt: string;
  updatedAt: string;
};
