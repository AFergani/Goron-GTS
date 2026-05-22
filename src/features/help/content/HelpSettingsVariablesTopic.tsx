/** Rubrique Paramètres — champs personnalisés (formulaires métier). */
export function HelpSettingsVariablesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🔧 Gestion des variables</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Gestion des variables</strong> (accessible dans les <em>Paramètres</em>) permet de créer et d&apos;administrer des{" "}
        <strong>champs personnalisés</strong> au sein des différents formulaires de l&apos;application. Vous pouvez ainsi enrichir les saisies terrain
        pour 5 modules majeurs : les interventions, les mains courantes, les gardiennages, les rondes contractuelles et les rondes exceptionnelles.
      </p>
      <p className="help-center-lead">
        Chaque variable se configure avec un libellé (visible par les agents), un type de saisie (texte, liste, etc.), une portée (site ou famille de
        sites) et une affectation à un ou plusieurs formulaires. Après validation par le bouton d&apos;enregistrement, les changements sont appliqués et une
        ligne est ajoutée au <strong>journal d&apos;audit</strong> (acteur et horodatage, libellé [Paramètres] variables de formulaires).
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits : qui peut gérer quoi ?</h3>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>Rappel :</strong> cet onglet est exclusivement visible si le module <em>Paramètres</em> est activé sur votre compte utilisateur.
        </div>
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
                  <strong>Responsable</strong>
                  <br />
                  <span className="muted">(ou sup.)</span>
                </td>
                <td>
                  <strong>Gestion complète :</strong> autorisé à ajouter, modifier et supprimer des variables. Les modifications s&apos;appliquent en
                  temps réel sur la base de données.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Opérateur</strong>
                </td>
                <td>
                  <strong>Consultation seule :</strong> lecture du tableau et actualisation de la liste. Les boutons d&apos;action ne sont pas visibles
                  et toute tentative de modification est bloquée par le serveur.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Avant de commencer (prérequis)</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Référentiel des sites :</strong> si vous limitez une variable à un site ou à une famille spécifique, assurez-vous que ces éléments
            soient correctement configurés dans <em>Paramètres → Gestion des données → Sites</em>.
          </li>
          <li>
            <strong>Profils de ronde :</strong> le ciblage par profil spécifique de ronde ne fonctionne que si le formulaire <em>Ronde contractuelle</em>{" "}
            est sélectionné. Ces profils sont synchronisés avec ceux du module <em>Rondes</em>.
          </li>
          <li>
            <strong>Exports Word :</strong> pour extraire ces données dans vos rapports, intégrez le code technique de la variable entre accolades{" "}
            <code>{"{nom_du_jeton}"}</code> directement dans votre trame <code>.docx</code> (<em>Paramètres → Gestion des modèles</em>).
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Lecture du tableau principal</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Le tableau répertorie l&apos;ensemble des champs personnalisés actifs selon les colonnes suivantes :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Libellé :</strong> le nom du champ tel qu&apos;il apparaît sur l&apos;écran des opérateurs.
          </li>
          <li>
            <strong>Variable (nom du jeton) :</strong> le code technique généré automatiquement à la création (ex.{" "}
            <code>reference_contrat</code>). C&apos;est ce nom exact qui doit être inséré entre accolades dans vos modèles Word.
          </li>
          <li>
            <strong>Type :</strong> le format de saisie du champ (<em>texte court, texte long, nombre, heure ou liste déroulante</em>).
          </li>
          <li>
            <strong>Portée :</strong> la zone d&apos;affichage. Affiche <strong>Tous</strong> si aucune restriction n&apos;est appliquée, ou indique
            le <em>site</em> ou la <em>famille</em> cible.
          </li>
          <li>
            <strong>Formulaires :</strong> les modules métiers dans lesquels le champ va s&apos;injecter.
          </li>
          <li>
            <strong>Profils ronde contractuelle :</strong> indique les profils de rondes spécifiques concernés (affiche un tiret si le champ ne
            concerne pas les rondes contractuelles).
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Ajouter ou modifier un champ personnalisé</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Cliquez sur <strong>Ajouter une variable</strong> (barre d&apos;actions) ou sur le <strong>crayon</strong> en bout de ligne.
          </li>
          <li>
            Renseignez le <strong>Libellé</strong> (obligatoire) et éventuellement un <em>Placeholder</em> (texte d&apos;aide indicatif en gris dans le
            champ vide).
          </li>
          <li>
            Sélectionnez le <strong>Type</strong> de données :
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Cas de la liste déroulante :</em> saisissez les options possibles en les séparant par des virgules (ex.{" "}
                <em>Oui, Non, En attente</em>).
              </li>
            </ul>
          </li>
          <li>
            <strong>Vérification du jeton :</strong> le champ <em>Variable technique</em> affiche en lecture seule le code de traitement Word qui
            découle de votre libellé (hors type liste déroulante, où le champ sert à saisir les valeurs de la liste).
          </li>
          <li>
            Définissez la <strong>Portée</strong> : <em>Tous les sites</em>, <em>un site précis</em> (recherche par mots-clés) ou <em>une famille</em>{" "}
            (saisie en majuscules).
          </li>
          <li>
            Cochez le ou les <strong>Formulaires</strong> cibles à l&apos;aide des interrupteurs.
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Option ronde contractuelle :</em> si ce module est coché, vous pouvez restreindre l&apos;affichage du champ à certains profils
                spécifiques de rondes. Si vous ne cochez aucun profil, la variable s&apos;appliquera à toutes les rondes contractuelles sans
                distinction.
              </li>
            </ul>
          </li>
          <li>
            Cliquez sur <strong>Enregistrer</strong>.
          </li>
        </ol>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Important :</strong> le nom technique du jeton Word (<code>{"{variable}"}</code>) est <strong>définitivement figé lors de la
          création</strong>. Si vous modifiez le libellé d&apos;une variable existante par la suite, son jeton Word ne changera pas. Anticipez la
          structure de vos documents <code>.docx</code> dès la création.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🎯 Conditions d&apos;affichage sur le terrain</h3>
        <p className="muted">
          Pour qu&apos;un agent voie apparaître un champ personnalisé sur son application, l&apos;intervention ou la ronde en cours doit valider{" "}
          <strong>toutes</strong> les conditions suivantes :
        </p>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>Le module en cours d&apos;utilisation doit être coché dans la configuration de la variable.</li>
          <li>
            Le site de la mission doit correspondre à la portée définie (soit le site exact, soit la bonne famille de sites, soit une portée générale
            « Tous »).
          </li>
          <li>
            S&apos;il s&apos;agit d&apos;une ronde contractuelle, le profil de la ronde doit faire partie des profils sélectionnés (ou la variable doit
            être configurée sur tous les profils).
          </li>
        </ol>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🗑️ Suppression d&apos;un champ</h3>
        <p className="muted">
          Cliquez sur l&apos;icône <strong>Poubelle</strong> pour retirer immédiatement une variable de la base de données.
        </p>
        <p className="muted">
          <strong>Sécurité :</strong> cette action empêche simplement le champ d&apos;apparaître sur les futures saisies. Les données enregistrées par
          le passé sur d&apos;anciennes fiches de terrain <strong>ne sont pas effacées</strong> et restent conservées dans l&apos;historique de
          l&apos;application.
        </p>
        <p className="muted">
          En cas de doute, utilisez le bouton <strong>Actualiser</strong> dans la barre d&apos;actions pour synchroniser votre écran avec les
          dernières modifications de vos collègues.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Bonnes pratiques</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Faites des tests en conditions réelles :</strong> une fois votre variable enregistrée, ouvrez le formulaire terrain correspondant
            (en ciblant le bon site ou le bon profil) pour valider son comportement visuel avant de modifier vos trames Word.
          </li>
          <li>
            <strong>Évitez les conflits de noms :</strong> le système bloque automatiquement la création de deux libellés différents qui généreraient
            le même nom technique de jeton.
          </li>
          <li>
            <strong>Ne surchargez pas les écrans :</strong> utilisez au maximum la portée par <em>site</em> ou <em>famille de sites</em>. Il est inutile
            d&apos;afficher un champ spécifique « Code barrière » sur les formulaires d&apos;un client qui ne possède pas de clôture.
          </li>
          <li>
            <strong>Bouton Actualiser :</strong> si vous travaillez à plusieurs sur la configuration de la station, utilisez ce bouton pour
            synchroniser instantanément votre écran avec les dernières modifications de vos collègues.
          </li>
        </ul>
      </div>
    </article>
  );
}
