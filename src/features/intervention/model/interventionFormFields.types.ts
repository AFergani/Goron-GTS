/**
 * Définition d'un champ complémentaire Word (variables FORM=INTERVENTION).
 */

export type InterventionFormFieldDef = {
  id: string;
  sortOrder: number;
  fieldKey: string;
  label: string;
  fieldType: "text" | "textarea" | "number" | "time" | "select" | "toggle";
  placeholder: string;
  options: string[];
  createdAt: string;
  updatedAt: string;
};
