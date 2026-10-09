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
          saisissent à la main. Sous « Méthode de connexion aux vidéos », le logiciel est toujours saisi. L&apos;interrupteur
          VPN affiche, à côté, le champ VPN.
        </li>
        <li>
          Le numéro de chaque caméra suit l&apos;ordre des lignes, de 1 jusqu&apos;à la dernière. L&apos;intitulé et
          l&apos;information sont en majuscules. Chaque case Information accepte un texte, un collage ou un fichier.
          Cochez les lignes à retirer, puis la poubelle à côté d&apos;Ajouter 1 ligne. Le nombre à gauche de ce bouton
          crée plusieurs lignes d&apos;un coup, jusqu&apos;à 80 caméras. Si une photo manque, la flèche vers le bas
          décale les photos suivantes : les noms restent en place. Une photo peut aussi être glissée sur une autre
          ligne. Enregistrer réécrit chaque photo sous le nom de la caméra de sa ligne et remplace l&apos;ancien
          fichier : un second numéro devenu inutile est retiré. Réinitialiser, à côté d&apos;Enregistrer, vide
          la fiche pour la ressaisir. Les versions datées gardent les textes ; les photos du dossier sont celles
          du dernier enregistrement. Importer les photos prend un lot nommé 01, 02…
          et global : chaque numéro remplit la ligne correspondante, et global remplit la capture globale. Les noms
          déjà saisis restent. Le cadre « Capture globale » en bas de fiche est la photo d&apos;ensemble du
          site. Dans l&apos;export, elle occupe seule la dernière page, au centre. Un responsable doit d&apos;abord indiquer le dossier partagé des photos.
        </li>
        <li>
          Le login et le mot de passe sont chiffrés en base. Ils restent lisibles sur cette page et dans
          l&apos;export Word, précédés de « Login : » et « Mot de passe : ». Le logiciel est précédé de
          « Logiciel : », et le VPN de « VPN : » lorsque son nom est renseigné. L&apos;export remplit le modèle PV Vidéo (Paramètres, modèles documentaires). Le tableau de
          connexion y indique le nombre de caméras, repris du nombre de lignes du listing. Le bouton
          Ouvrir lance ce fichier pendant 20 secondes après l&apos;export. Une copie de secours est aussi déposée dans
          le dossier des photos du site. Chaque enregistrement y ajoute une version datée : Recharger la remet dans
          la fiche, et Enregistrer la reprend comme fiche en cours.
        </li>
        <li>
          La page est visible pour l&apos;Admin, les responsables (superviseur, responsable de station, directeur) et
          les opérateurs au profil <strong>Opérateur +</strong>.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
