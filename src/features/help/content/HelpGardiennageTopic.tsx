export function HelpGardiennageTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🛡️ Gardiennage</h2>
      <p className="help-center-lead">
        Utilisez le <strong>gardiennage</strong> pour faire planifier une <strong>présence physique</strong> sur un site :
        une fois, sur plusieurs jours, ou selon un rythme récurrent. Chaque <strong>prestation journalière</strong> (une fiche par jour ou créneau
        prévu) peut ensuite être <strong>clôturée</strong> pour tracer le passage terrain — ce n&apos;est pas bloquant techniquement, mais c&apos;est la
        démarche attendue pour garder une trace fiable.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">➕ Créer un gardiennage — par où commencer</h3>
        <ul className="muted help-center-list">
          <li>
            Cliquez sur <strong>Nouveau gardiennage</strong>. Renseignez au minimum le <strong>site</strong> et le <strong>prestataire</strong> qui
            assurera la présence.
          </li>
          <li>
            La <strong>consigne</strong> est recommandée dès que l&apos;agent a besoin d&apos;instructions : accès, consignes client, point de
            contact, particularités du site.
          </li>
          <li>
            Si la demande vient d&apos;une <strong>intervention</strong> ou d&apos;une <strong>ronde</strong>, créez le gardiennage depuis cette
            fiche : le site et le prestataire sont en général déjà renseignés ; vous n&apos;avez plus qu&apos;à définir la planification.
          </li>
          <li>
            Avant d&apos;enregistrer, parcourez l&apos;<strong>aperçu des créneaux</strong> : il montre les jours et horaires qui seront créés. Si
            le résultat ne correspond pas au besoin, corrigez les dates ou les lignes avant validation.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Choisir le bon mode de planification</h3>
        <p className="muted">
          Dans la section <strong>Planification</strong>, un seul mode doit être actif. 
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Journée unique</strong> — à utiliser pour <strong>une seule prestation sur une date</strong>.
            <br />
            Exemples : garde le samedi de 08:00 à 18:00 ; astreinte ponctuelle un jour férié. Indiquez la <strong>date</strong>, l&apos;heure de{" "}
            <strong>début</strong> et de <strong>fin</strong>. Si la fin est le lendemain (ex. 20:00 → 08:00), l&apos;application décale
            automatiquement la fin au jour suivant.
          </li>
          <li>
            <strong>H24</strong> — à utiliser quand la présence doit couvrir <strong>toute la période sans coupure horaire</strong> entre deux
            instants précis (date + heure de début, date + heure de fin).
            <br />
            Exemples : surveillance continue du lundi 08:00 au vendredi 20:00 ; couverture 24 h/24 sur trois jours.{" "}
            <strong>Ne pas</strong> utiliser ce mode pour des créneaux du type « nuits du lundi au vendredi 20:00–08:00 » : préférez la{" "}
            <strong>planification libre</strong>, ou créez <strong>deux demandes</strong> si vous devez combiner du H24 et des horaires récurrents
            précis.
          </li>
          <li>
            <strong>Planification libre</strong> — mode le plus courant pour un <strong>rythme qui se répète</strong> sur une période (semaines ou
            mois).
            <br />
            Indiquez la validité <strong>Du</strong> et <strong>Au</strong> (dates du besoin global), puis décrivez les horaires dans les{" "}
            <strong>lignes de planification</strong> (voir section suivante).
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Planification libre — remplir les lignes</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Une ligne = un créneau horaire</strong> avec les jours où il s&apos;applique. Heures de <strong>début</strong> et de{" "}
            <strong>fin</strong> obligatoires (ex. 20:00 et 08:00 pour une nuit).
          </li>
          <li>
            Cochez les jours <strong>Lun … Dim</strong> concernés. Exemple classique — garde de nuit en semaine : début 20:00, fin 08:00, cocher{" "}
            <strong>Lun à Ven</strong>, laisser <strong>Sam</strong> et <strong>Dim</strong> décochés.
          </li>
          <li>
            Cochez <strong>Jours fériés</strong> si le même créneau doit aussi s&apos;appliquer les jours fériés dans la période ; sinon laissez
            décoché.
          </li>
          <li>
            <strong>Plusieurs lignes</strong> si le besoin change selon les jours (ex. ligne 1 : nuit lun–ven, ligne 2 : jour sam–dim). Les
            horaires de deux lignes ne doivent pas se chevaucher sur un même jour : l&apos;enregistrement est refusé avec un message explicite.
          </li>
          <li>
            <strong>Date optionnelle</strong> sur une ligne : à réserver pour une <strong>exception ponctuelle</strong> (un seul jour précis dans la
            période). Les jours de la semaine sont alors ignorés pour cette ligne.
          </li>
          <li>
            Une validation peut générer <strong>plusieurs fiches</strong> (une par jour de présence prévu). C&apos;est normal pour un planning sur
            plusieurs semaines : vous clôturerez chaque jour concerné au fil de l&apos;exploitation.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Clôture — automatique et manuelle</h3>
        <ul className="muted help-center-list">
          <li>
            Chaque <strong>prestation journalière</strong> (une fiche par jour ou créneau) est concernée. En vue <strong>journée</strong>, la coche
            rapide permet une clôture manuelle ; sinon ouvrez la fiche puis <strong>Clôturer</strong>.
          </li>
          <li>
            <strong>Clôture automatique</strong> : dès que l&apos;horaire de fin prévu est passé, la fiche est clôturée par le système avec le libellé{" "}
            <strong>Clôture automatique par système</strong> (sans heures effectives ni compte rendu). Cela évite d&apos;accumuler des fiches ouvertes
            dans la liste.
          </li>
          <li>
            Pour compléter ou corriger une clôture automatique : <strong>Rouvrir</strong> la fiche, puis <strong>Clôturer</strong> à nouveau avec les
            informations terrain (heures, n° de bon, compte rendu — tous facultatifs).
          </li>
          <li>
            Une planification sur plusieurs jours crée <strong>autant de fiches</strong> que de créneaux prévus ; chaque jour est traité{" "}
            <strong>indépendamment</strong>.
          </li>
          <li>
            <strong>Annuler</strong> avec un motif si la prestation ne doit plus avoir lieu. <strong>Supprimer</strong> sur un lot : seules les fiches{" "}
            <strong>non clôturées</strong> sont retirées.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples de besoins courants</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Une garde samedi 8 h–18 h</strong> → <strong>Journée unique</strong>, date du samedi, début 08:00, fin 18:00.
          </li>
          <li>
            <strong>Nuits du lundi au vendredi 20 h–8 h pendant deux mois</strong> → <strong>Planification libre</strong>, Du/Au sur les deux mois,
            une ligne 20:00–08:00, Lun–Ven, JF si besoin.
          </li>
          <li>
            <strong>Présence continue du 1er au 15 du mois sans horaire de coupure</strong> → <strong>H24</strong>, du 1er (heure de début) au 15
            (heure de fin).
          </li>
          <li>
            <strong>Renfort ponctuel un jour précis</strong> dans une période déjà couverte par d&apos;autres lignes → ajoutez une ligne avec la{" "}
            <strong>date optionnelle</strong> de ce jour et les horaires du renfort.
          </li>
        </ul>
      </div>
    </article>
  );
}
