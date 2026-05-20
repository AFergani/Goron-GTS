import { useId, type ReactNode } from "react";

type CreateFormSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  /** Action alignée à droite du titre (ex. bouton + ajouter une ligne). */
  headerAction?: ReactNode;
};

/**
 * En-tête de bloc réutilisable pour les formulaires de création (main courante, ronde, intervention).
 */
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
