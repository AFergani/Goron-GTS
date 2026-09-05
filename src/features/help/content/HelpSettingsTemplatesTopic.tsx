/** Rubrique Paramètres — modèles Word (.docx) et variables Docxtemplater. */
export function HelpSettingsTemplatesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📄 Modèles et variables</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Modèles et variables</strong> (accessible dans les <em>Paramètres</em>) regroupe deux sous-onglets, comme{" "}
        <em>Gestion des données</em> : <strong>Modèles Word</strong> (fichiers <strong>.docx</strong> d&apos;export) et{" "}
        <strong>Variables</strong> (champs personnalisés des formulaires). Il couvre les flux mains courantes, interventions et rondes.
      </p>
      <p className="help-center-lead">
        Dans le sous-onglet <strong>Modèles Word</strong>, vous vérifiez la présence des fichiers, remplacez les trames standards, et définissez des
        attributions par site ou par famille. Un modèle personnalisé d&apos;un flux (intervention, ronde, etc.) utilise{" "}
        <strong>les mêmes champs Word</strong> que le modèle par défaut de ce flux. Le sous-onglet <strong>Variables</strong> gère les champs
        personnalisés des formulaires. Toutes ces opérations sont consignées dans le <strong>journal d&apos;audit</strong> de la station.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits : qui peut gérer quoi ?</h3>
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
                  <strong>Superviseur</strong>
                  <br />
                  <strong>Responsable de station</strong>
                  <br />
                  <strong>Directeur de station</strong>
                  <br />
                  <strong>Admin</strong>
                </td>
                <td>
                  <strong>Gestion complète :</strong> remplacement des modèles globaux, consultation des variables, ajout et suppression des
                  attributions personnalisées par site ou par famille.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Opérateur</strong>
                </td>
                <td>
                  <strong>Aucun accès :</strong> les opérateurs n&apos;ont pas accès aux Paramètres.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Avant de commencer (prérequis techniques)</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Chemin de la base de données :</strong> pour que cet écran fonctionne, la base de données doit être active afin que
            l&apos;application identifie le répertoire de stockage local situé dans <code>data/templates</code>.
          </li>
          <li>
            <strong>Syntaxe des balises (Docxtemplater) :</strong> vos documents Word doivent utiliser des balises (jetons) spécifiques entourées
            d&apos;accolades, comme <code>{"{site}"}</code> ou <code>{"{date_creation}"}</code>. Cliquez sur l&apos;icône{" "}
            <strong>Aide variables (?)</strong> présente sur chaque ligne pour obtenir la liste exacte des jetons textuels acceptés par flux.
          </li>
          <li>
            <strong>Variables personnalisées :</strong> si vous utilisez des champs complémentaires (notamment pour les interventions), assurez-vous
            qu&apos;ils soient correctement configurés dans <em>Paramètres → Modèles et variables → Variables</em> avant de les intégrer sous forme de
            jetons dans vos fichiers Word.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📂 Stockage et résolution des fichiers</h3>
        <p className="muted">
          L&apos;application applique une logique de priorité pour l&apos;utilisation des fichiers : elle cherche d&apos;abord votre modèle
          personnalisé dans le dossier local <code>data/templates</code>. Si aucun fichier n&apos;est trouvé, elle utilise un modèle embarqué de
          secours pour éviter le blocage de l&apos;export.
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Bouton « Ouvrir le dossier des modèles » :</strong> lance directement l&apos;explorateur de fichiers de votre ordinateur sur le bon
            répertoire. Vous pouvez y glisser-déposer vos <code>.docx</code> manuellement.
          </li>
          <li>
            <strong>Bouton « Actualiser » :</strong> à utiliser après toute modification manuelle dans le dossier pour mettre à jour la colonne{" "}
            <strong>État</strong> (<strong>Présent</strong> / <strong>Absent</strong>) et l&apos;emplacement affiché dans <strong>Chemin résolu</strong>.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📋 Tableau 1 : les modèles par défaut (globaux)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Ce tableau liste les trames de base indispensables à l&apos;application. Les fichiers <code>.docx</code> supplémentaires présents dans le
          dossier (hors noms déjà listés) apparaissent aussi comme modèles personnalisés détectés automatiquement.
        </p>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Attention :</strong> ne renommez pas ces fichiers sur votre ordinateur — l&apos;application ne reconnaîtrait plus le flux.
        </div>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Flux concerné</th>
                <th scope="col">Nom exact du fichier .docx attendu</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Main courante</strong>
                </td>
                <td>
                  <code>main-courante-template.docx</code>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Intervention</strong>
                </td>
                <td>
                  <code>intervention-template.docx</code>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Ronde contractuelle</strong>
                </td>
                <td>
                  <code>ronde-template.docx</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="help-center-subsection-title">🔄 Procédure pour remplacer un modèle global</h4>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>Préparez votre fichier Word sur votre poste avec les bonnes balises entre accolades.</li>
          <li>
            Sur la ligne du flux concerné, cliquez sur l&apos;icône <strong>Remplacer</strong> (icône d&apos;import).
          </li>
          <li>
            Sélectionnez votre fichier : l&apos;application le copie automatiquement dans <code>data/templates</code> et écrase l&apos;ancienne
            version. Vérifiez que le statut passe à <strong>Présent</strong>.
          </li>
        </ol>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔗 Tableau 2 : les attributions personnalisées (par site ou famille)</h3>
        <p className="muted">
          Ce second tableau permet d&apos;automatiser l&apos;utilisation d&apos;une trame spécifique selon le client ou le lieu concerné. Flux
          disponibles : <em>Intervention</em>, <em>Ronde contractuelle</em>, <em>Ronde exceptionnelle</em>.
        </p>
        <p className="muted">
          <strong>Supprimer</strong> sur une ligne retire uniquement cette attribution (confirmation, enregistrement dans le journal d&apos;audit).
        </p>

        <h4 className="help-center-subsection-title">➕ Ajouter un modèle personnalisé (réservé aux responsables)</h4>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Cliquez sur <strong>Ajouter un modèle personnalisé</strong> dans la barre d&apos;actions.
          </li>
          <li>Choisissez le <strong>Flux</strong> concerné. La liste des champs Word affichée est identique à celle du modèle par défaut de ce flux (intervention, ronde contractuelle ou exceptionnelle).</li>
          <li>
            Définissez la <strong>Portée</strong> : soit un <strong>Site</strong> précis (recherche dans votre référentiel), soit une{" "}
            <strong>Famille</strong> de sites (suggestions automatiques).
          </li>
          <li>
            Cliquez sur <strong>Choisir et attribuer le modèle</strong> pour charger le fichier <code>.docx</code> dédié. Le système l&apos;enregistre.
            Si la combinaison existait déjà, le fichier se met à jour sans créer de doublon.
          </li>
        </ol>

        <h4 className="help-center-subsection-title">🎯 Ordre de priorité lors d&apos;un export Word sur le terrain</h4>
        <p className="muted">
          Lorsqu&apos;un agent clique sur « Exporter en Word », l&apos;application cherche le modèle dans l&apos;ordre suivant :
        </p>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Priorité 1 :</strong> l&apos;attribution personnalisée liée au <strong>site</strong> précis.
          </li>
          <li>
            <strong>Priorité 2 :</strong> l&apos;attribution personnalisée liée à la <strong>famille</strong> du site.
          </li>
          <li>
            <strong>Priorité 3 :</strong> <em>(cas particulier des rondes)</em> le modèle lié au profil spécifique de la ronde contractuelle.
          </li>
          <li>
            <strong>Priorité 4 :</strong> le modèle par défaut global du flux (tableau 1).
          </li>
        </ol>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🛡️ Focus : le cas particulier de la ronde contractuelle</h3>
        <p className="muted">
          En plus du modèle générique <code>ronde-template.docx</code>, chaque profil de ronde configuré dans l&apos;application peut avoir son
          propre modèle dédié (dont le nom de fichier dérive directement du libellé du profil). Si aucune règle par site ou par famille n&apos;est
          configurée, l&apos;application cherchera en priorité ce fichier de profil spécifique avant de se rabattre sur la trame par défaut.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Bonnes pratiques</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Faites des tests à blanc :</strong> après chaque remplacement ou attribution de modèle, effectuez immédiatement un export Word
            réel sur une fiche clôturée pour valider la mise en page et le rendu des données.
          </li>
          <li>
            <strong>Sauvegardez vos originaux :</strong> l&apos;action de remplacement écrase définitivement le fichier précédent dans le dossier{" "}
            <code>data/templates</code>. Conservez toujours une copie de vos trames vierges sur votre ordinateur ou sur un support externe.
          </li>
        </ul>
      </div>
    </article>
  );
}
