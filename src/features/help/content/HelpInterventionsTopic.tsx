export function HelpInterventionsTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📋 Interventions</h2>
      <p className="help-center-lead">
        Cette page permet de suivre une intervention de la <strong>demande initiale</strong> jusqu&apos;à la <strong>clôture</strong>, avec le
        statut opérationnel et, pour les profils autorisés, la <strong>facturation</strong>.
      </p>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔍 Filtrer la liste</h3>
        <ul className="muted help-center-list">
          <li>
            Utilisez la <strong>recherche</strong> et les filtres : date, <strong>famille</strong> de site, <strong>prestataire</strong>,{" "}
            <strong>statut</strong> (en cours, clôturé, annulé).
          </li>
          <li>
            Le bouton de <strong>réinitialisation</strong> (icône) remet tous les filtres à zéro.
          </li>
          <li>Les colonnes du tableau sont <strong>triables</strong> (date, site, motif, prestataire, heures, délai, état).</li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Créer une intervention</h3>
        <ul className="muted help-center-list">
          <li>
            Cliquez sur <strong>Nouvelle intervention</strong>, puis renseignez les champs obligatoires (site, prestataire, date et heure de
            demande, motif, etc.).
          </li>
          <li>
            Si un site ou un prestataire est introuvable, ouvrez <strong>Site introuvable</strong> ou <strong>Prestataire introuvable</strong> :
            la proposition est enregistrée en attente au moment où vous validez la création de l&apos;intervention.
          </li>
          <li>
            Les <strong>dates et heures d&apos;arrivée / de départ</strong> peuvent être saisies à la création ou plus tard ; par défaut, elles
            s&apos;alignent sur la date de demande. Une intervention de nuit après minuit peut faire évoluer la <strong>date logique</strong> du
            passage.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔄 Suivre le cycle de vie</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>En cours</strong> : le bouton de validation (coche) ouvre la fiche pour compléter le passage et <strong>clôturer</strong>{" "}
            ou <strong>annuler</strong> l&apos;intervention.
          </li>
          <li>
            <strong>Clôturé / Annulé</strong> : le bouton œil permet de rouvrir la fiche (consultation, réouverture ou facturation selon votre
            rôle).
          </li>
          <li>
            Le <strong>compte rendu</strong> peut être renseigné à la clôture ; il n&apos;est pas obligatoire pour conserver la trace de la
            demande.
          </li>
          <li>
            En <strong>mode dégradé</strong> (writer indisponible), une ligne peut afficher <strong>En attente DB</strong> : la saisie est
            conservée et synchronisée dès que le writer reprend.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔗 Liens métier (selon vos droits)</h3>
        <ul className="muted help-center-list">
          <li>
            Depuis une intervention <strong>en cours</strong>, vous pouvez créer une <strong>ronde liée</strong> (suite intervention) ou un{" "}
            <strong>gardiennage lié</strong> si les pages correspondantes vous sont accessibles.
          </li>
          <li>
            Depuis une ronde ou un gardiennage, la navigation peut rouvrir l&apos;intervention d&apos;origine dans cette liste.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💶 Facturation (responsable)</h3>
        <ul className="muted help-center-list">
          <li>
            Pour une intervention <strong>clôturée</strong>, l&apos;ouverture peut proposer le mode <strong>facturation</strong> : statut
            facturable ou non facturable, avec motif si besoin.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📤 Exporter</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Exporter données</strong> : télécharge en Excel le résultat actuellement <strong>filtré</strong> de la liste.
          </li>
          <li>
            Sur une intervention <strong>clôturée</strong> ou <strong>annulée</strong>, l&apos;icône d&apos;export permet de télécharger le
            compte rendu en <strong>Word</strong> (modèle configuré dans Paramètres → Gestion modèles).
          </li>
        </ul>
      </div>
    </article>
  );
}
