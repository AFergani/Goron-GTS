/**
 * Rubrique Paramètres — sauvegardes PostgreSQL.
 */

export function HelpSettingsDatabaseTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">💾 Gestion de la base de données</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Gestion base de données</strong> permet de consulter les sauvegardes du dossier configuré,
        d&apos;en créer à la demande, de les comparer à la base en service et de restaurer PostgreSQL.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🚀 Mise en service (2 étapes)</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Dossier cible :</strong> choisissez un dossier de destination <strong>hors disque Docker</strong> (NAS,
            volume externe, clé USB).
          </li>
          <li>
            <strong>Activation :</strong> cliquez sur <strong>« Lancer le cycle »</strong> pour exécuter la première
            sauvegarde et activer le rythme automatique quotidien (à 3 h).
          </li>
        </ol>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">💾 Sauvegardes automatiques et copies manuelles</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Cycle automatique :</strong> l&apos;application conserve au plus 14 sauvegardes journalières et 12
            mensuelles ; les plus anciennes copies automatiques sont ensuite supprimées.
          </li>
          <li>
            <strong>Copies manuelles :</strong> « Sauvegarde rapide » et « Enregistrer sous » créent une copie
            instantanée. Elles ne sont pas comptées dans les compteurs du cycle automatique et ne sont pas
            effacées par la rotation.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚠️ Restauration et comparaison</h3>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Avertissement :</strong> une restauration remplace l&apos;intégralité de la base de données active.
        </div>
        <ul className="muted help-center-list">
          <li>
            <strong>Recommandation :</strong> utilisez <strong>Comparer</strong> avant toute restauration. L&apos;application
            charge la sauvegarde dans une base temporaire (la base en service n&apos;est pas touchée) et génère un rapport
            des fiches impactées (<em>disparaîtraient</em>, <em>reviendraient</em>, <em>écrasées</em>).
          </li>
          <li>
            <strong>Réinstallation Docker :</strong> si Docker vient d&apos;être recréé, utilisez l&apos;écran de connexion →{" "}
            <em>Restaurer une sauvegarde</em>.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🛠️ Sauvegarde hors application</h3>
        <p className="muted">
          Si l&apos;application ne peut pas être ouverte, utilisez le menu console de production (
          <code>outils_prod</code>) ou la tâche planifiée Windows (exécutée à 3 h). Docker doit être démarré. Les dumps,
          comparaisons et restaurations faits depuis l&apos;application sont consignés dans les{" "}
          <strong>logs techniques</strong> du journal des actions (le choix du dossier reste dans le journal applicatif).
        </p>
      </div>
    </article>
  );
}
