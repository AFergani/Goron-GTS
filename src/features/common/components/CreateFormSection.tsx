/**
 * Section de formulaire avec titre (h4) et corps, pour modales de création / édition longues.
 *
 * Structure accessible (`aria-labelledby`), action optionnelle à droite du titre
 * (ex. « Ajouter une ligne »). Utilisé par main courante, intervention, ronde,
 * gardiennage et l’éditeur de champs de clôture ronde.
 */

import { useId, type ReactNode } from "react";

type CreateFormSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  /** Action alignée à droite du titre (ex. bouton + ajouter une ligne). */
  headerAction?: ReactNode;
};

/** Bloc titre + contenu dans une modale métier (classe CSS `create-form-section`). */
export function CreateFormSection({ title, children, className, headerAction }: CreateFormSectionProps) {
  const headingId = useId();
  return (
    <section
      className={["create-form-section", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <div className="create-form-section-head">
        <h4 className="create-form-section-title" id={headingId}>
          {title}
        </h4>
        {headerAction ? <div className="create-form-section-head-action">{headerAction}</div> : null}
      </div>
      <div className="create-form-section-body">{children}</div>
    </section>
  );
}
