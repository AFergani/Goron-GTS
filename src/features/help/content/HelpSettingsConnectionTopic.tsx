/**
 * Rubrique Paramètres — connexion au serveur PostgreSQL (hors onglet sauvegardes).
 */

export function HelpSettingsConnectionTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🔌 Connexion PostgreSQL</h2>
      <p className="help-center-lead">
        Goron GTS enregistre les données dans PostgreSQL. L&apos;hôte, le port, le nom de la base et le compte technique se
        règlent <strong>hors des Paramètres</strong> : au premier lancement du poste, ou depuis l&apos;écran de connexion si
        la base est injoignable. L&apos;onglet <em>Gestion base de données</em> ne sert qu&apos;aux sauvegardes.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits</h3>
        <div className="help-center-table-wrap">
          <table className="help-center-table help-center-table--profile">
            <thead>
              <tr>
                <th scope="col">Votre profil</th>
                <th scope="col">Droits</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Directeur de station</strong>
                  <br />
                  <strong>Responsable de station</strong>
                  <br />
                  <strong>Admin</strong>
                </td>
                <td>
                  Consulter cette rubrique. Sur le poste, modifier l&apos;hôte / le mot de passe technique depuis l&apos;écran
                  de connexion lorsque PostgreSQL ne répond pas.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Superviseur</strong>
                  <br />
                  <strong>Opérateur</strong>
                </td>
                <td>
                  <strong>Pas de rubrique d&apos;aide</strong> dans le centre. En cas de base injoignable, le lien{" "}
                  <em>Base de données inaccessible ?</em> reste disponible sur l&apos;écran de connexion (à n&apos;utiliser
                  qu&apos;avec un encadrant).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📍 Où se règle la connexion</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Premier lancement du poste :</strong> écran « Initialisation GTS » avant tout identifiant. Indiquez le
            serveur de la station, testez, puis enregistrez.
          </li>
          <li>
            <strong>Base injoignable plus tard :</strong> écran de connexion → <em>Base de données inaccessible ?</em> Le
            formulaire reprend l&apos;hôte, le port, la base et le compte technique déjà mémorisés sur ce PC.
          </li>
        </ul>
        <p className="muted">
          Le mot de passe technique est stocké <strong>chiffré sur ce poste uniquement</strong> ; il n&apos;est jamais
          réaffiché. Un 2e poste n&apos;hérite pas de cette configuration : il faut la saisir localement.
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🖥️ Poste hôte et autres PC</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>PC qui héberge Docker / PostgreSQL :</strong> hôte <code>127.0.0.1</code> (ou localhost), port{" "}
            <code>5432</code> en labo. C&apos;est aussi le seul poste qui lance les dumps automatiques à 3 h.
          </li>
          <li>
            <strong>Autre poste du LAN :</strong> adresse IP du PC hôte (ex. 192.168.x.x), <strong>pas</strong> localhost —
            localhost pointerait vers la machine locale, sans base.
          </li>
        </ul>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Avant d&apos;enregistrer :</strong> « Tester la connexion ». Docker Desktop et le conteneur doivent
          tourner. Si le test échoue, corrigez l&apos;hôte ou relancez PostgreSQL plutôt que d&apos;écraser une config
          encore valable.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 En cas de voyant DB rouge</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>Vérifiez Docker / PostgreSQL sur le PC hôte, puis le réseau du poste client.</li>
          <li>
            Sur l&apos;écran de connexion, ouvrez <em>Base de données inaccessible ?</em> uniquement si l&apos;adresse IP
            a changé (nouveau réseau) ou si le mot de passe technique doit être resaisi.
          </li>
          <li>
            Pour récupérer un dump, utilisez <em>Restaurer une sauvegarde</em> (PostgreSQL doit déjà répondre). Détail :
            rubrique <em>Gestion base de données</em>.
          </li>
        </ol>
      </div>
    </article>
  );
}
