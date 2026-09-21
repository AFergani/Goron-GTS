import { HelpTopicLayout } from "../components/HelpTopicLayout";

/**
 * Rubrique Paramètres — connexion au serveur PostgreSQL (hors onglet sauvegardes).
 */
export function HelpSettingsConnectionTopic() {
  return (
    <HelpTopicLayout
      title="🔌 Connexion PostgreSQL"
      purpose="Cette rubrique explique comment configurer l'accès à la base PostgreSQL de la station (hôte, port, compte technique) en cas de base injoignable."
    >
      <ul className="muted help-center-list">
        <li>
          Au premier lancement du poste, l&apos;écran d&apos;initialisation vous demande de renseigner le serveur de la
          station. Testez la connexion avant d&apos;enregistrer.
        </li>
        <li>
          Si la base devient injoignable plus tard, utilisez <strong>Base de données inaccessible ?</strong> sur
          l&apos;écran de connexion pour corriger l&apos;hôte, le port ou le mot de passe technique. Ce réglage est
          propre à <strong>ce poste</strong> (un autre PC ne l&apos;hérite pas).
        </li>
        <li>
          🔒 Le <strong>compte technique</strong> et son mot de passe ne sont pas diffusés : rapprochez-vous d&apos;un
          responsable pour les obtenir.
        </li>
        <li>
          Sur le poste qui héberge Docker/PostgreSQL, utilisez <strong>127.0.0.1</strong>. Sur un autre poste du réseau,
          utilisez l&apos;adresse IPv4 du poste hôte (visible via <strong>ipconfig</strong> dans une console sur ce
          poste, ligne « Adresse IPv4 »).
        </li>
        <li>
          💡 Cliquez sur <strong>Tester la connexion</strong> avant d&apos;enregistrer : si le test échoue, vérifiez
          plutôt Docker/PostgreSQL ou le réseau que de modifier une configuration qui fonctionnait.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
