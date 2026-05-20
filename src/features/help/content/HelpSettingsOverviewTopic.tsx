export function HelpSettingsOverviewTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">⚙️ Paramètres</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Paramètres</strong> regroupe la gestion des <strong>comptes</strong>, des <strong>données de référence</strong>, des{" "}
        <strong>modèles</strong>, des <strong>champs personnalisés</strong>, de la <strong>base SQLite</strong> et du <strong>journal d&apos;audit</strong>.
      </p>
      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">Onglets et accès</h3>
        <ul className="help-center-list">
          <li>
            <strong>Journal des actions</strong> : <strong>directeur de station</strong> et <strong>responsable de station</strong> uniquement.
          </li>
          <li>
            <strong>Gestion opérateur</strong> (complet) : mêmes profils pour création, modification des comptes et des accès pages, désactivation, journal. Le{" "}
            <strong>superviseur métier</strong> accède à un écran restreint du même onglet pour <strong>réinitialiser un mot de passe</strong> ou <strong>déverrouiller</strong> un
            compte de rang strictement inférieur (sans modifier les accès aux pages).
          </li>
          <li>
            <strong>Gestion des données</strong>, <strong>modèles</strong>, <strong>variables</strong>, <strong>base de données</strong> : disponibles pour les sessions qui ont accès aux
            paramètres métier (tout utilisateur connecté avec la page Paramètres activée).
          </li>
        </ul>
      </div>
      <p className="muted">
        Sélectionnez une entrée précise dans le menu de gauche pour une aide ciblée lorsque la rubrique est disponible.
      </p>
    </article>
  );
}
