/**
 * Rubrique centre d’aide — module Rondes (contractuel / exceptionnel, clôture, profils).
 */

import { HelpDayListDisplaySection } from "./HelpDayListDisplaySection";

export function HelpRondesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🔄 Le module Rondes</h2>
      <p className="help-center-lead">
        Le module <strong>Rondes</strong> permet d&apos;organiser, de générer et de suivre les passages des agents sur les sites. Il
        distingue deux types de besoins :
      </p>
      <ul className="muted help-center-list">
        <li>
          <strong>Ronde contractuelle :</strong> liée à un contrat récurrent, elle s&apos;appuie sur une planification durable.
        </li>
        <li>
          <strong>Ronde exceptionnelle :</strong> liée à un événement ponctuel ou urgent (appel client, suite d&apos;intervention, etc.).
        </li>
      </ul>
      <p className="help-center-lead">
        Chaque passage terrain donne lieu à une <strong>fiche de ronde</strong> dédiée qui doit être complétée et clôturée une fois la
        mission effectuée.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Contractuel vs exceptionnel : deux logiques distinctes</h3>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Cas d&apos;usage</th>
                <th scope="col">Logique de création</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Ronde contractuelle</strong>
                </td>
                <td>
                  Passages répétés sur une longue période (ouvertures / fermetures quotidiennes, rondes de nuit, etc.).
                </td>
                <td>
                  <strong>Gérée par les responsables :</strong> repose sur une <em>programmation</em> (profil + grille horaire). Les fiches de
                  passage sont générées au jour le jour selon cette règle.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Ronde exceptionnelle</strong>
                </td>
                <td>Besoin ponctuel et immédiat hors contrat (alarme, demande d&apos;un client, renfort).</td>
                <td>
                  <strong>Création directe :</strong> la validation de la demande génère immédiatement l&apos;ensemble des fiches de ronde
                  prévues (en lot).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Les lignes de planification (communes aux deux modes)</h3>
        <p className="muted">
          Que ce soit pour définir une règle contractuelle ou une demande exceptionnelle, construisez vos horaires à l&apos;aide de lignes de
          planification :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Ouverture :</strong> ronde d&apos;ouverture à heure fixe (ex. 08:00). Indiquez l&apos;heure demandée.
          </li>
          <li>
            <strong>Fermeture :</strong> ronde de fermeture à heure fixe (ex. 20:00). Indiquez l&apos;heure demandée.
          </li>
          <li>
            <strong>Accompagnement :</strong> passage précis à une heure donnée, généralement sur une journée unique.
          </li>
          <li>
            <strong>Aléatoire :</strong> une ou plusieurs rondes à effectuer au sein d&apos;une plage horaire (ex. 3 rondes entre 22:00 et
            06:00) ou à intervalle régulier.
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Régulation :</em> précisez la fenêtre horaire (de / à), le nombre de rondes ou l&apos;intervalle. Si l&apos;heure de fin
                est inférieure à l&apos;heure de début, le système applique automatiquement la fin au lendemain.
              </li>
            </ul>
          </li>
        </ul>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Règle de gestion :</strong> les horaires de deux lignes distinctes ne doivent pas se chevaucher sur un même jour
          (l&apos;enregistrement sera refusé).
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📅 Gérer les rondes contractuelles</h3>
        <p className="muted">
          Les rondes contractuelles s&apos;articulent autour d&apos;une règle fixe établie par les responsables, que l&apos;exploitation
          matérialise chaque jour.
        </p>

        <h4 className="help-center-subsection-title">1. La programmation (configuration responsable)</h4>
        <p className="muted">
          L&apos;onglet <strong>Ronde contractuelle</strong> (ou <strong>Programmations</strong>) permet de définir le cadre : choix du site,
          du prestataire, dates de validité (<strong>Du / Au</strong>) et consignes permanentes destinées aux agents. L&apos;enregistrement crée
          un profil actif, mais <strong>ne génère pas de fiches instantanément</strong>.
        </p>

        <h4 className="help-center-subsection-title">2. L&apos;enregistrement des passages du jour (exploitation)</h4>
        <ul className="muted help-center-list">
          <li>Chaque jour, l&apos;application affiche les créneaux attendus issus de la programmation.</li>
          <li>
            <strong>Pour lancer une ronde :</strong> ouvrez le créneau attendu pour matérialiser et créer la fiche de ronde du jour.
          </li>
          <li>
            <strong>Modification / arrêt :</strong> pour modifier la règle globale, utilisez <strong>Modifier la programmation</strong>.
            Pour stopper définitivement le flux, définissez une date de fin avec motif. Désactiver ou supprimer une programmation conserve
            l&apos;historique des fiches déjà clôturées.
          </li>
          <li>
            <strong>Clôture :</strong> le compte rendu texte est <strong>obligatoire</strong> sur chaque fiche contractuelle clôturée. Aucune
            clôture automatique n&apos;est appliquée sur ce type de ronde.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚡ Créer une ronde exceptionnelle</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Rendez-vous dans l&apos;onglet <strong>Ronde exceptionnelle</strong> et cliquez sur <strong>Nouvelle ronde</strong> (l&apos;origine
            est configurée sur <em>Appel client</em> par défaut).
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Raccourci :</em> si la ronde fait suite à une intervention, créez-la directement depuis la fiche de cette intervention pour
                lier automatiquement le site et le contexte.
              </li>
            </ul>
          </li>
          <li>Renseignez le site, le prestataire, le motif de la demande et la date/heure de l&apos;événement.</li>
          <li>
            Définissez la période de validité (<strong>Du / Au</strong> ou <strong>Jour unique</strong>) et ajoutez vos lignes de
            planification.
          </li>
          <li>
            <strong>Vérification :</strong> consultez l&apos;<strong>Aperçu</strong> pour contrôler le nombre de fiches qui vont être générées.
          </li>
          <li>
            <strong>Validation :</strong> validez pour créer instantanément toutes les fiches du lot.
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Évolution :</em> en cas de modification de la demande, la réouverture du lot permet de resynchroniser les fiches{" "}
                <strong>non clôturées</strong> sans impacter celles déjà validées sur le terrain.
              </li>
            </ul>
          </li>
        </ol>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Clôturer un passage (retour terrain)</h3>
        <p className="muted">
          Une fois la ronde effectuée, ouvrez la fiche pour y saisir les informations terrain (heures d&apos;arrivée / de départ, numéro de
          bon, compte rendu).
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Sur une ronde contractuelle :</strong> la saisie d&apos;un compte rendu textuel est <strong>obligatoire</strong> pour
            pouvoir clôturer la fiche.
          </li>
          <li>
            <strong>Sur une ronde exceptionnelle :</strong> les heures réelles, le numéro de bon et le compte rendu sont{" "}
            <strong>facultatifs</strong>. La validation de la fiche reste possible sans détails afin de conserver la trace administrative de la
            demande.
          </li>
          <li>
            <strong>Clôture automatique (exceptionnelle uniquement) :</strong> si une fiche exceptionnelle reste en cours{" "}
            <strong>plus de 5 jours après la date de passage</strong>, le système la clôture avec la mention{" "}
            <strong>Clôture automatique par système</strong>. Les rondes contractuelles ne sont jamais clôturées automatiquement. Utilisez{" "}
            <strong>Rouvrir</strong> puis reclôturez pour compléter le terrain si besoin.
          </li>
        </ul>
      </div>

      <HelpDayListDisplaySection />

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Besoin :</strong> une ronde d&apos;ouverture chaque matin à 08:00, du lundi au samedi pendant 1 an.
            <br />
            <strong>→ Logique :</strong> <em>Contractuel</em> — programmation sur 1 an, 1 ligne <em>Ouverture</em> à 08:00, jours Lun à Sam.
            Chaque matin, l&apos;exploitant matérialise le créneau et l&apos;agent clôture avec son compte rendu obligatoire.
          </li>
          <li>
            <strong>Besoin :</strong> effectuer 3 rondes au cours de chaque nuit (entre 22:00 et 06:00) du lundi au vendredi.
            <br />
            <strong>→ Logique :</strong> <em>Contractuel</em> — 1 ligne <em>Aléatoire</em>, fenêtre 22:00–06:00, nombre = 3, jours Lun à Ven.
          </li>
          <li>
            <strong>Besoin :</strong> un client appelle pour demander un renfort de rondes uniquement de mercredi à vendredi de cette semaine.
            <br />
            <strong>→ Logique :</strong> <em>Exceptionnelle</em> — nouvelle ronde, validité sur les 3 jours, grille horaire adaptée, validation
            immédiate du lot de fiches.
          </li>
        </ul>
      </div>
    </article>
  );
}
