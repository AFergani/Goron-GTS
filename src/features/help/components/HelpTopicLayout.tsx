/**
 * Gabarit commun des rubriques d’aide : titre, « À quoi ça sert ? », « Comment l’utiliser ? ».
 *
 * Utilisé par toutes les pages `Help*Topic` du centre d’aide.
 */

import type { ReactNode } from "react";

type HelpTopicLayoutProps = {
  title: string;
  purpose: ReactNode;
  /** Titre de la seconde carte. Défaut : « Comment l'utiliser ? ». */
  usageTitle?: string;
  children: ReactNode;
};

/**
 * Structure visuelle unique des onglets d’aide (cartes titre / usage).
 *
 * @param props.title - Titre affiché (emoji + libellé).
 * @param props.purpose - Texte de la carte « À quoi ça sert ? ».
 * @param props.children - Contenu de la carte « Comment l’utiliser ? » (liste, éventuellement un paragraphe).
 */
export function HelpTopicLayout({ title, purpose, usageTitle = "Comment l'utiliser ?", children }: HelpTopicLayoutProps) {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">{title}</h2>
      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">À quoi ça sert ?</h3>
        <p className="muted">{purpose}</p>
      </div>
      <div className="help-center-card">
        <h3 className="help-center-card-title">{usageTitle}</h3>
        {children}
      </div>
    </article>
  );
}
