import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique Paramètres — journal des actions (lecture, filtres, export). */
export function HelpSettingsAuditTopic() {
  return (
    <HelpTopicLayout
      title="📜 Journal des actions"
      purpose="Cet onglet retrace l'historique complet des actions effectuées dans l'application (créations, modifications, suppressions, connexions...), utile pour le support et le diagnostic après incident."
    >
      <ul className="muted help-center-list">
        <li>
          Deux sous-onglets : <strong>Logs applicatifs</strong> (actions des utilisateurs sur les modules métiers) et{" "}
          <strong>Logs techniques</strong> (connexion PostgreSQL, sauvegardes).
        </li>
        <li>
          Filtrez par <strong>date</strong>, <strong>acteur</strong>, <strong>famille</strong>, <strong>cible</strong> ou{" "}
          <strong>statut</strong> pour isoler un événement précis.
        </li>
        <li>
          Survolez la colonne <strong>Acteur</strong> pour voir la cible impactée, ou la colonne{" "}
          <strong>Donnée</strong> pour voir le détail (valeurs avant/après, motif, résumé d&apos;import).
        </li>
        <li>
          📊 Cliquez sur <strong>Exporter données</strong> pour générer un Excel de l&apos;ensemble des lignes filtrées
          (pas seulement la page affichée).
        </li>
        <li>
          L&apos;écran affiche les <strong>1000</strong> événements les plus récents ; un bandeau indique la date du plus
          ancien encore visible.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
