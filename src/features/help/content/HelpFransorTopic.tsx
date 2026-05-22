/** Rubrique centre d’aide — accompagnement Fransor (ouvertures / fermetures, récap). */
export function HelpFransorTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📅 L&apos;accompagnement Fransor</h2>
      <p className="help-center-lead">
        Le module <strong>Fransor</strong> permet de tracer, jour par jour, les actions d&apos;ouverture et de fermeture réalisées
        spécifiquement pour le client Fransor.
      </p>
      <p className="help-center-lead">
        Ce module n&apos;est pas un outil de suivi terrain classique : il s&apos;agit d&apos;un <strong>outil de pilotage et de reporting interne</strong>{" "}
        qui comptabilise les actions par responsable afin de faciliter la facturation mensuelle.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Avant de commencer (prérequis)</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Référentiel des responsables :</strong> la liste des personnes pouvant être associées à une ouverture ou une fermeture se gère
            dans <strong>Paramètres → Gestion des données → Fransor</strong>.
          </li>
          <li>
            <strong>Calendrier de base :</strong> par défaut, le système attend des actions uniquement sur les <strong>jours ouvrés</strong> (du lundi
            au vendredi). Les week-ends et les jours fériés (issus du référentiel commun) sont automatiquement considérés comme non prévus, sauf
            exception.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Saisir une journée : par où commencer ?</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Sélection du mois :</strong> utilisez le sélecteur de mois ou les flèches de navigation. L&apos;icône de réinitialisation vous
            ramène instantanément au mois en cours.
          </li>
          <li>
            <strong>Saisie du jour J :</strong> la ligne <strong>Journée</strong> en haut de l&apos;écran vous permet de renseigner rapidement les
            actions du jour même.
          </li>
          <li>
            <strong>Saisie sur le calendrier :</strong> cliquez directement sur une date du mois pour ouvrir la fenêtre de saisie.
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Astuce :</em> utilisez les filtres <strong>À compléter</strong> (journées passées incomplètes) et <strong>Renseignées</strong>{" "}
                (journées terminées) pour contrôler votre avancement.
              </li>
            </ul>
          </li>
          <li>
            <strong>Validation des badges :</strong> <strong>O</strong> correspond à l&apos;ouverture et <strong>F</strong> à la fermeture. Un badge{" "}
            <strong>vert</strong> indique que l&apos;action est enregistrée, un badge <strong>rouge</strong> indique qu&apos;elle est manquante.
          </li>
        </ol>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>Règle de saisie :</strong> l&apos;ouverture et la fermeture d&apos;une même journée peuvent être attribuées à deux responsables
          différents. Une journée validée reste modifiable à tout moment pour corriger un nom ou désactiver une action.
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Gestion des types de journées</h3>
        <p className="muted">Le système adapte ses attentes selon la nature du jour :</p>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Situation</th>
                <th scope="col">Statut de la journée</th>
                <th scope="col">Attente du système</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Jour ouvré standard</strong>
                </td>
                <td>Prévue</td>
                <td>Ouverture et fermeture obligatoires.</td>
              </tr>
              <tr>
                <td>
                  <strong>Week-end ou jour férié</strong>
                </td>
                <td>Non prévue</td>
                <td>Aucune action attendue par défaut.</td>
              </tr>
              <tr>
                <td>
                  <strong>Période d&apos;exception « Fermeture »</strong>
                </td>
                <td>Exclue</td>
                <td>Sortie temporaire du suivi (ex. fermeture annuelle, congés).</td>
              </tr>
              <tr>
                <td>
                  <strong>Période d&apos;exception « Ouverture »</strong>
                </td>
                <td>Prévue (exception)</td>
                <td>Rend la journée obligatoire, même un week-end ou un jour férié.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📆 Gérer les périodes exceptionnelles</h3>
        <p className="muted">
          Le bouton <strong>Périodes exceptionnelles</strong> permet d&apos;ajuster le calendrier pour l&apos;adapter aux réalités du terrain
          (fermetures exceptionnelles).
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Création :</strong> renseignez la date de début, la date de fin, le type (<strong>Ouverture</strong> ou{" "}
            <strong>Fermeture</strong>) et un motif explicite.
          </li>
          <li>
            <strong>Priorité des règles :</strong> en cas de chevauchement sur une même date, la règle la plus récente ou une instruction
            d&apos;ouverture explicite l&apos;emporte toujours.
          </li>
          <li>
            <strong>Suppression :</strong> vous pouvez modifier ou supprimer une exception depuis le tableau de gestion. La suppression nécessite
            obligatoirement la saisie d&apos;un motif.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📊 Récapitulatif mensuel et exports</h3>
        <p className="muted">
          Le tableau <strong>Récap mensuel</strong> compile automatiquement l&apos;activité de chaque responsable actif sur le mois sélectionné
          (nombre d&apos;ouvertures, de fermetures et total global).
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Copier le récap :</strong> génère un texte de synthèse directement dans votre presse-papiers, idéal pour être collé dans un
            e-mail ou un message rapide.
          </li>
          <li>
            <strong>Export Word :</strong> l&apos;icône de téléchargement produit un document formel à partir du modèle configuré dans{" "}
            <strong>Paramètres → Gestion modèles</strong>.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Une journée classique en semaine :</strong> l&apos;agent A ouvre le matin et l&apos;agent B ferme le soir.
            <br />
            <strong>→</strong> ouvrez la date, cochez <em>Ouverture</em> (sélectionnez A) et cochez <em>Fermeture</em> (sélectionnez B). Les deux
            badges passent au vert.
          </li>
          <li>
            <strong>Fermeture pour congés (ex. du 15 au 20 août) :</strong> aucun mouvement ne doit être réclamé par le système.
            <br />
            <strong>→</strong> créez une période exceptionnelle de type <em>Fermeture</em> avec le motif « Congés ».
          </li>
          <li>
            <strong>Astreinte un samedi férié :</strong> un événement exige une ouverture exceptionnelle.
            <br />
            <strong>→</strong> créez une période exceptionnelle de type <em>Ouverture</em> pour ce samedi précis. Saisissez ensuite vos responsables
            O / F normalement.
          </li>
          <li>
            <strong>Fin de mois réglementaire :</strong> préparation de la facturation.
            <br />
            <strong>→</strong> filtrez sur <strong>À compléter</strong> pour rattraper les oublis, vérifiez le tableau <strong>Récap mensuel</strong>,
            puis copiez les données pour transmission au client.
          </li>
        </ul>
      </div>
    </article>
  );
}
