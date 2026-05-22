import type { HelpTopicId } from "../model/helpTopics";

const TITLES: Partial<Record<HelpTopicId, string>> = {
  interventions: "Interventions",
  rondes: "Rondes",
  gardiennage: "Gardiennage",
  "main-courante": "Main courante",
  fransor: "Accompagnement Fransor",
  "settings-operators": "Gestion opérateur"
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
