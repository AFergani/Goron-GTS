export function HelpSettingsVariablesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🔧 Gestion des variables</h2>
      <p className="help-center-lead">
        Cet onglet centralise les <strong>champs personnalisés</strong> affichés dans les formulaires métier (rondes, intervention, main courante,
        gardiennage, etc.). Chaque variable possède un libellé lisible, un nom technique dérivé pour l&apos;intégration aux modèles, une{" "}
        <strong>portée</strong> (tous les sites, un site ou une famille) et des <strong>attributions</strong> aux formulaires et aux profils de ronde contractuelle.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">👤 Qui peut modifier</h3>
        <ul className="muted help-center-list">
          <li>
            Les profils <strong>responsable</strong> peuvent <strong>créer</strong>, <strong>modifier</strong> et <strong>supprimer</strong> des variables ;
            chaque action est enregistrée <strong>immédiatement</strong> en base.
          </li>
          <li>
            Les <strong>opérateurs</strong> voient la liste en <strong>consultation</strong> ; les actions d&apos;édition ne sont pas disponibles.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Tableau principal</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Libellé</strong> : nom du champ tel qu&apos;il apparaît dans les formulaires.
          </li>
          <li>
            <strong>Variable</strong> : identifiant technique du champ (généré à partir du libellé à la création ; utilisé pour la cohérence avec les exports et modèles).
          </li>
          <li>
            <strong>Type</strong> : texte court, texte long, nombre, heure ou liste déroulante.
          </li>
          <li>
            <strong>Portée</strong> : « Tous », un <strong>site</strong> précis du référentiel, ou une <strong>famille</strong> de sites (saisie normalisée).
          </li>
          <li>
            <strong>Formulaires</strong> : formulaires métier auxquels le champ est rattaché (plusieurs choix possibles).
          </li>
          <li>
            <strong>Profils ronde contractuelle</strong> : si la variable cible la ronde contractuelle sans profil listé, « Toutes » ; sinon les libellés des profils choisis ; tiret si la cible ne concerne pas ce cas.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Barre d&apos;actions</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Actualiser</strong> : recharge la liste depuis la base (utile si un autre poste a modifié les variables).
          </li>
          <li>
            <strong>Ajouter une variable</strong> : ouvre la modale de création ; la validation <strong>Enregistrer</strong> écrit tout de suite en base.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">➕ Modale « Ajouter / Modifier »</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Enregistrer</strong> : applique immédiatement les changements en base (création ou modification).
          </li>
          <li>
            <strong>Libellé</strong> : obligatoire ; sert aussi à produire le nom de variable technique si vous créez une nouvelle entrée.
          </li>
          <li>
            <strong>Placeholder</strong> : texte d&apos;aide affiché dans le champ vide (facultatif).
          </li>
          <li>
            <strong>Type</strong> : au choix — texte court, texte long, nombre, heure, liste déroulante. Pour une <strong>liste</strong>, indiquez les valeurs séparées par des{" "}
            <strong>virgules</strong>.
          </li>
          <li>
            <strong>Variable technique</strong> : pour les types autres que « liste déroulante », champ en lecture seule montrant l&apos;identifiant dérivé du libellé (minuscules,
            underscores, règles produit). Pour une <strong>liste déroulante</strong>, la même ligne sert à saisir les <strong>valeurs</strong> séparées par des virgules.
          </li>
          <li>
            <strong>Portée</strong> : « Tous les sites/familles », un <strong>site</strong> choisi via la recherche, ou une <strong>famille</strong> (suggestions après quelques caractères saisis).
          </li>
          <li>
            <strong>Formulaires</strong> : activez au moins un formulaire cible parmi ronde contractuelle, ronde exceptionnelle, intervention, main courante, gardiennage (interrupteurs dédiés).
          </li>
          <li>
            <strong>Profils ronde contractuelle</strong> : sans profil coché, le champ s&apos;applique à <strong>toutes</strong> les rondes contractuelles ; cochez un ou plusieurs profils pour restreindre. Les interrupteurs ne sont actifs que si « Ronde contractuelle » est sélectionnée parmi les formulaires.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🗑️ Suppression</h3>
        <p className="muted">
          Le bouton <strong>Supprimer</strong> ouvre une confirmation puis retire la variable de la base <strong>immédiatement</strong>. En cas de doute, utilisez{" "}
          <strong>Actualiser</strong> pour repartir des données serveur.
        </p>
      </div>
    </article>
  );
}
