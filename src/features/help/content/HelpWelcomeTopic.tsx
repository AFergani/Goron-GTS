export function HelpWelcomeTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🏠 Centre d&apos;aide Goron-GTS</h2>
      <p className="help-center-lead">
        Retrouvez ici les explications sur les <strong>fonctions principales</strong> de l&apos;application. Utilisez le menu de gauche :
        chaque <strong>page</strong> du bandeau latéral peut avoir des <strong>sous-sections</strong> (notamment sous Paramètres).
      </p>
      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">Comment naviguer</h3>
        <ul className="help-center-list">
          <li>
            <strong>Niveau 1</strong> : les modules métier (Interventions, Rondes, etc.) — visibles selon vos droits de consultation.
          </li>
          <li>
            <strong>Niveau 2</strong> : sous les Paramètres, chaque onglet (Gestion des données, Base de données…).
          </li>
          <li>
            <strong>Niveau 3</strong> : lorsqu&apos;un onglet contient plusieurs volets (ex. Gestion des données → Sites, Intervenants…).
          </li>
        </ul>
      </div>
      <div className="help-center-card">
        <h3 className="help-center-card-title">Rubriques déjà détaillées</h3>
        <ul className="help-center-list">
          <li>
            <strong>Interventions</strong> : filtrage, création, cycle de vie, exports et liens ronde / gardiennage.
          </li>
          <li>
            <strong>Rondes</strong> : contractuelle, exceptionnelle, programmations, fiches de passage et exports Word.
          </li>
          <li>
            <strong>Gardiennage</strong> : création et choix du mode de planification, lignes récurrentes, clôture terrain.
          </li>
          <li>
            <strong>Paramètres → Gestion base de données</strong> : base partagée, archivage, fichier writer, réseau.
          </li>
          <li>
            <strong>Paramètres → Gestion modèles</strong> et <strong>Gestion variables</strong> : exports Word et champs personnalisés.
          </li>
        </ul>
      </div>
    </article>
  );
}
