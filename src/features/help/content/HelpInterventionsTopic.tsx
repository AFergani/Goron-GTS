/** Rubrique centre d’aide — module Interventions (cycle de vie, clôture, exports). */
export function HelpInterventionsTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📋 Le module Interventions</h2>
      <p className="help-center-lead">
        Le module <strong>Interventions</strong> centralise le suivi complet d&apos;une mission terrain : de la prise de commande initiale
        jusqu&apos;au retour d&apos;exécution et à la clôture administrative.
      </p>
      <p className="help-center-lead">
        Contrairement aux autres modules, chaque intervention est une <strong>fiche unique</strong> qui nécessite une action manuelle de
        l&apos;exploitant pour être finalisée.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Créer une intervention : par où commencer ?</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Initialisation :</strong> cliquez sur <strong>Nouvelle intervention</strong>. Renseignez obligatoirement le{" "}
            <strong>Site</strong>, le <strong>Prestataire</strong>, la <strong>Date/Heure de demande</strong> et le <strong>Motif</strong>.
          </li>
          <li>
            <strong>Gestion des imprévus :</strong> si un site ou un prestataire n&apos;existe pas encore dans la base, utilisez les fonctions{" "}
            <strong>Site introuvable</strong> ou <strong>Prestataire introuvable</strong> pour créer une référence temporaire.
          </li>
          <li>
            <strong>Enregistrement :</strong> lors de la création, vous ne saisissez que les données de la demande. Les informations de passage
            (horaires réels, compte rendu) seront complétées une fois la mission effectuée.
          </li>
          <li>
            <strong>Accès rapide :</strong> dans la liste, l&apos;icône de validation (coche) permet d&apos;ouvrir directement la fiche pour saisir
            le retour terrain ou procéder à la clôture.
          </li>
        </ol>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Demande initiale vs retour terrain</h3>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Étape</th>
                <th scope="col">Informations à saisir</th>
                <th scope="col">Moment de saisie</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>La demande</strong>
                </td>
                <td>Site, prestataire, date/heure souhaitée, motif détaillé.</td>
                <td>
                  <strong>À la création</strong> (obligatoire).
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Le passage</strong>
                </td>
                <td>Heures réelles (arrivée / départ), n° de bon d&apos;intervention, compte rendu.</td>
                <td>
                  <strong>Après la mission</strong> (avant clôture).
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Variables</strong>
                </td>
                <td>Champs complémentaires personnalisés (selon configuration).</td>
                <td>
                  <strong>Facultatif</strong> (utile pour l&apos;export Word).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>Note sur les horaires :</strong> pour une intervention de nuit (ex. arrivée 23h30, départ 01h15), l&apos;application calcule
          automatiquement la <strong>date logique</strong> du passage pour vos statistiques.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Clôturer une intervention</h3>
        <p className="muted">
          La clôture est une action <strong>manuelle et explicite</strong>. Il n&apos;y a aucune clôture automatique dans ce module.
        </p>
        <p className="muted">Pour être clôturée, une fiche doit impérativement comporter :</p>
        <ul className="muted help-center-list">
          <li>une date et heure d&apos;arrivée valides ;</li>
          <li>une date et heure de départ valides ;</li>
          <li>un numéro de bon d&apos;intervention ;</li>
          <li>un compte rendu textuel.</li>
        </ul>
        <p className="muted">
          Une fois clôturée, la fiche passe en lecture seule. En cas d&apos;erreur, vous devez cliquer sur <strong>Rouvrir</strong> pour modifier
          les informations.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔄 Cycle de vie et liens métiers</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>En cours :</strong> mission enregistrée, en attente de retour terrain ou de clôture.
          </li>
          <li>
            <strong>Annulé :</strong> mission abandonnée (un motif d&apos;annulation est obligatoire).
          </li>
          <li>
            <strong>Prolongation :</strong> depuis une intervention en cours, vous pouvez générer en un clic une <strong>ronde liée</strong> ou un{" "}
            <strong>gardiennage lié</strong>. Le site et le contexte sont automatiquement repris.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💶 Facturation et exports (profils autorisés)</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Facturation :</strong> les responsables peuvent ouvrir une fiche clôturée pour définir si elle est <strong>facturable</strong> ou{" "}
            <strong>non facturable</strong> (une justification est requise dans ce dernier cas).
          </li>
          <li>
            <strong>Export Word :</strong> sur une fiche clôturée, générez un rapport d&apos;intervention professionnel basé sur vos modèles
            personnalisés.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Intervention de nuit :</strong> agent arrivé à 23h30 et reparti à 01h15.
            <br />
            <strong>→</strong> ajustez simplement les dates et heures dans la partie passage terrain. Le système gère le chevauchement de date.
          </li>
          <li>
            <strong>Annulation :</strong> le client annule alors que l&apos;agent est déjà en route.
            <br />
            <strong>→</strong> cliquez sur <strong>Annuler</strong> et précisez le motif (ex. « Annulation client tardive »). Aucune donnée de
            passage n&apos;est alors requise.
          </li>
        </ul>
      </div>
    </article>
  );
}
