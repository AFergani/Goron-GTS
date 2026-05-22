/** Rubrique centre d’aide — main courante (signalement, suivi, clôture). */
export function HelpMainCouranteTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📒 Le module Main courante</h2>
      <p className="help-center-lead">
        La <strong>main courante</strong> est le journal d&apos;exploitation de votre activité. Contrairement aux missions planifiées (rondes,
        interventions), elle sert à consigner des <strong>informations</strong>, des <strong>événements</strong> ou des <strong>incidents</strong> au
        fil de l&apos;eau (client mécontent, site résilié, anomalie signalée, etc.).
      </p>
      <p className="help-center-lead">
        Chaque entrée suit un flux précis : elle est <strong>signalée</strong> par un opérateur, puis <strong>analysée</strong> et{" "}
        <strong>clôturée</strong> par un responsable. Ce n&apos;est pas un canal de consignes opérateur ↔ responsable, mais un outil de traçabilité
        des faits utiles à l&apos;exploitation.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Créer une entrée : par où commencer ?</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Initialisation :</strong> cliquez sur <strong>Nouvelle entrée</strong>. Votre identifiant et l&apos;horodatage de création sont
            générés automatiquement.
          </li>
          <li>
            <strong>Saisie obligatoire :</strong> sélectionnez un <strong>type d&apos;anomalie</strong> et décrivez le fait dans le champ{" "}
            <strong>Observation (opérateur)</strong> (ce qui s&apos;est passé, qui a contacté, impact sur le site, etc.).
          </li>
          <li>
            <strong>Identification du site :</strong>
            <ul className="help-center-list help-center-list--nested">
              <li>associez un site si l&apos;information concerne un lieu précis ;</li>
              <li>laissez le champ vide pour un fait général ou multi-sites ;</li>
              <li>
                utilisez <strong>Site introuvable</strong> si le site n&apos;existe pas encore dans votre base.
              </li>
            </ul>
          </li>
          <li>
            <strong>Validation :</strong> une fois enregistrée, l&apos;entrée passe au statut <strong>En attente</strong>.
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Note :</em> tant qu&apos;elle est en attente, vous pouvez modifier votre saisie. Dès qu&apos;un responsable la prend en compte,
                elle devient non modifiable pour l&apos;opérateur.
              </li>
            </ul>
          </li>
        </ol>
        <div className="help-center-callout help-center-callout--tip" role="note">
          Les types d&apos;anomalie sont configurés dans <strong>Paramètres → Gestion des données → Types d&apos;anomalie</strong>.
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Rôles et workflow : opérateur vs responsable</h3>
        <p className="muted">
          Le module repose sur une séparation des actions pour garantir la traçabilité des informations remontées :
        </p>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Rôle</th>
                <th scope="col">Action principale</th>
                <th scope="col">Impact sur le statut</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Opérateur</strong>
                </td>
                <td>Signalement d&apos;un fait, d&apos;un incident ou d&apos;une information terrain.</td>
                <td>
                  Crée l&apos;entrée (<strong>En attente</strong>).
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Responsable</strong>
                </td>
                <td>Analyse, décision et suivi du dossier.</td>
                <td>
                  Valide (<strong>En cours</strong>) ou <strong>clôture</strong> l&apos;entrée.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔄 Cycle de vie des statuts</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>En attente :</strong> entrée créée par l&apos;opérateur, en attente de lecture par un responsable.
          </li>
          <li>
            <strong>En cours :</strong> le responsable a pris en compte l&apos;événement (action <strong>À suivre</strong>). Le dossier reste ouvert
            pour des compléments ou le suivi de résolution.
          </li>
          <li>
            <strong>Clôturé :</strong> le traitement est terminé. La fiche est figée et consultable en historique.
          </li>
          <li>
            En <strong>mode dégradé</strong> (writer indisponible), une ligne peut afficher <strong>En attente DB</strong> : la saisie est conservée
            et synchronisée dès que le writer reprend.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Traiter une entrée (action responsable)</h3>
        <p className="muted">
          La clôture d&apos;une main courante est une action <strong>manuelle</strong>. Chaque intervention du responsable nécessite une{" "}
          <strong>observation responsable</strong> (retour d&apos;analyse, décision prise, suite donnée au dossier).
        </p>

        <h4 className="help-center-subsection-title">Depuis une entrée « En attente »</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>À suivre :</strong> le dossier passe <strong>en cours</strong>. L&apos;observation est horodatée.
          </li>
          <li>
            <strong>Clôturer :</strong> l&apos;entrée est classée immédiatement si aucune action supplémentaire n&apos;est requise.
          </li>
        </ul>

        <h4 className="help-center-subsection-title">Depuis une entrée « En cours »</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>À suivre :</strong> permet d&apos;ajouter une nouvelle note de suivi. Les observations successives se cumulent pour former
            l&apos;historique du dossier.
          </li>
          <li>
            <strong>Clôturer :</strong> ferme définitivement le dossier.
          </li>
          <li>
            <strong>Rouvrir :</strong> si un dossier clôturé nécessite un nouveau suivi, le responsable peut le repasser en cours.
          </li>
        </ul>
        <div className="help-center-callout help-center-callout--warn" role="note">
          Les données opérateur (type, site, information) restent en <strong>lecture seule</strong> lors du traitement responsable : seule
          l&apos;observation responsable est saisie à chaque action.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📤 Consultation et exports</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Filtres :</strong> affinez votre liste par période, type d&apos;anomalie, auteur (opérateur) ou responsable de traitement.
          </li>
          <li>
            <strong>Exporter données :</strong> télécharge en Excel le résultat actuellement filtré de la liste.
          </li>
          <li>
            <strong>Export Word :</strong> sur chaque ligne, une icône permet de générer un rapport formel de l&apos;entrée (idéal pour transmission
            ou archivage client).
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Client mécontent :</strong> appel reçu sur un site précis, plainte à tracer.
            <br />
            <strong>→</strong> créer l&apos;entrée avec le site et le type adapté ; le responsable prend en compte, suit les échanges puis clôture une
            fois le dossier traité.
          </li>
          <li>
            <strong>Site résilié :</strong> information reçue sans lieu unique ou concernant plusieurs sites.
            <br />
            <strong>→</strong> laisser le site vide si besoin, décrire le fait dans l&apos;observation ; le responsable clôture lorsque l&apos;information
            est traitée en interne.
          </li>
          <li>
            <strong>Dossier complexe :</strong> un incident nécessite plusieurs jours de résolution.
            <br />
            <strong>→</strong> le responsable utilise l&apos;action <strong>À suivre</strong> à chaque étape (appel assurance, passage expert, etc.)
            pour centraliser tout l&apos;historique avant la clôture finale.
          </li>
        </ul>
      </div>
    </article>
  );
}
