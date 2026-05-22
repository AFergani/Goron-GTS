/** Rubrique d’accueil : sidebar, navigation, accessibilité, états writer. */
export function HelpWelcomeTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🧭 Sidebar et accessibilité</h2>
      <p className="help-center-lead">
        La barre latérale gauche (<strong>sidebar</strong>) reste visible en permanence durant toute votre session de travail. Elle centralise vos
        informations de connexion, la navigation principale entre les différents modules métiers, les indicateurs d&apos;état technique de la station
        ainsi que des boutons d&apos;actions rapides (aide, thème, paramètres et fermeture).
      </p>
      <p className="help-center-lead">
        Cette rubrique vous explique comment exploiter et naviguer efficacement dans cette barre latérale, notamment via les raccourcis clavier et les
        technologies d&apos;assistance (lecteurs d&apos;écran).
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📍 En-tête de la sidebar (votre session)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Situé tout en haut, ce bloc fixe identifie votre environnement de travail :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Logo et titre :</strong> identification officielle de l&apos;application « Télésurveillance GTS » (avec texte alternatif pour
            l&apos;accessibilité).
          </li>
          <li>
            <strong>Nom affiché :</strong> votre identité de session (nom et prénom configurés lors de la création de votre compte).
          </li>
          <li>
            <strong>Date et heure :</strong> horloge de la station synchronisée au format français (jour, date longue, heure).
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📂 Navigation principale (modules métiers)</h3>
        <p className="muted">
          La zone centrale de la sidebar est une section défilante (<strong>scrollable</strong>) qui regroupe les accès aux différents modules de
          l&apos;application.
        </p>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>Rappel :</strong> l&apos;affichage de ces boutons dépend strictement des habilitations de votre compte. Si un module n&apos;apparaît
          pas, c&apos;est que votre profil ne dispose pas des droits d&apos;accès requis.
        </div>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Bouton</th>
                <th scope="col">Rôle et indicateurs visuels</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Interventions</strong>
                </td>
                <td>
                  Accès aux fiches d&apos;intervention terrain. Un badge numérique indique le nombre d&apos;interventions actuellement en cours.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Rondes</strong>
                </td>
                <td>Gestion et suivi des rondes contractuelles et exceptionnelles.</td>
              </tr>
              <tr>
                <td>
                  <strong>Gardiennage</strong>
                </td>
                <td>Planification et suivi des prestations de gardiennage sur site.</td>
              </tr>
              <tr>
                <td>
                  <strong>Main courante</strong>
                </td>
                <td>
                  Journal des événements terrain. Pour l&apos;encadrement, un badge signale le nombre d&apos;entrées non consultées nécessitant une
                  validation.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Fransor</strong>
                </td>
                <td>Pilotage des ouvertures / fermetures et édition du récapitulatif mensuel.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="muted help-center-list">
          <li>
            <strong>Repère visuel :</strong> la page sur laquelle vous vous trouvez est mise en évidence par un fond renforcé et un trait vertical
            accentué sur le bord droit du bouton.
          </li>
          <li>
            <strong>Accès configuration :</strong> l&apos;accès aux configurations avancées (<em>Comptes, Données, Base, Journal</em>) ne se trouve pas
            dans cette liste mais via l&apos;icône <strong>Engrenage</strong> située dans le bloc inférieur, sous réserve de vos droits d&apos;accès.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🩺 Indicateurs techniques et synchronisation</h3>
        <p className="muted">
          Placées au bas de la sidebar, trois pastilles de couleur résument la santé de votre poste et de sa connectivité réseau. Elles disposent
          toutes d&apos;une description textuelle complète au survol et via des balises d&apos;accessibilité (<code>aria-label</code>) :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>DB (base de données) :</strong> indique si la base de données SQLite partagée est accessible en écriture depuis votre poste (
            <em>accessible / inaccessible</em>).
          </li>
          <li>
            <strong>Master :</strong> indique la disponibilité sur le réseau local du poste de synchronisation principal (<em>writer Master</em>).
          </li>
          <li>
            <strong>Backup :</strong> indique la disponibilité du poste de synchronisation de secours (<em>writer Backup</em>).
          </li>
        </ul>
        <h4 className="help-center-subsection-title">Code couleur et file d&apos;attente</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Vert :</strong> état nominal et favorable.
          </li>
          <li>
            <strong>Rouge :</strong> dysfonctionnement ou coupure réseau.
          </li>
          <li>
            <strong>Neutre :</strong> état inconnu (en cours de détection).
          </li>
          <li>
            <strong>Indicateur « Queue » :</strong> chiffre indiquant le nombre d&apos;écritures en attente de synchronisation vers le serveur.
          </li>
        </ul>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Mode dégradé :</strong> en cas de voyants rouges ou de file d&apos;attente (<em>Queue</em>) élevée, vos saisies restent généralement
          conservées localement sur le poste pour éviter les pertes de données. En cas de blocage prolongé, consultez l&apos;aide{" "}
          <em>Gestion base de données</em> et vérifiez le <em>Journal des actions</em>.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">⚡ Actions rapides (barre d&apos;icônes)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Tout en bas de l&apos;écran se trouvent quatre boutons compacts, dotés d&apos;infobulles (<code>title</code>) et de descriptions sonores (
          <code>aria-label</code>) en français :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Point d&apos;interrogation :</strong> ouvre le centre d&apos;aide (cette fenêtre). Si vous êtes dans un onglet des{" "}
            <em>Paramètres</em>, l&apos;aide s&apos;ouvre automatiquement sur la rubrique correspondante.
          </li>
          <li>
            <strong>Soleil / Lune :</strong> bascule instantanément l&apos;affichage entre le thème clair et le thème sombre (votre choix est mémorisé
            sur ce poste).
          </li>
          <li>
            <strong>Engrenage (Paramètres) :</strong> accès direct aux menus d&apos;administration (visible uniquement si votre profil y est autorisé).
          </li>
          <li>
            <strong>Bouton d&apos;alimentation :</strong> ouvre le menu contextuel permettant de vous déconnecter de votre session, de minimiser la
            fenêtre ou de quitter proprement l&apos;application.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">♿ Accessibilité et navigation au clavier</h3>
        <p className="muted">
          L&apos;interface de la sidebar a été développée pour respecter les normes d&apos;accessibilité numérique :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Focus visible (navigation clavier) :</strong> lors de l&apos;utilisation des touches <kbd>Tab</kbd> et <kbd>Maj</kbd>+<kbd>Tab</kbd>,
            chaque élément interactif sélectionné s&apos;entoure d&apos;un <strong>contour doré très net</strong>. Appuyez sur <kbd>Entrée</kbd> pour
            activer le bouton sélectionné.
          </li>
          <li>
            <strong>Garantie des contrastes :</strong> la palette de couleurs (textes, icônes, badges) conserve un niveau de contraste élevé, rendant
            les informations lisibles que vous utilisiez le thème sombre ou le thème clair.
          </li>
          <li>
            <strong>Double codage des données :</strong> les informations importantes ne reposent <strong>jamais uniquement sur la couleur</strong>.
            L&apos;état des pastilles techniques et le nombre d&apos;alertes sont systématiquement doublés par du texte accessible (via le survol, les
            lecteurs d&apos;écran et la ligne textuelle <em>Queue</em>).
          </li>
          <li>
            <strong>Structure sémantique :</strong> pour les utilisateurs de lecteurs d&apos;écran, le bloc de navigation centrale est explicitement
            balisé comme <em>Navigation principale</em>, tandis que le bloc inférieur est identifié sous le nom <em>Actions rapides</em>. L&apos;en-tête
            et le bloc technique restent fixes à l&apos;écran, garantissant de toujours garder vos repères visuels même lorsque la liste centrale
            défile.
          </li>
        </ul>
      </div>
    </article>
  );
}
