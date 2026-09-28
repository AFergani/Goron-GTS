import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique Paramètres — gestion des comptes opérateurs. */
export function HelpSettingsOperatorsTopic() {
  return (
    <HelpTopicLayout
      title="👤 Gestion opérateur"
      purpose="Cet onglet des Paramètres centralise l'administration des comptes utilisateurs : création, rôles, sécurité et désactivation."
    >
      <ul className="muted help-center-list">
        <li>
          Cliquez sur <strong>Nouvel utilisateur</strong>, renseignez le nom affiché et le rôle :{" "}
          <strong>Opérateur</strong> (agent terrain, ou <strong>Opérateur +</strong> pour la page Remarques vidéo) ou{" "}
          <strong>Responsable</strong> (avec un profil métier : Superviseur, Responsable de station ou Directeur de
          station).
        </li>
        <li>
          🔒 Vous ne pouvez gérer que des comptes de niveau <strong>inférieur ou égal</strong> au vôtre, et jamais
          attribuer un niveau supérieur au vôtre. Un <strong>superviseur</strong> ne peut pas changer le rôle ni le
          profil : seul un responsable de station ou un directeur peut modifier le niveau hiérarchique.
        </li>
        <li>
          Depuis la liste, chaque compte propose selon vos droits : <strong>Modifier</strong>,{" "}
          <strong>Réinit. mot de passe</strong>, <strong>Déverrouiller</strong>, <strong>Désactiver</strong> ou{" "}
          <strong>Réactiver</strong>. Chaque action demande un motif, tracé dans le journal.
        </li>
        <li>
          En cas de départ d&apos;un collaborateur, utilisez <strong>Désactiver</strong> plutôt que supprimer : son
          historique reste conservé et correctement attribué.
        </li>
        <li>
          💡 En l&apos;absence d&apos;un responsable (nuit, week-end), un agent peut débloquer son accès via{" "}
          <strong>Mot de passe oublié</strong> sur l&apos;écran de connexion, lorsque la base répond : un collègue
          présent s&apos;identifie et valide, à condition d&apos;être d&apos;un niveau égal ou supérieur. Les deux noms
          et le motif sont enregistrés dans le journal.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
