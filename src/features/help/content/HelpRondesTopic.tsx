import { HelpDayListDisplaySection } from "./HelpDayListDisplaySection";

export function HelpRondesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🔄 Rondes</h2>
      <p className="help-center-lead">
        La page <strong>Rondes</strong> regroupe l&apos;exploitation des <strong>passages planifiés</strong> (ronde contractuelle), des{" "}
        <strong>demandes ponctuelles</strong> (ronde exceptionnelle) et la <strong>gestion des programmations</strong> (profils et règles de
        génération). Les cartes en haut résument les volumes : total, en cours, clôturées, annulées.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📑 Les trois onglets</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Ronde contractuelle</strong> : passages issus des <strong>profils de programmation</strong> actifs (ouverture, fermeture,
            accompagnement, aléatoire). Le badge sur l&apos;onglet indique le nombre de fiches planifiées pour la journée courante.
          </li>
          <li>
            <strong>Ronde exceptionnelle</strong> : demandes <strong>non contractuelles</strong> (appel client, suite intervention, autre). Chaque
            validation peut créer <strong>plusieurs fiches</strong> selon la grille saisie (période de validité, lignes, jours fériés).
          </li>
          <li>
            <strong>Programmations</strong> (si disponible selon vos droits) : référentiel des profils (site, prestataire, validité Du/Au, lignes).
            C&apos;est ici que l&apos;on crée ou modifie la <strong>règle</strong>, pas chaque passage du jour.
          </li>
        </ul>
      </div>

      <HelpDayListDisplaySection />

      <div className="help-center-card">
        <h3 className="help-center-card-title">👁️ Affichage sur la page Rondes</h3>
        <ul className="muted help-center-list">
          <li>
            La préférence <strong>Affichage journée</strong> / <strong>Affichage liste</strong> est enregistrée{" "}
            <strong>séparément</strong> pour l&apos;onglet <strong>contractuel</strong> et l&apos;onglet{" "}
            <strong>exceptionnel</strong>.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📅 Ronde contractuelle — exploitation</h3>
        <ul className="muted help-center-list">
          <li>
            Toute ronde contractuelle dépend d&apos;un <strong>profil de programmation</strong> actif (site, prestataire par défaut, validité Du/Au,
            lignes ouverture / fermeture / accompagnement / aléatoire).
          </li>
          <li>
            <strong>Mode jour</strong> : pour la date choisie, l&apos;application calcule les <strong>créneaux attendus</strong> à partir des profils.
            Chaque créneau correspond à une occurrence prévue ; s&apos;il n&apos;existe pas encore de fiche en base pour ce créneau, la ligne invite à
            <strong> matérialiser le passage</strong> (fiche liée au profil, au type de ronde et au créneau).
          </li>
          <li>
            <strong>Mode liste</strong> : fiches déjà créées et, le cas échéant, lignes virtuelles pour les créneaux du profil pas encore saisis sur la
            période filtrée.
          </li>
          <li>
            <strong>Planifier une ronde</strong> (onglet contractuel ou Programmations, origine Contrat) : enregistre ou met à jour un{" "}
            <strong>profil</strong> — ce n&apos;est pas la saisie terrain du passage. Les fiches du jour se créent ensuite créneau par créneau.
          </li>
          <li>
            Types de ligne : <strong>ouverture</strong>, <strong>fermeture</strong>, <strong>accompagnement</strong> (heure demandée),{" "}
            <strong>aléatoire</strong> (fenêtre horaire, nombre de rondes ou intervalle).
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">⚡ Ronde exceptionnelle — demande</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Nouvelle ronde</strong> ouvre la modale en mode <strong>non planifié</strong> (appel client par défaut). L&apos;aperçu indique le
            nombre de fiches qui seront créées à la validation.
          </li>
          <li>
            <strong>Créer</strong> génère immédiatement une fiche par créneau calculé, liées par un même lot (modification groupée possible ensuite).
          </li>
          <li>
            <strong>Demande liée</strong> : depuis une fiche exceptionnelle, rouvrez le lot pour ajuster site, motif, validité ou grille ; les fiches
            ouvertes du lot peuvent être resynchronisées ; les fiches <strong>clôturées</strong> sont conservées.
          </li>
          <li>
            <strong>Suite intervention</strong> : création depuis une intervention en cours (origine verrouillée) si la page Interventions vous est
            accessible.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Onglet Programmations</h3>
        <ul className="muted help-center-list">
          <li>
            Tableau des profils : libellé, site, prestataire, état <strong>actif / inactif</strong>, résumé des lignes.
          </li>
          <li>
            <strong>Planifier une ronde</strong> : création d&apos;un nouveau profil.
          </li>
          <li>
            <strong>Modifier</strong> : met à jour la programmation (conserver les identifiants de lignes évite de désynchroniser les fiches déjà
            créées).
          </li>
          <li>
            <strong>Arrêter le flux</strong> : fixe une date de fin de validité (motif obligatoire).
          </li>
          <li>
            <strong>Supprimer</strong> (profil responsable) : désactive la programmation avec motif tracé.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📝 Fiche de ronde (passage)</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>En cours</strong> : bouton coche pour compléter le compte rendu terrain (heures arrivée/départ, n° bon, texte, champs
            complémentaires du profil si configurés).
          </li>
          <li>
            <strong>Clôturer</strong> ou <strong>annuler</strong> (motif obligatoire à l&apos;annulation).
          </li>
          <li>
            <strong>Ronde contractuelle (planifiée)</strong> : le <strong>compte rendu texte</strong> est obligatoire pour clôturer.
          </li>
          <li>
            <strong>Ronde exceptionnelle</strong> : à la clôture, le <strong>compte rendu texte</strong>, les <strong>heures d&apos;arrivée et de
            départ</strong> et le <strong>n° bon</strong> sont <strong>facultatifs</strong> (seul un format d&apos;heure invalide est refusé si vous
            en saisissez). La fiche reste tracée même sans ces éléments.
          </li>
          <li>
            <strong>Clôturée / Annulée</strong> : consultation via l&apos;icône œil ; possibilité de rouvrir selon les droits.
          </li>
          <li>
            <strong>Demande liée</strong> (fiche planifiée ou exceptionnelle) : accès à la programmation ou au lot d&apos;origine.
          </li>
          <li>
            En <strong>mode dégradé</strong>, le badge <strong>En attente DB</strong> signale une écriture en file d&apos;attente writer.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📤 Exports Word</h3>
        <ul className="muted help-center-list">
          <li>
            Fiche <strong>clôturée</strong> ou <strong>annulée</strong> : icône d&apos;export Word (modèle « ronde contractuelle » ou « ronde
            exceptionnelle » selon le cas, configuré dans <strong>Paramètres → Gestion modèles</strong>).
          </li>
          <li>
            En affichage jour contractuel, export Word possible depuis la ligne du créneau.
          </li>
        </ul>
      </div>
    </article>
  );
}
