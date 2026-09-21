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
          Avant toute restauration, utilisez <strong>Comparer une sauvegarde</strong> : l&apos;application analyse le
          fichier sans toucher à la base en service et indique les fiches qui seraient impactées (perdues, restaurées,
          écrasées).
        </li>
        <li>
          ⚠️ Cliquez sur <strong>Restaurer</strong> sur la ligne concernée pour remplacer la base active par cette
          sauvegarde. Attention : cette action remplace <strong>l&apos;intégralité des données en cours</strong>.
        </li>
        <li>
          Si l&apos;application ne démarre pas, une restauration reste possible via la{" "}
          <strong>console de production</strong>, à condition que Docker soit démarré.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
