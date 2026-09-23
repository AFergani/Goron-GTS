import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique centre d’aide — module Gardiennage. */
export function HelpGardiennageTopic() {
  return (
    <HelpTopicLayout
      title="🛡️ Gardiennage"
      purpose="Ce module planifie et suit une présence physique sur un site, ponctuelle ou récurrente."
    >
      <ul className="muted help-center-list">
        <li>
          Cliquez sur <strong>Nouveau gardiennage</strong> et renseignez le site, le prestataire et la planification.
          Une seule création couvre toute la prestation, quelle que soit sa durée.
        </li>
        <li>
          Trois modes de planification (<strong>un seul actif</strong> par demande) :
          <ul className="muted help-center-list">
            <li>
              <strong>Journée unique</strong> : prestation isolée sur une seule date.
            </li>
            <li>
              <strong>H24</strong> : présence continue sur une période donnée (avec ou sans date de fin).
            </li>
            <li>
              <strong>Planification libre</strong> : rythme récurrent sur plusieurs semaines/mois, défini par lignes
              d&apos;horaires et de jours.
            </li>
          </ul>
        </li>
        <li>
          Le <strong>nom du client</strong> est facultatif. S&apos;il est renseigné, la demande le cite. S&apos;il reste
          vide, la demande est une <strong>demande télésurveillance</strong>.
        </li>
        <li>
          Utilisez le champ <strong>Consigne</strong> pour transmettre les infos utiles à l&apos;agent (accès, contacts,
          particularités du site).
        </li>
        <li>
          🔗 Depuis une intervention ou une ronde en cours, créez un <strong>gardiennage lié</strong> pour reprendre
          automatiquement le site et le contexte. La liste affiche alors un badge <strong>Suite inter</strong> ou{" "}
          <strong>Suite ronde</strong>.
        </li>
        <li>
          Une fiche ne peut être clôturée qu&apos;une fois sa <strong>date/heure de fin</strong> passée. Sans clôture
          manuelle, elle se clôture automatiquement <strong>3 jours</strong> après la fin prévue.
        </li>
        <li>
          <strong>Voir le détail</strong> d&apos;une fiche clôturée ou annulée est en lecture seule.{" "}
          <strong>Rouvrir</strong> conserve le compte-rendu déjà saisi, pour le compléter puis reclôturer.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
