import type { HelpTopicId } from "../model/helpTopics";

const TITLES: Partial<Record<HelpTopicId, string>> = {
  interventions: "Interventions",
  rondes: "Rondes",
  gardiennage: "Gardiennage",
  "main-courante": "Main courante",
  fransor: "Accompagnement Fransor",
  "settings-overview": "Paramètres",
  "settings-operators": "Gestion opérateur",
  "settings-data": "Gestion des données",
  "settings-data-sites": "Sites",
  "settings-data-intervenants": "Intervenants",
  "settings-data-anomaly-types": "Types d'anomalie",
  "settings-data-holidays": "Jours fériés",
  "settings-data-ronde-motifs": "Motifs ronde",
  "settings-data-fransor": "Référentiel Fransor",
  "settings-data-pending-sites": "Sites soumis",
  "settings-data-pending-intervenants": "Intervenants soumis"
};

type HelpPlaceholderTopicProps = {
  topicId: HelpTopicId;
};

export function HelpPlaceholderTopic({ topicId }: HelpPlaceholderTopicProps) {
  const title = TITLES[topicId] ?? "Rubrique";
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📘 {title}</h2>
      <div className="help-center-card help-center-card--muted">
        <p>
          La documentation détaillée de cette rubrique sera complétée progressivement. En attendant, utilisez les écrans correspondants
          dans l&apos;application : les libellés et les boutons reprennent le vocabulaire métier.
        </p>
      </div>
    </article>
  );
}
