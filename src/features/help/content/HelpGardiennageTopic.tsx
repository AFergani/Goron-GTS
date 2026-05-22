/**
 * Rubrique centre d’aide — module Gardiennage (planification, clôture, exports).
 */

import { HelpDayListDisplaySection } from "./HelpDayListDisplaySection";

export function HelpGardiennageTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🛡️ Le module Gardiennage</h2>
      <p className="help-center-lead">
        Le module <strong>Gardiennage</strong> permet de planifier et de suivre une présence physique sur un site (ponctuelle,
        sur plusieurs jours ou récurrente).
      </p>
      <p className="help-center-lead">
        Chaque créneau planifié génère une <strong>fiche journalière</strong>. Pour assurer la traçabilité des prestations sur le
        terrain, chaque fiche doit idéalement être clôturée en fin de mission.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Créer un gardiennage : par où commencer ?</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Initialisation :</strong> cliquez sur <strong>Nouveau gardiennage</strong>. Renseignez au minimum le{" "}
            <strong>Site</strong> et le <strong>Prestataire</strong>.
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Astuce :</em> si la demande découle d&apos;une intervention ou d&apos;une ronde, créez le gardiennage directement depuis
                cette fiche pour pré-remplir ces informations.
              </li>
            </ul>
          </li>
          <li>
            <strong>Consignes :</strong> utilisez le champ <strong>Consigne</strong> pour transmettre les informations essentielles à
            l&apos;agent (accès, contacts sur place, particularités du site).
          </li>
          <li>
            <strong>Vérification :</strong> avant d&apos;enregistrer, consultez l&apos;<strong>Aperçu des créneaux</strong>. Il liste
            l&apos;ensemble des fiches jours/horaires qui vont être générées. Ajustez vos critères si le résultat ne correspond pas aux besoins.
          </li>
        </ol>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Choisir le bon mode de planification</h3>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Important :</strong> un seul mode de planification doit être actif par demande.
        </div>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Mode</th>
                <th scope="col">Utilisation idéale</th>
                <th scope="col">Exemples</th>
                <th scope="col">Spécificités techniques</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Journée unique</strong>
                </td>
                <td>Prestation isolée sur une seule date.</td>
                <td>
                  Garde le samedi de 08:00 à 18:00.
                  <br />
                  Astreinte un jour férié.
                </td>
                <td>
                  Si l&apos;heure de fin est inférieure à l&apos;heure de début (ex. 20:00 → 08:00), l&apos;application bascule
                  automatiquement la fin au <strong>lendemain</strong>.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>H24</strong>
                </td>
                <td>Présence continue et ininterrompue sur une période donnée.</td>
                <td>Surveillance non-stop du lundi 08:00 au vendredi 20:00.</td>
                <td>
                  <strong>Ne pas utiliser</strong> pour des nuits récurrentes (ex. 20:00 à 08:00 chaque soir). Privilégiez le mode{" "}
                  <strong>Planification libre</strong>.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Planification libre</strong>
                </td>
                <td>Rythme récurrent qui se répète sur une période (semaines / mois).</td>
                <td>Nuits du lundi au vendredi sur 3 mois.</td>
                <td>
                  Définissez la période globale (<strong>Du / Au</strong>), puis détaillez les horaires dans le tableau des lignes.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Zoom sur la planification libre (gestion des lignes)</h3>
        <p className="muted">
          Chaque ligne du tableau représente un créneau horaire associé à des jours précis :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Horaires obligatoires :</strong> renseignez une heure de début et une heure de fin (ex. 20:00 et 08:00 pour une nuit).
          </li>
          <li>
            <strong>Sélection des jours :</strong> cochez les jours concernés (Lun à Dim).
            <ul className="help-center-list help-center-list--nested">
              <li>
                <em>Cas classique :</em> pour des nuits en semaine, cochez de Lun à Ven.
              </li>
            </ul>
          </li>
          <li>
            <strong>Jours fériés (JF) :</strong> cochez cette case si le créneau doit également s&apos;appliquer les jours fériés de la
            période.
          </li>
          <li>
            <strong>Multi-lignes :</strong> ajoutez plusieurs lignes si le besoin varie (ex. ligne 1 pour les nuits en semaine, ligne 2 pour
            les journées du week-end).
            <br />
            <span className="help-center-inline-warn">
              Les horaires de deux lignes ne doivent pas se chevaucher sur un même jour, sous peine de refus d&apos;enregistrement.
            </span>
          </li>
          <li>
            <strong>Date optionnelle (exception) :</strong> renseigner une date précise sur une ligne fait s&apos;appliquer ce créneau{" "}
            <strong>uniquement ce jour-là</strong> (la sélection Lun–Dim est ignorée pour cette ligne). Ce n&apos;est pas un remplacement
            automatique des autres lignes : si une ligne récurrente couvre aussi ce jour, les horaires doivent rester compatibles (pas de
            chevauchement). Utile pour un renfort ou une exception ponctuelle dans la période.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Clôture des fiches (suivi terrain)</h3>
        <p className="muted">
          La validation d&apos;une planification génère autant de fiches indépendantes que de jours de présence prévus.
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Clôture manuelle :</strong> depuis la <strong>vue journée</strong>, utilisez la coche rapide pour clôturer un créneau,
            ou ouvrez la fiche et cliquez sur <strong>Clôturer</strong>.
          </li>
          <li>
            <strong>Clôture automatique :</strong> dès que l&apos;horaire de fin d&apos;un créneau est dépassé, le système clôture
            automatiquement la fiche avec la mention <strong>Clôture automatique par système</strong> (sans heures effectives ni rapport).
          </li>
          <li>
            <strong>Correction / enrichissement :</strong> si une fiche a été clôturée automatiquement mais nécessite un suivi, cliquez sur{" "}
            <strong>Rouvrir</strong>. Vous pourrez alors y injecter les données terrain : heures réelles, numéro de bon ou compte rendu
            (facultatifs).
          </li>
        </ul>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>Modifications en lot :</strong> si une prestation est annulée, vous pouvez supprimer les fiches créées en lot. Seules les
          fiches <strong>non clôturées</strong> seront supprimées.
        </div>
      </div>

      <HelpDayListDisplaySection />

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Besoin :</strong> une garde le samedi de 08:00 à 18:00.
            <br />
            <strong>→ Mode :</strong> <em>Journée unique</em> — renseigner la date, 08:00 et 18:00.
          </li>
          <li>
            <strong>Besoin :</strong> des nuits du lundi au vendredi (20:00 à 08:00) pendant deux mois.
            <br />
            <strong>→ Mode :</strong> <em>Planification libre</em> — période sur 2 mois ; 1 ligne : 20:00–08:00 ; cocher Lun à Ven.
          </li>
          <li>
            <strong>Besoin :</strong> une surveillance non-stop du 1er au 15 du mois.
            <br />
            <strong>→ Mode :</strong> <em>H24</em> — date de début le 1er (ex. 08:00) ; date de fin le 15 (ex. 20:00).
          </li>
          <li>
            <strong>Besoin :</strong> un renfort exceptionnel un mercredi de 14:00 à 18:00 au milieu d&apos;un planning mensuel déjà couvert
            par d&apos;autres lignes.
            <br />
            <strong>→ Mode :</strong> <em>Planification libre</em> — ajouter une <strong>ligne supplémentaire</strong> avec la{" "}
            <strong>date optionnelle</strong> de ce mercredi et les horaires 14:00–18:00 (vérifier qu&apos;il n&apos;y a pas de chevauchement
            avec les créneaux déjà prévus ce jour-là).
          </li>
        </ul>
      </div>
    </article>
  );
}
