/**
 * Types modèles Word (builtin/custom, chemins d’installation).
 */

/** Flux métier pouvant recevoir un modèle Word personnalisé (site / famille). */
export type TemplateFlowKind = "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE";

export type DocumentTemplateListItem = {
  kind: "builtin" | "custom";
  templateKey: string;
  title: string;
  fileName: string;
  helpId: string;
  resolvedPath: string | null;
  exists: boolean;
  /** Copie locale qui masque le modèle embarqué. */
  overridden?: boolean;
  targetInstallPath: string | null;
};
