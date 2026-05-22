/** Rubrique Paramètres — journal des actions (lecture, filtres, export). */
export function HelpSettingsAuditTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📜 Journal des actions</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Journal des actions</strong> (accessible dans les <em>Paramètres</em>) affiche l&apos;historique complet des écritures
        métiers et des événements sensibles enregistrés par l&apos;application. Il consigne en temps réel les créations, modifications, suppressions,
        validations, imports de masse, ainsi que les actes d&apos;administration (gestion des comptes, changements de base, cycles d&apos;archivage).
      </p>
      <p className="help-center-lead">
        Cet écran est un outil d&apos;analyse indispensable pour le <strong>support technique</strong>, le <strong>contrôle de conformité</strong> et
        le <strong>diagnostic après incident</strong> sur la station.
      </p>
      <div className="help-center-callout help-center-callout--tip" role="note">
        <strong>Information :</strong> les actions de consultation simple (navigation, lecture d&apos;un écran, affichage d&apos;une liste) ne
        génèrent aucune écriture afin de ne pas surcharger le journal.
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits : qui peut consulter le journal ?</h3>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Rappel :</strong> cet onglet et sa documentation sont strictement réservés aux profils d&apos;encadrement habilités à administrer la
          station et à gérer les comptes utilisateurs.
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
                  <strong>Directeur de station</strong>
                  <br />
                  <strong>Responsable de station</strong>
                </td>
                <td>
                  <strong>Consultation et exploitation complètes :</strong> accès total aux filtres de recherche, à la pagination, à l&apos;export Excel
                  et au bouton d&apos;ouverture des logs techniques du service <em>writer</em>.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Superviseur</strong>
                  <br />
                  <strong>Opérateur</strong>
                </td>
                <td>
                  <strong>Aucun accès :</strong> l&apos;onglet est invisible et la rubrique d&apos;aide est automatiquement masquée sur leur session.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📌 Périmètre et volumétrie du journal</h3>
        <p className="muted">
          Le journal centralise deux grandes catégories d&apos;événements, toujours formulés en français clair sous la forme{" "}
          <strong>[Domaine] Libellé explicite</strong> (ex. <em>[Main courante] Création d&apos;une information</em>) :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Les actions métiers :</strong> saisies et modifications sur la main courante, les interventions, les rondes, le gardiennage, le
            module Fransor, les trames Word, les variables et les référentiels de sites ou d&apos;intervenants.
          </li>
          <li>
            <strong>La sécurité et l&apos;administration :</strong> connexions aux postes, créations et désactivations de comptes, réinitialisations de
            mots de passe, modifications de droits ou changements de bases de données.
          </li>
          <li>
            <strong>Les imports de lots :</strong> les rapports d&apos;importation de masse (nombre de succès / échecs) sont regroupés sous une seule
            ligne ; le détail des erreurs ligne par ligne reste accessible au survol.
          </li>
        </ul>
        <h4 className="help-center-subsection-title">Capacité d&apos;affichage de l&apos;écran</h4>
        <p className="muted">
          L&apos;interface charge en continu les <strong>1 000 entrées les plus récentes</strong> et s&apos;actualise automatiquement tant que
          l&apos;onglet reste ouvert. Un bandeau informatif vous indique le nombre total de lignes contenues dans la base de données ainsi que la date de
          l&apos;enregistrement le plus ancien. L&apos;historique total en base peut donc être beaucoup plus profond que les 1 000 lignes affichées à
          l&apos;écran.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Guide de lecture du tableau</h3>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Colonne</th>
                <th scope="col">Signification</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Date</strong>
                </td>
                <td>Horodatage précis de l&apos;événement (format français JJ/MM/AAAA HH:MM:SS).</td>
              </tr>
              <tr>
                <td>
                  <strong>Acteur</strong>
                </td>
                <td>
                  Identité de l&apos;utilisateur à l&apos;origine de l&apos;action. <em>Astuce : le survol de la cellule permet d&apos;afficher la
                  cible (le compte ou l&apos;entité) impactée par son action.</em>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Famille</strong>
                </td>
                <td>
                  Catégorie de l&apos;événement sous forme de badge couleur (<em>Main courante, Intervention, Rondes, Fransor, Référentiels,
                  Utilisateurs, Système</em>).
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Donnée</strong>
                </td>
                <td>
                  Le libellé fonctionnel de l&apos;action. <strong>Survolez cette cellule</strong> pour faire apparaître instantanément les valeurs «
                  avant / après » une modification, le motif d&apos;une suppression ou le résumé d&apos;un import.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Statut</strong>
                </td>
                <td>
                  Résultat de l&apos;opération représenté par une icône (<em>Succès, Erreur, Avertissement ou En attente</em>).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔎 Outils de recherche et filtres multicritères</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Pour isoler précisément un événement, vous pouvez combiner les filtres de la barre d&apos;actions :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Date du / Date au :</strong> délimite la fenêtre de temps à analyser.
          </li>
          <li>
            <strong>Acteur :</strong> isole les actions d&apos;un collaborateur spécifique.
          </li>
          <li>
            <strong>Famille :</strong> filtre par grand domaine fonctionnel.
          </li>
          <li>
            <strong>Cible :</strong> permet de suivre l&apos;historique lié à un élément ou un compte utilisateur précis.
          </li>
          <li>
            <strong>Statut :</strong> permet de cibler uniquement les dysfonctionnements (filtre <em>Erreur</em> ou <em>Avertissement</em>).
          </li>
        </ul>
        <h4 className="help-center-subsection-title">Boutons d&apos;action (à droite des filtres)</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Ouvrir le dossier des logs writer</strong> : accès direct aux fichiers textes de diagnostic du service de synchronisation réseau
            (TCP).
          </li>
          <li>
            <strong>Exporter le journal en Excel</strong> : génère un fichier <code>.xlsx</code> de l&apos;intégralité des lignes correspondant à vos
            filtres actifs (et pas seulement de la page visible). L&apos;export intègre les colonnes de base ainsi qu&apos;un champ de détails structurés
            pour vos analyses approfondies.
          </li>
          <li>
            <strong>Réinitialiser les filtres</strong> : vide tous les critères de recherche et vous repositionne sur la première page du journal
            chargé.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📄 Pagination des résultats</h3>
        <p className="muted">
          Les lignes filtrées s&apos;affichent par blocs de <strong>100 entrées maximum par page</strong>. Les boutons <strong>Précédent</strong> et{" "}
          <strong>Suivant</strong> vous permettent de feuilleter les résultats. Un compteur placé sous le tableau vous indique en permanence la page
          courante et le volume total de lignes isolées par vos filtres.
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🛠️ Distinction : journal applicatif vs logs writer</h3>
        <p className="muted">
          Il est important de ne pas confondre ces deux sources de traçabilité lors d&apos;un diagnostic :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Le journal des actions (cet écran) :</strong> trace le comportement métier des utilisateurs (qui a cliqué, modifié ou supprimé quoi).
          </li>
          <li>
            <strong>Les logs writer (fichiers textes) :</strong> documentent la tuyauterie technique et réseau du service d&apos;écriture (connexions TCP
            entre postes, bascules Master / Backup, gestion de la file d&apos;attente SMB).
          </li>
        </ul>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>En cas d&apos;incident réseau ou de problème de synchronisation</strong> entre les postes de la station, croisez systématiquement ces
          deux sources d&apos;informations.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Bonnes pratiques d&apos;exploitation</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Analyse post-incident terrain :</strong> si un agent signale un comportement anormal, appliquez immédiatement un filtre sur la date
            de l&apos;incident, ciblez la famille concernée et isolez le statut <em>Erreur</em> pour identifier l&apos;action qui a déclenché le blocage.
          </li>
          <li>
            <strong>Contrôle d&apos;administration :</strong> après avoir créé ou modifié les droits d&apos;un agent, utilisez le filtre <em>Cible</em> sur
            son compte pour valider que toutes les écritures de sécurité ont bien été enregistrées.
          </li>
          <li>
            <strong>Archivage et sauvegarde externe :</strong> exportez régulièrement au format Excel le journal lors des périodes clés (clôtures
            mensuelles, vagues d&apos;imports massifs de sites) afin de conserver un historique accessible hors application.
          </li>
          <li>
            <strong>Le réflexe du survol :</strong> avant d&apos;ouvrir un ticket d&apos;assistance, survolez la colonne <em>Donnée</em> : la bulle
            d&apos;aide contient souvent la cause technique d&apos;une erreur ou l&apos;état initial d&apos;une donnée modifiée.
          </li>
        </ul>
      </div>
    </article>
  );
}
