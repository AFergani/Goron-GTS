import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique Paramètres — modèles Word (.docx) et variables de formulaires. */
export function HelpSettingsTemplatesTopic() {
  return (
    <HelpTopicLayout
      title="📄 Modèles et variables"
      purpose="Cet onglet des Paramètres gère les modèles Word d'export et les champs personnalisés des formulaires (interventions, mains courantes, rondes, gardiennages)."
    >
      <ul className="muted help-center-list">
        <li>
          Deux sous-onglets : <strong>Modèles Word</strong> et <strong>Variables</strong>.
        </li>
        <li>
          📄 <strong>Modèles Word</strong> :
          <ul className="muted help-center-list">
            <li>
              Cliquez sur <strong>Remplacer</strong> sur la ligne du flux concerné pour changer le modèle par défaut
              (main courante, intervention, ronde contractuelle) par votre propre fichier .docx.{" "}
              <strong>Rétablir</strong> retire cette copie et revient au modèle embarqué.
            </li>
            <li>
              Utilisez <strong>Nouvelle attribution</strong> pour attribuer un modèle spécifique à un site ou une
              famille de sites (intervention, ronde contractuelle ou exceptionnelle).
            </li>
            <li>
              Cliquez sur l&apos;icône <strong>Variable</strong> d&apos;une ligne pour voir la liste exacte des balises{" "}
              <strong>{"{jeton}"}</strong> à utiliser dans votre .docx.
            </li>
            <li>
              À l&apos;export, l&apos;application choisit le modèle le plus précis disponible : attribution par site,
              puis par famille, puis (pour les rondes) par profil, sinon le modèle par défaut.
            </li>
          </ul>
        </li>
        <li>
          🧩 <strong>Variables</strong> :
          <ul className="muted help-center-list">
            <li>
              Cliquez sur <strong>Nouvelle variable</strong> pour créer un champ personnalisé : libellé, type de saisie,
              portée (site/famille), et formulaires concernés.
            </li>
            <li>
              Choisissez le moment de saisie : <strong>à la demande</strong> (création) ou <strong>à la clôture</strong>{" "}
              (retour terrain).
            </li>
            <li>
              Le nom technique du jeton est figé à la création : il ne change pas même si vous modifiez le libellé
              ensuite.
            </li>
            <li>
              Supprimer une variable ne l&apos;affiche plus sur les futures saisies, mais conserve les données déjà
              enregistrées sur les anciennes fiches.
            </li>
          </ul>
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
