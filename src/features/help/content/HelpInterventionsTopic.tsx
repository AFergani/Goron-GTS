import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique centre d’aide — module Interventions. */
export function HelpInterventionsTopic() {
  return (
    <HelpTopicLayout
      title="📋 Interventions"
      purpose="Ce module suit une mission terrain de la demande initiale jusqu'à sa clôture."
    >
      <ul className="muted help-center-list">
        <li>
          Cliquez sur <strong>Nouvelle intervention</strong> et renseignez le site, le prestataire, la date/heure et le
          motif.
        </li>
        <li>
          Si un site ou un prestataire n&apos;existe pas encore, utilisez le bouton <strong>À créer ?</strong> à côté du
          champ concerné.
        </li>
        <li>
          Un <strong>numéro de fiche</strong> (ex. 21092026-01) est attribué automatiquement à la création.
        </li>
        <li>
          Ouvrez une fiche pour saisir le retour terrain : heures d&apos;arrivée/départ, compte-rendu, et n° de bon si
          disponible.
        </li>
        <li>
          Pour clôturer, les <strong>heures d&apos;arrivée/départ</strong> et le <strong>compte-rendu</strong> sont
          obligatoires (le n° de bon reste optionnel). Une fiche clôturée passe en lecture seule ; utilisez{" "}
          <strong>Rouvrir</strong> pour la modifier à nouveau.
        </li>
        <li>
          🔗 Depuis une intervention en cours, vous pouvez créer une <strong>ronde</strong> ou un{" "}
          <strong>gardiennage lié</strong> en un clic.
        </li>
        <li>
          📄 Depuis le pied de fenêtre du rapport, <strong>Enregistrer Word</strong> et <strong>Ouvrir le Word</strong>{" "}
          génèrent un rapport basé sur vos modèles, utile pour les sites qui demandent un compte-rendu formel.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
