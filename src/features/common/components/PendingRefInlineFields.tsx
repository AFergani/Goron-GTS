/**
 * Formulaires inline « À créer ? » (site code + nom, prestataire nom).
 *
 * Fournis aux `pendingSiteForm` / `pendingIntervenantForm` de `SiteSearchInput`
 * et `IntervenantSearchInput` (main courante, interventions, rondes, gardiennage).
 */

type PendingSiteInlineFieldsProps = {
  code: string;
  name: string;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Deux champs pour proposer un site hors référentiel.
 *
 * @param props.code - Code saisi
 * @param props.name - Nom saisi
 * @param props.onCodeChange - Mise à jour du code
 * @param props.onNameChange - Mise à jour du nom
 * @param props.disabled - Lecture seule
 */
export function PendingSiteInlineFields({
  code,
  name,
  onCodeChange,
  onNameChange,
  disabled
}: PendingSiteInlineFieldsProps) {
  return (
    <div className="mc-form-grid mc-form-grid-main">
      <label className="mc-field">
        <span>Nouveau code site</span>
        <input value={code} onChange={(e) => onCodeChange(e.target.value)} disabled={disabled} />
      </label>
      <label className="mc-field">
        <span>Nouveau nom de site</span>
        <input value={name} onChange={(e) => onNameChange(e.target.value)} disabled={disabled} />
      </label>
    </div>
  );
}

type PendingIntervenantInlineFieldProps = {
  name: string;
  onNameChange: (value: string) => void;
  /** Libellé du champ (prestataire vs intervenant selon l’écran). */
  label?: string;
  disabled?: boolean;
};

/**
 * Un champ pour proposer un prestataire hors référentiel.
 *
 * @param props.name - Nom saisi
 * @param props.onNameChange - Mise à jour du nom
 * @param props.label - Libellé affiché
 * @param props.disabled - Lecture seule
 */
export function PendingIntervenantInlineField({
  name,
  onNameChange,
  label = "Nouveau prestataire",
  disabled
}: PendingIntervenantInlineFieldProps) {
  return (
    <div className="mc-form-grid mc-form-grid-main">
      <label className="mc-field mc-field-full">
        <span>{label}</span>
        <input value={name} onChange={(e) => onNameChange(e.target.value)} disabled={disabled} />
      </label>
    </div>
  );
}
