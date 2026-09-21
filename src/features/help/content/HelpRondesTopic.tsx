import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique centre d’aide — module Rondes. */
export function HelpRondesTopic() {
  return (
    <HelpTopicLayout
      title="🔄 Rondes"
      purpose="Ce module organise et suit les passages des agents sur les sites, qu'ils soient récurrents (contrat) ou ponctuels (demande exceptionnelle)."
    >
      <ul className="muted help-center-list">
        <li>
          Deux onglets : <strong>Ronde contractuelle</strong> (passages récurrents, ex. ouvertures/fermetures
          quotidiennes) et <strong>Ronde exceptionnelle</strong> (besoin ponctuel : demande client par mail/appel, ou
          suite à une intervention).
        </li>
        <li>
          Deux affichages : <strong>Journée</strong> (créneaux/fiches du jour à traiter) et <strong>Liste</strong>{" "}
          (historique, filtres, export Excel).
        </li>
        <li>
          <strong>Contractuelle</strong> : cliquez sur <strong>Nouvelle planification</strong> pour définir une règle
          récurrente (site, prestataire, horaires, jours). Les fiches du jour sont ensuite matérialisées depuis la vue
          journée. Le <strong>compte-rendu est obligatoire</strong> pour clôturer ; aucune clôture automatique.
        </li>
        <li>
          <strong>Exceptionnelle</strong> : cliquez sur <strong>Nouvelle ronde</strong>, renseignez la période{" "}
          <strong>Du / Au</strong> et les horaires attendus. La validation génère immédiatement toutes les fiches du
          lot. Le retour terrain (heures, compte-rendu) est facultatif ; ⏱️ une fiche non traitée après{" "}
          <strong>3 jours</strong> se clôture automatiquement.
        </li>
        <li>
          🔗 Depuis une intervention en cours, créez une <strong>ronde liée</strong> en un clic pour reprendre
          automatiquement le site et le contexte.
        </li>
        <li>
          Utilisez <strong>Rouvrir</strong> sur une fiche clôturée pour la modifier à nouveau.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
