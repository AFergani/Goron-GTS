export function HelpSettingsDataTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🗂️ Gestion des données</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Gestion des données</strong> (accessible dans les <strong>Paramètres</strong>) centralise l&apos;ensemble des
        référentiels partagés de l&apos;application. Ces listes alimentent directement les formulaires de saisie utilisés au quotidien par les
        opérateurs (mains courantes, interventions, rondes, gardiennages, Fransor).
      </p>
      <p className="help-center-lead">
        Toute modification effectuée ici est immédiate. Pour garantir la traçabilité du système, les suppressions de données exigent la saisie
        d&apos;un <strong>motif obligatoire</strong> et sont enregistrées dans le journal d&apos;audit.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🧭 Organisation et règles d&apos;accès</h3>
        <p className="muted">L&apos;écran s&apos;organise autour de 6 sous-onglets thématiques :</p>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Sites :</strong> référentiel des lieux (codes, adresses, parcs, familles).
          </li>
          <li>
            <strong>Intervenants :</strong> sociétés de gardiennage et prestataires d&apos;intervention.
          </li>
          <li>
            <strong>Types d&apos;anomalie :</strong> catégories d&apos;incidents pour la main courante (avec codes couleur).
          </li>
          <li>
            <strong>Jours fériés :</strong> calendrier des dates spécifiques à exclure ou inclure dans vos plannings.
          </li>
          <li>
            <strong>Motifs ronde :</strong> libellés pour la création des rondes exceptionnelles.
          </li>
          <li>
            <strong>Fransor :</strong> liste des responsables habilités pour les ouvertures / fermetures Fransor.
          </li>
        </ol>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Niveau d&apos;accès :</strong> cet écran est réservé aux profils ayant le module <strong>Paramètres</strong> activé. Les actions
          de suppression de lignes sont quant à elles exclusivement réservées aux profils <strong>Responsable</strong> et{" "}
          <strong>Admin</strong>.
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📍 Focus par référentiel (les 6 onglets)</h3>

        <h4 className="help-center-subsection-title">1. Sites</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Gestion :</strong> création manuelle (bouton <strong>Créer</strong>) ou modification en ligne via l&apos;icône crayon
            (validation par la disquette).
          </li>
          <li>
            <strong>Import en masse :</strong> injection de fichiers Excel (.xls ou .xlsx, max 10 Mo / 20 000 lignes) contenant au minimum les
            colonnes <em>Code site</em> et <em>Site</em>. Les parcs, familles et adresses sont optionnels. Un rapport de succès / échec est généré
            après traitement.
          </li>
          <li>
            <strong>Alertes terrain (en attente) :</strong> lorsqu&apos;un opérateur saisit un site inconnu sur le terrain, une bannière
            s&apos;affiche en haut de l&apos;onglet. Vous devez soit valider la proposition en complétant sa famille et son parc, soit la
            rejeter avec un motif.
          </li>
        </ul>

        <h4 className="help-center-subsection-title">2. Intervenants</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Gestion :</strong> liste des prestataires utilisés dans l&apos;application pour les interventions, rondes et gardiennages.
            Création manuelle ou modification en ligne.
          </li>
          <li>
            <strong>Import en masse :</strong> fonctionne par fichier Excel en utilisant une colonne dédiée au nom de l&apos;entreprise (les
            en-têtes de colonnes comme <em>intervenant</em>, <em>prestataire</em> ou <em>société</em> sont reconnus automatiquement).
          </li>
          <li>
            <strong>Intervenants en attente :</strong> même principe que pour les sites ; validez ou rejetez avec motif les propositions de
            prestataires inconnus saisies par le terrain.
          </li>
        </ul>

        <h4 className="help-center-subsection-title">3. Types d&apos;anomalie</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Gestion :</strong> saisie manuelle uniquement (pas d&apos;import Excel). Définissez le libellé de l&apos;anomalie et
            attribuez-lui une couleur spécifique.
          </li>
          <li>
            <strong>Affichage :</strong> cette couleur s&apos;affichera sous forme de badge visuel dans la liste des mains courantes pour faciliter
            le tri et la lecture des opérateurs.
          </li>
          <li>
            <strong>Sécurité :</strong> le système bloque la suppression d&apos;un type d&apos;anomalie s&apos;il est déjà utilisé dans
            l&apos;historique des mains courantes afin de préserver la traçabilité.
          </li>
        </ul>

        <h4 className="help-center-subsection-title">4. Jours fériés</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Gestion :</strong> les jours fériés nationaux français sont intégrés automatiquement de manière fixe et ne sont pas
            modifiables.
          </li>
          <li>
            <strong>Exceptions :</strong> utilisez le formulaire en haut de tableau pour ajouter manuellement les jours fériés locaux ou
            spécifiques à votre activité (ex. Sainte-Barbe, accord local d&apos;entreprise) pour l&apos;année en cours.
          </li>
          <li>
            <strong>Impact :</strong> ces dates basculent automatiquement les modules <strong>Fransor</strong> et <strong>Rondes</strong> en mode
            « jour non ouvré » (sauf si une période d&apos;exception « Ouverture » est configurée).
          </li>
        </ul>

        <h4 className="help-center-subsection-title">5. Motifs ronde</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Gestion :</strong> saisie manuelle et exclusive (pas d&apos;import Excel). Permet de définir et standardiser les libellés
            proposés lors de la création d&apos;une ronde exceptionnelle (ex. demande client, déclenchement alarme, suite intervention).
          </li>
          <li>
            <strong>Affichage :</strong> fonctionne comme les types d&apos;anomalie, avec l&apos;attribution d&apos;un libellé et d&apos;une
            couleur de badge dédiée pour les listes.
          </li>
        </ul>

        <h4 className="help-center-subsection-title">6. Fransor</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Gestion :</strong> saisie manuelle uniquement (pas d&apos;import Excel). Permet de lister et de mettre à jour le référentiel
            des responsables et agents d&apos;encadrement habilités à être crédités d&apos;une ouverture ou d&apos;une fermeture dans le module
            de suivi <strong>Fransor</strong>.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🛠️ Actions communes de maintenance</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Modifier une ligne :</strong> cliquez sur le crayon, modifiez vos champs, cliquez sur la disquette pour enregistrer (ou
            annulez avec l&apos;icône de réinitialisation).
          </li>
          <li>
            <strong>Supprimer une donnée :</strong> cliquez sur la corbeille — <strong>saisie d&apos;un motif obligatoire</strong>. Si la donnée
            est liée à des fiches historiques (ex. un site ayant déjà eu des interventions), le système refusera la suppression pour protéger
            l&apos;intégrité de vos données.
          </li>
          <li>
            <strong>Pagination :</strong> pour optimiser le chargement, les données lourdes (sites, intervenants) sont affichées par blocs de 200
            lignes. Utilisez la recherche textuelle rapide pour cibler un élément.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques de configuration</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Déploiement d&apos;un nouveau marché (150 sites d&apos;un coup) :</strong>
            <br />
            <strong>→</strong> allez sur l&apos;onglet <strong>Sites</strong>, cliquez sur <strong>Importer en masse</strong>, chargez votre
            fichier Excel standardisé. Utilisez ensuite les filtres par famille si vous devez faire des ajustements à la volée.
          </li>
          <li>
            <strong>Un agent a tapé un nom de prestataire inconnu sur une fiche d&apos;intervention :</strong>
            <br />
            <strong>→</strong> allez sur l&apos;onglet <strong>Intervenants</strong>, consultez la liste des propositions en attente en haut de
            page, puis validez pour l&apos;ajouter officiellement au référentiel de la station.
          </li>
          <li>
            <strong>Ajout du lundi de Pentecôte (journée de solidarité travaillée ou non selon accord local) :</strong>
            <br />
            <strong>→</strong> allez sur l&apos;onglet <strong>Jours fériés</strong>, ajoutez la date précise et le libellé pour que le système
            adapte automatiquement les plannings d&apos;exploitation de cette journée.
          </li>
        </ul>
      </div>
    </article>
  );
}
