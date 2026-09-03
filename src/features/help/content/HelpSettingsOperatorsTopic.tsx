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
        Pour des raisons de sécurité et de traçabilité, chaque utilisateur se connecte avec ses propres identifiants. Toute modification,
        réinitialisation de mot de passe, déverrouillage, désactivation ou réactivation exige un <strong>motif</strong>, enregistré avec son auteur
        dans le journal d&apos;audit de la station.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits : qui peut gérer quoi ?</h3>
        <p className="muted">
          Règle générale : vous pouvez gérer les comptes dont le niveau hiérarchique est <em>inférieur ou égal</em> au vôtre, et vous ne pouvez
          jamais attribuer un niveau supérieur au vôtre. Le compte Admin n&apos;est administrable par personne.
        </p>
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
                </td>
                <td>
                  <strong>Gestion complète :</strong> création, modification, désactivation, réactivation, réinitialisation de mot de passe et
                  déverrouillage sur tous les comptes de la station, y compris les autres directeurs.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Responsable de station</strong>
                </td>
                <td>
                  Mêmes actions, sur les responsables de station, superviseurs et opérateurs. Un directeur de station lui reste inaccessible, et il
                  ne peut promouvoir personne à ce niveau.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Superviseur</strong>
                </td>
                <td>
                  Mêmes actions, sur les superviseurs et les opérateurs. En revanche, la <strong>création</strong> de comptes et le réglage de
                  l&apos;accès à <strong>Paramètres</strong> restent réservés au responsable et au directeur de station.
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
            <strong>Rôle technique et profil métier :</strong>
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
            <strong>Vues autorisées :</strong> les modules métier sont ouverts à tous les comptes. Seul l&apos;accès à
            <strong> Paramètres</strong> se règle ici — réservé au <strong>directeur de station</strong> et au{" "}
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
        <p className="muted">
          Depuis la liste des utilisateurs, chaque ligne propose les actions autorisées sur ce compte. Un bouton absent
          signifie que la hiérarchie ne vous permet pas l&apos;action, ou qu&apos;elle est sans objet. Toutes demandent un
          motif, enregistré dans le journal avec votre nom.
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Modifier :</strong> met à jour le nom affiché, le rôle et le profil métier. Le niveau hiérarchique de
            votre propre compte n&apos;est pas modifiable, dans un sens comme dans l&apos;autre.
          </li>
          <li>
            <strong>Réinit. mot de passe :</strong> génère un nouveau mot de passe temporaire, lève un éventuel blocage et
            impose le changement à la prochaine connexion. Indisponible sur votre propre compte.
          </li>
          <li>
            <strong>Déverrouiller :</strong> apparaît si le compte est <strong>Bloqué</strong> après trop de tentatives
            échouées. Ce blocage se lève de toute façon automatiquement au bout de 15 minutes.
          </li>
          <li>
            <strong>Désactiver :</strong> à utiliser en cas de départ d&apos;un collaborateur. Le compte est désactivé
            immédiatement mais <strong>son historique est intégralement conservé</strong> dans la base de données. Un compte
            qui n&apos;a jamais rien produit est en revanche supprimé physiquement, ce que seul un directeur ou responsable
            de station peut déclencher.
          </li>
          <li>
            <strong>Réactiver :</strong> demande un motif, <strong>génère un nouveau mot de passe temporaire</strong> (comme à la création ou
            après réinitialisation) et impose le changement de mot de passe à la prochaine connexion. La modale d&apos;affichage du mot de passe
            temporaire s&apos;ouvre pour le transmettre à l&apos;agent.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Lecture de la liste utilisateurs</h3>
        <p className="muted">La liste affiche les colonnes suivantes :</p>
        <ul className="muted help-center-list">
          <li>
            <strong>Connexion :</strong> pastille dédiée, toujours visible. <strong>Verte</strong> = utilisateur connecté (tous postes) ;{" "}
            <strong>grise</strong> = déconnecté.
          </li>
          <li>
            <strong>Nom :</strong> nom affiché de l&apos;agent dans l&apos;application.
          </li>
          <li>
            <strong>Profil (statut) :</strong> un badge <em>Actif</em>, <em>Inactif</em> ou <em>Bloqué</em> précède le
            rôle et le profil métier au format <em>Rôle (Profil)</em>, par exemple{" "}
            <em>Responsable (Directeur de station)</em>. Sans profil métier, seul le rôle est affiché. Les filtres{" "}
            <strong>Actifs</strong> / <strong>Désactivés</strong> / <strong>Tous</strong> en haut de liste ajustent
            l&apos;affichage.
          </li>
          <li>
            <strong>Dernière mise à jour :</strong> date de la dernière modification suivie, entre parenthèses, du compte qui
            l&apos;a effectuée.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🌙 Mot de passe oublié la nuit ou le week-end</h3>
        <p className="muted">
          Quand aucun responsable ni superviseur n&apos;est joignable, l&apos;agent peut utiliser{" "}
          <strong>Mot de passe oublié</strong> sur l&apos;écran de connexion. Un <strong>collègue présent</strong>{" "}
          s&apos;identifie alors avec ses propres identifiants et saisit un motif : l&apos;application génère un mot de passe
          temporaire que l&apos;agent change immédiatement.
        </p>
        <p className="muted">
          Le collègue validateur ne peut couvrir qu&apos;un compte de niveau inférieur ou égal au sien : un opérateur dépanne
          un opérateur, mais pas un superviseur. Le journal enregistre <strong>les deux noms</strong>, ce qui rend chaque
          déblocage attribuable. Pensez à filtrer ces entrées en début de semaine pour vérifier qu&apos;elles sont
          légitimes.
        </p>
        <p className="muted">
          Le nom affiché servant d&apos;identifiant est public dans l&apos;application : c&apos;est bien la présence et la
          responsabilité du collègue qui font foi, pas le nom saisi. Il doit donc taper son mot de passe à l&apos;abri des
          regards, comme pour une connexion normale.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques d&apos;attribution</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Cas d&apos;un superviseur :</strong>
            <br />
            <strong>→</strong> attribuez le profil <em>Superviseur</em>. Cela lui donne un accès complet aux modules métiers et lui permet de
            dépanner un opérateur ayant bloqué son mot de passe le samedi, sans pour autant pouvoir créer de compte ni ouvrir l&apos;accès à
            Paramètres.
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
