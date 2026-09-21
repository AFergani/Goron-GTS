import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique centre d’aide — module Accompagnement Fransor. */
export function HelpFransorTopic() {
  return (
    <HelpTopicLayout
      title="📅 Accompagnement Fransor"
      purpose="Ce module trace, jour par jour, les ouvertures et fermetures réalisées pour le client Fransor, afin de préparer la facturation mensuelle."
    >
      <ul className="muted help-center-list">
        <li>
          Cliquez sur une date du calendrier (ou utilisez la ligne <strong>Journée</strong> pour le jour même) pour
          saisir qui a fait l&apos;ouverture et/ou la fermeture. Les badges <strong>O</strong> et <strong>F</strong>{" "}
          passent au 🟢 vert dès qu&apos;une action est enregistrée.
        </li>
        <li>
          Par défaut, seuls les <strong>jours ouvrés</strong> (lundi-vendredi) attendent une action ; les week-ends et
          jours fériés n&apos;en demandent aucune.
        </li>
        <li>
          Pour gérer une exception (congés, fermeture annuelle, astreinte un jour férié...), utilisez{" "}
          <strong>Périodes exceptionnelles</strong> — une aide rapide y est directement intégrée pour créer, modifier
          ou supprimer une période.
        </li>
        <li>
          📊 Le tableau <strong>Récap mensuel</strong> compile automatiquement le nombre d&apos;ouvertures/fermetures
          par responsable. Utilisez <strong>Copier le récap</strong> pour transmettre la synthèse (email, message).
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
