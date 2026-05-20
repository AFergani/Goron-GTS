/**
 * Section d'aide commune : bascule affichage journée / liste (Rondes, Gardiennage, etc.).
 */
export function HelpDayListDisplaySection() {
  return (
    <div className="help-center-card help-center-card--accent">
      <h3 className="help-center-card-title">👁️ Affichage journée / liste</h3>
      <ul className="muted help-center-list">
        <li>
          <strong>Affichage journée</strong> : sélectionnez une date (flèches, calendrier, retour à aujourd&apos;hui). Seuls
          les éléments <strong>pertinents pour cette date</strong> sont affichés (créneaux ou fiches actifs selon la page ;
          hors clôturés et annulés lorsque la page le prévoit).
        </li>
        <li>
          <strong>Affichage liste</strong> : vue sur une période avec filtres (<strong>Recherche</strong>, dates{" "}
          <strong>Du / Au</strong>, <strong>famille</strong>, <strong>prestataire</strong>, <strong>statut</strong>),
          pagination et colonnes de synthèse (période, statut, etc.).
        </li>
        <li>Le mode choisi est <strong>mémorisé entre les sessions</strong>.</li>
        <li>
          <strong>Exporter données</strong> (Excel) n&apos;est disponible qu&apos;en <strong>liste</strong>, sur le
          résultat filtré. En mode journée, utilisez la vue liste si vous avez besoin d&apos;un export.
        </li>
        <li>Le bouton de réinitialisation des filtres remet les critères de liste à zéro.</li>
      </ul>
    </div>
  );
}
