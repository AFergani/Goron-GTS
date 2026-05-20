export function HelpSettingsAuditTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📜 Journal des actions</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Journal des actions</strong> (Paramètres) affiche l&apos;<strong>historique des écritures métier</strong> enregistrées côté
        application : créations, modifications et suppressions traçables, avec l&apos;acteur, le domaine fonctionnel et le résultat de l&apos;opération.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔒 Qui peut consulter cette page</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Directeur de station</strong> et <strong>responsable de station</strong> (profils autorisés à la gestion des comptes et à cette consultation).
          </li>
          <li>
            Les autres profils (dont superviseur métier sans ces droits) <strong>n&apos;ont pas accès</strong> à cet onglet ni à cette rubrique d&apos;aide.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📌 Rôle du journal</h3>
        <ul className="muted help-center-list">
          <li>
            Il sert au <strong>support</strong>, à la <strong>conformité</strong> et au <strong>diagnostic</strong> après une action sensible (comptes, données,
            interventions, main courante, Fransor, etc.).
          </li>
          <li>
            Les <strong>consultations simples</strong> (listes, navigation, affichage d&apos;écran) ne déclenchent en principe <strong>aucune ligne</strong> dans ce journal :
            il reflète surtout les <strong>écritures</strong> métier (création, mise à jour, suppression, validations, etc.). Des{" "}
            <strong>événements de sécurité</strong> peuvent aussi apparaître (ex. <strong>connexion</strong>), sans équivalent pour chaque lecture d&apos;écran.
          </li>
          <li>
            Les libellés affichés sont en français ; ils sont alignés sur les actions métier (souvent sous la forme{" "}
            <strong>[Page ou domaine] Libellé explicite</strong>).
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📋 Colonnes du tableau</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Date</strong> : horodatage de l&apos;action (affichage adapté à la locale française dans l&apos;interface).
          </li>
          <li>
            <strong>Acteur</strong> : utilisateur à l&apos;origine de l&apos;écriture. Un survol peut afficher une <strong>cible</strong> associée lorsque le système la
            transmet (compte ou entité concernée).
          </li>
          <li>
            <strong>Famille</strong> : regroupement par domaine (ex. Main courante, Fransor, Référentiels, Utilisateurs, Rondes, etc.).
          </li>
          <li>
            <strong>Donnée</strong> : nature de l&apos;action en libellé métier.
          </li>
          <li>
            <strong>Statut</strong> : résultat de l&apos;opération (succès, erreur ou état intermédiaire selon les cas).
          </li>
        </ul>
        <p className="muted">
          Certaines lignes exposent des <strong>informations détaillées au survol</strong> (anciennes valeurs, résumés d&apos;import, motifs de suppression, etc.).
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📄 Pagination et export</h3>
        <ul className="muted help-center-list">
          <li>
            La liste est paginée (par exemple <strong>100 entrées par page</strong>) ; utilisez <strong>Précédent</strong> / <strong>Suivant</strong> pour parcourir les résultats filtrés.
          </li>
          <li>
            <strong>Exporter le journal en Excel</strong> produit un fichier à partir des entrées <strong>correspondant aux filtres actifs</strong> (pas seulement la page à l&apos;écran).
          </li>
          <li>
            En tête de page, un résumé indique la <strong>plus ancienne entrée connue</strong> et le <strong>nombre total</strong> d&apos;entrées en base pour ce journal.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔎 Filtres</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Date du / Date au</strong> : limite la période analysée.
          </li>
          <li>
            <strong>Acteur</strong> : restreint aux actions d&apos;un utilisateur.
          </li>
          <li>
            <strong>Famille</strong> : filtre par domaine fonctionnel.
          </li>
          <li>
            <strong>Cible</strong> : lorsque renseignée dans les journaux, permet de suivre les actions relatives à une cible donnée.
          </li>
          <li>
            <strong>Statut</strong> : filtre par résultat (succès, erreur, etc.).
          </li>
        </ul>
        <p className="muted">
          Le bouton <strong>Réinitialiser les filtres</strong> remet tous les critères à leur valeur par défaut et revient à la première page.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🛠️ Logs techniques (writer)</h3>
        <p className="muted">
          Le bouton pour <strong>ouvrir le dossier des logs writer</strong> renvoie vers les fichiers techniques du service d&apos;écriture (réseau, bascule Master /
          Backup). Cela complète le journal des actions applicatif mais ne le remplace pas.
        </p>
      </div>
    </article>
  );
}
