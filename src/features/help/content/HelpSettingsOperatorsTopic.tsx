/** Rubrique Paramètres — gestion des comptes opérateurs et droits pages. */
export function HelpSettingsOperatorsTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">👤 Gestion opérateur</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Gestion opérateur</strong> (accessible dans les <strong>Paramètres</strong>) centralise l&apos;administration des
        comptes utilisateurs de l&apos;application. Cet écran vous permet de créer des comptes, d&apos;ajuster les droits d&apos;accès aux modules, de
        gérer la sécurité (mots de passe, déverrouillages) et de suspendre des accès.
      </p>
      <p className="help-center-lead">
        Pour des raisons de sécurité et de traçabilité, chaque utilisateur se connecte avec ses propres identifiants. Les actions sensibles
        réalisées sur cet écran sont enregistrées dans le journal d&apos;audit de la station.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits : qui peut gérer quoi ?</h3>
        <p className="muted">Les actions disponibles sur cet écran dépendent strictement de votre propre niveau de responsabilité :</p>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Votre profil</th>
                <th scope="col">Droits sur cet onglet</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Directeur de station</strong>
                  <br />
                  <strong>Responsable de station</strong>
                </td>
                <td>
                  <strong>Gestion complète :</strong> création, modification, désactivation, attribution des modules métiers, réinitialisation de
                  mot de passe et déverrouillage de compte.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Superviseur</strong>
                </td>
                <td>
                  <strong>Gestion restreinte :</strong> autorisé uniquement à réinitialiser le mot de passe ou à déverrouiller le compte d&apos;un
                  profil de rang <em>strictement inférieur</em> (ex. opérateurs). Pas de création ni de modification des droits.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Opérateur</strong>
                </td>
                <td>
                  <strong>Aucun accès :</strong> cet onglet ne lui est pas visible.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Créer un nouvel utilisateur</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Allez dans <strong>Paramètres → Gestion opérateur</strong> et cliquez sur <strong>Créer</strong>.
          </li>
          <li>
            <strong>Nom affiché :</strong> saisissez le nom et le prénom de l&apos;agent. Ce nom sera visible partout dans l&apos;application
            (signatures de main courante, rapports, etc.).
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>L&apos;identifiant de connexion unique est généré automatiquement par le système.</em>
              </li>
            </ul>
          </li>
          <li>
            <strong>Rôle technique et profil :</strong>
            <ul className="help-center-list help-center-list--nested">
              <li>
                <strong>Opérateur :</strong> pour les agents de saisie et de consultation terrain.
              </li>
              <li>
                <strong>Responsable :</strong> pour les profils ayant des fonctions de pilotage (validation, facturation). Si sélectionné, définissez
                son profil métier (<strong>Superviseur</strong>, <strong>Responsable de station</strong> ou <strong>Directeur de station</strong>).
              </li>
            </ul>
          </li>
          <li>
            <strong>Vues autorisées :</strong> activez ou désactivez les accès aux différents modules (main courante, Fransor, interventions, rondes,
            gardiennage, paramètres) via les interrupteurs dédiés — réservé au <strong>directeur de station</strong> et au{" "}
            <strong>responsable de station</strong>.
          </li>
          <li>
            <strong>Validation :</strong> cliquez sur <strong>Créer l&apos;utilisateur</strong>. Un <strong>mot de passe temporaire</strong>{" "}
            s&apos;affiche à l&apos;écran : transmettez-le de façon sécurisée à l&apos;agent. Le système lui imposera de le modifier dès sa première
            connexion.
          </li>
        </ol>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✏️ Actions de maintenance sur un compte</h3>
        <p className="muted">Depuis la liste des utilisateurs, plusieurs actions rapides sont à votre disposition :</p>
        <ul className="muted help-center-list">
          <li>
            <strong>Modifier (icône crayon) :</strong> permet de mettre à jour le nom affiché, le rôle, le profil ou de modifier les modules métiers
            accessibles. Vous pouvez aussi y cocher l&apos;option <strong>Demander la réinitialisation du mot de passe</strong> pour forcer l&apos;agent
            à le changer à sa prochaine connexion.
          </li>
          <li>
            <strong>Réinitialiser le mot de passe (icône clé) :</strong> génère instantanément un nouveau mot de passe temporaire pour l&apos;agent
            (soumis aux règles de hiérarchie).
          </li>
          <li>
            <strong>Déverrouiller (icône cadenas ouvert) :</strong> devient cliquable si le compte de l&apos;agent a été <strong>Bloqué</strong>{" "}
            automatiquement après trop de tentatives de connexion infructueuses.
          </li>
          <li>
            <strong>Désactiver (icône utilisateur barré) :</strong> à utiliser en cas de départ d&apos;un collaborateur. Le compte est désactivé
            immédiatement mais <strong>son historique est intégralement conservé</strong> dans la base de données.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Indicateurs visuels de la liste</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Pastille verte :</strong> indique que l&apos;utilisateur est actuellement connecté et actif sur l&apos;application.
          </li>
          <li>
            <strong>Statut :</strong> affiche l&apos;état du compte : <em>Actif</em>, <em>Désactivé</em> ou <em>Bloqué</em>. Utilisez les filtres en
            haut de liste pour trier l&apos;affichage.
          </li>
          <li>
            <strong>Traçabilité :</strong> les colonnes <strong>Dernière mise à jour</strong> et <strong>Par</strong> vous indiquent précisément quel
            responsable a modifié le compte pour la dernière fois et à quelle date.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques d&apos;attribution</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Cas d&apos;un superviseur :</strong>
            <br />
            <strong>→</strong> attribuez le profil <em>Superviseur</em>. Cela lui donne un accès complet aux modules métiers et lui permet de
            dépanner un opérateur ayant bloqué son mot de passe le samedi, sans pour autant pouvoir modifier la structure des comptes de la station.
          </li>
          <li>
            <strong>Cas du départ d&apos;un collaborateur :</strong>
            <br />
            <strong>→</strong> ne supprimez jamais un compte. Cliquez sur <strong>Désactiver</strong>. L&apos;agent ne pourra plus se connecter, mais
            toutes les mains courantes ou interventions qu&apos;il a signées par le passé resteront correctement attribuées à son nom.
          </li>
        </ul>
      </div>
    </article>
  );
}
