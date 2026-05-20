export function HelpSettingsTemplatesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">📄 Gestion des modèles Word</h2>
      <p className="help-center-lead">
        Cet onglet permet de <strong>voir les modèles d&apos;export</strong> (.docx), de savoir <strong>quel fichier est réellement utilisé</strong>, de{" "}
        <strong>remplacer</strong> un modèle par défaut par votre version (dans le dossier à côté de la base) et de définir des{" "}
        <strong>attributions personnalisées</strong> par flux et par site ou famille de sites.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">👤 Qui peut modifier</h3>
        <ul className="muted help-center-list">
          <li>
            Les profils <strong>responsable</strong> peuvent <strong>remplacer</strong> les fichiers modèles,{" "}
            <strong>ajouter</strong> ou <strong>supprimer</strong> des attributions personnalisées.
          </li>
          <li>
            Les <strong>opérateurs</strong> voient la liste en <strong>consultation</strong> lorsque l&apos;accès Paramètres le permet ; les actions de modification ne sont pas disponibles.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Tableau principal des modèles</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Modèle</strong> : titre lisible (ex. intervention, ronde contractuelle, gardiennage).
          </li>
          <li>
            <strong>Fichier</strong> : nom attendu du fichier <code>.docx</code> (à respecter lors d&apos;un remplacement).
          </li>
          <li>
            <strong>Chemin résolu</strong> : emplacement du fichier réellement utilisé pour l&apos;export. L&apos;application cherche d&apos;abord dans le dossier{" "}
            <code>data/templates</code> à côté de votre base de données ; à défaut, un <strong>modèle embarqué</strong> peut être utilisé.
          </li>
          <li>
            <strong>État</strong> : <strong>Présent</strong> si le fichier est trouvé à l&apos;emplacement résolu, <strong>Absent</strong> sinon (export peut alors basculer sur un secours ou un message d&apos;erreur selon le flux).
          </li>
          <li>
            <strong>Aide variables</strong> (icône) : ouvre la liste des <strong>jetons Docxtemplater</strong> du modèle concerné (<code>{"{nom}"}</code>), utile pour adapter votre Word.
          </li>
          <li>
            <strong>Remplacer</strong> : copie un fichier <code>.docx</code> choisi sur votre poste vers le dossier d&apos;écriture des modèles, sous le <strong>même nom</strong> que la ligne (ex.{" "}
            <code>ronde-template.docx</code>). Le fichier précédent du même nom est ainsi remplacé.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Barre d&apos;actions</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Ajouter un modèle personnalisé</strong> : ouvre la modale d&apos;<strong>attribution</strong> (voir ci-dessous). Ce n&apos;est pas un remplacement global : vous liez un flux à un site ou une famille.
          </li>
          <li>
            <strong>Ouvrir le dossier des modèles</strong> : ouvre l&apos;explorateur sur le dossier <code>data/templates</code> lorsque la base est configurée (prise en main manuelle possible).
          </li>
          <li>
            <strong>Actualiser</strong> : recharge la liste des modèles et le chemin résolu après un changement de fichier hors application.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔗 Attributions personnalisées</h3>
        <p className="muted">
          Le second tableau liste les règles du type : pour un <strong>flux</strong> donné (intervention, ronde contractuelle, ronde exceptionnelle, gardiennage), utiliser un fichier{" "}
          <code>.docx</code> précis lorsque l&apos;export concerne un <strong>site</strong> ou une <strong>famille</strong> de sites. La résolution combine en général ces attributions avec les modèles par défaut (priorités détaillées côté export).
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Supprimer</strong> sur une ligne retire uniquement cette attribution (confirmation puis enregistrement immédiat).
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Modale « Ajouter un modèle personnalisé »</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Flux</strong> : type d&apos;export concerné (intervention, ronde contractuelle, etc.).
          </li>
          <li>
            <strong>Portée</strong> : <strong>Site</strong> (recherche dans le référentiel) ou <strong>Famille</strong> (saisie, suggestions depuis les familles connues).
          </li>
          <li>
            <strong>Choisir et attribuer le modèle</strong> : ouvre un sélecteur de fichier ; le nom du <code>.docx</code> choisi est enregistré comme modèle pour cette combinaison flux + portée.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Bonnes pratiques</h3>
        <ul className="muted help-center-list">
          <li>
            Conservez les <strong>mêmes noms de fichier</strong> que l&apos;application attend lorsque vous remplacez un modèle par défaut.
          </li>
          <li>
            Si le dossier d&apos;écriture n&apos;apparaît pas, vérifiez que la <strong>base de données active</strong> est bien configurée : sans chemin de base, le remplacement et l&apos;ouverture du dossier peuvent être indisponibles.
          </li>
          <li>
            Pour les variables d&apos;export, croisez avec l&apos;onglet <strong>Gestion des variables</strong> lorsque des champs personnalisés sont injectés dans les documents.
          </li>
        </ul>
      </div>
    </article>
  );
}
