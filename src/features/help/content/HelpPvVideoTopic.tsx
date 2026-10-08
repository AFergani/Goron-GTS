import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique PV Vidéo : fiche de raccordement par site. */
export function HelpPvVideoTopic() {
  return (
    <HelpTopicLayout
      title="📷 PV Vidéo"
      purpose="Cette page prépare la fiche de prise en compte d'une levée de doute vidéo pour un site du référentiel. L'export Word reprend les champs et la photo."
    >
      <ul className="muted help-center-list">
        <li>Choisissez le site en haut de page. Le nom et l&apos;adresse viennent du référentiel.</li>
        <li>
          Le responsable TLS est prérempli avec le profil connecté. Il reste modifiable. Les autres champs se
          saisissent à la main.
        </li>
        <li>
          Le numéro de chaque caméra suit l&apos;ordre des lignes, de 1 jusqu&apos;à la dernière. L&apos;intitulé et
          l&apos;information sont en majuscules. Chaque case Information accepte un texte, un collage ou un fichier.
          Cochez les lignes à retirer, puis la
          poubelle à côté d&apos;Ajouter. Le cadre « Capture globale » en bas de fiche est la photo d&apos;ensemble du
          site. Un responsable doit d&apos;abord indiquer le dossier partagé des photos.
        </li>
        <li>
          Le login et le mot de passe sont chiffrés en base. Ils restent lisibles sur cette page et dans
          l&apos;export Word. L&apos;export remplit le modèle PV Vidéo (Paramètres, modèles documentaires). Le bouton
          Ouvrir lance ce fichier pendant 20 secondes après l&apos;export. Une copie de secours est aussi déposée dans
          le dossier des photos du site.
        </li>
        <li>
          La page est visible pour l&apos;Admin, les responsables (superviseur, responsable de station, directeur) et
          les opérateurs au profil <strong>Opérateur +</strong>.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
