import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique d’accueil : navigation dans la barre latérale. */
export function HelpWelcomeTopic() {
  return (
    <HelpTopicLayout
      title="🧭 Navigation"
      purpose="La barre latérale permet de naviguer entre les différents modules de l'application et d'accéder rapidement aux principales fonctions."
    >
      <ul className="muted help-center-list">
        <li>Cliquez sur un module pour ouvrir la page correspondante.</li>
        <li>
          Le module actuellement ouvert est <strong>mis en évidence</strong> dans la barre latérale.
        </li>
        <li>
          🔴 Les <strong>pastilles rouges</strong> indiquent qu&apos;une action ou une information nécessite votre
          attention.
        </li>
        <li>
          Le point d&apos;état en bas de la barre indique si l&apos;application est opérationnelle :
          <ul className="muted help-center-list">
            <li>
              🟢 <strong>Vert</strong> : application opérationnelle.
            </li>
            <li>
              🔴 <strong>Rouge</strong> : application indisponible.
            </li>
          </ul>
        </li>
        <li>
          En bas de la barre latérale :
          <ul className="muted help-center-list">
            <li>
              <strong>?</strong> : ouvre l&apos;aide.
            </li>
            <li>
              <strong>☀ / ☾</strong> : change le thème d&apos;affichage.
            </li>
            <li>
              <strong>⚙</strong> : ouvre les paramètres, si vous avez les droits nécessaires.
            </li>
            <li>
              <strong>⏻</strong> : permet de quitter ou de fermer votre session.
            </li>
          </ul>
        </li>
      </ul>
      <p className="muted">
        💡 Les modules et les options disponibles peuvent varier selon vos <strong>droits d&apos;accès</strong>.
      </p>
    </HelpTopicLayout>
  );
}
