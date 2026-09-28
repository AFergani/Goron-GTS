import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique Remarques vidéo : générateur HTML local. */
export function HelpVideoRemarksTopic() {
  return (
    <HelpTopicLayout
      title="🎬 Remarques vidéo"
      purpose="Cette page prépare le HTML d'une remarque vidéo, à copier dans l'interface de télésurveillance. Le brouillon reste sur le poste. Sauvegarder enregistre un instantané en base, lié à un site, pour le reprendre ailleurs."
    >
      <ul className="muted help-center-list">
        <li>
          Renseignez les liens, les sections et les champs. L&apos;aperçu et le HTML se mettent à jour au fil de la
          saisie.
        </li>
        <li>
          <strong>Copier le HTML</strong> place le résultat dans le presse-papiers. L&apos;image d&apos;alarme garde le
          chemin de l&apos;autre interface (<code>jsp/bandeau/themes/default/alarme/images/bandeau/alarme_orange.png</code>
          ).
        </li>
        <li>
          Choisissez un site du référentiel, puis <strong>Sauvegarder</strong>. Sans site, l&apos;enregistrement est
          refusé. Rouvrir le même site recharge la dernière sauvegarde.
        </li>
        <li>
          <strong>Exporter</strong> et <strong>Charger</strong> gardent un fichier JSON. <strong>Réinitialiser</strong>{" "}
          revient au modèle vide, en conservant le site choisi.
        </li>
        <li>
          La page est visible pour l&apos;Admin, les responsables, et les opérateurs au profil{" "}
          <strong>Opérateur +</strong>.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
