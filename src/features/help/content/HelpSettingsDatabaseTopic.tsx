import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique Paramètres — sauvegardes PostgreSQL. */
export function HelpSettingsDatabaseTopic() {
  return (
    <HelpTopicLayout
      title="💾 Gestion de la base de données"
      purpose="Cet onglet gère les sauvegardes de la base de données : consultation, création à la demande, comparaison et restauration."
    >
      <ul className="muted help-center-list">
        <li>
          Cliquez sur <strong>Sauvegarde rapide</strong> pour créer une copie instantanée, ou{" "}
          <strong>Enregistrer sous</strong> pour choisir l&apos;emplacement. Ces copies manuelles ne sont{" "}
          <strong>jamais supprimées automatiquement</strong>.
        </li>
        <li>
          🌙 Les sauvegardes automatiques se font chaque nuit à <strong>3 h</strong> ; l&apos;application conserve les{" "}
          <strong>14</strong> dernières journalières et <strong>12</strong> mensuelles, les plus anciennes étant ensuite
          supprimées.
        </li>
        <li>
          Avant toute restauration, utilisez <strong>Comparer</strong> : le résultat s&apos;affiche tout de suite
          dans une fenêtre (fiches qui disparaîtraient, reviendraient ou seraient écrasées), sans toucher à la
          base. Vous pouvez restaurer depuis cette même fenêtre.
        </li>
        <li>
          ⚠️ <strong>Restaurer</strong> remplace <strong>l&apos;intégralité des données en cours</strong>. Une
          double confirmation est exigée : le mot de passe du compte responsable ou directeur, puis la saisie du
          mot <strong>RESTAURER</strong>.
        </li>
        <li>
          Si l&apos;application ne démarre pas, une restauration reste possible via la{" "}
          <strong>console de production</strong>, à condition que Docker soit démarré.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
