export function HelpRondesTopic() {
  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">🔄 Le module Rondes</h2>
      <p className="help-center-lead">
        Le module <strong>Rondes</strong> sert à organiser les <strong>passages sur site</strong> : rondes liées à un{" "}
        <strong>contrat récurrent</strong> (programmation), ou rondes <strong>ponctuelles / urgentes</strong> (demande
        exceptionnelle).
      </p>
      <p className="help-center-lead">
        Chaque passage aboutit à une <strong>fiche de ronde</strong> à clôturer après l&apos;intervention terrain (compte rendu,
        heures, n° de bon selon le type). Avant de créer, demandez-vous : le besoin relève-t-il d&apos;une{" "}
        <strong>règle durable</strong> (contractuel) ou d&apos;une <strong>demande ponctuelle</strong> (exceptionnel) ?
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🎯 Contractuel ou exceptionnel : lequel choisir ?</h3>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Quand l&apos;utiliser</th>
                <th scope="col">Comment ça se crée</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Ronde contractuelle</strong>
                </td>
                <td>
                  Passages <strong>répétés</strong> sur une longue période (ouverture / fermeture quotidienne, rondes
                  aléatoires dans une plage horaire, etc.).
                </td>
                <td>
                  D&apos;abord une <strong>programmation</strong> (profil + lignes + validité Du/Au), puis une{" "}
                  <strong>fiche par créneau</strong> le jour venu.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Ronde exceptionnelle</strong>
                </td>
                <td>
                  Besoin <strong>ponctuel</strong> : appel client, suite à une intervention, autre demande hors contrat.
                </td>
                <td>
                  <strong>Nouvelle ronde</strong> : la saisie génère <strong>toutes les fiches</strong> d&apos;un coup (lot
                  lié), selon l&apos;aperçu avant validation.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📅 Créer une ronde contractuelle (en 2 étapes)</h3>
        <p className="muted">
          Une ronde contractuelle ne se résume pas à un seul clic : on définit d&apos;abord la <strong>règle</strong>, puis on
          enregistre chaque <strong>passage</strong> prévu.
        </p>

        <h4 className="help-center-subsection-title">Étape 1 — Planifier la programmation</h4>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Onglet <strong>Ronde contractuelle</strong> ou <strong>Programmations</strong> → <strong>Planifier une ronde</strong>.
          </li>
          <li>
            Renseignez <strong>Site</strong>, <strong>Prestataire</strong>, la <strong>validité Du / Au</strong> et les{" "}
            <strong>lignes de planification</strong> (voir tableau ci-dessous).
          </li>
          <li>
            <strong>Consigne</strong> : instructions utiles pour tous les passages de ce profil.
          </li>
          <li>
            Enregistrez : vous créez ou mettez à jour un <strong>profil actif</strong>, pas encore les fiches de chaque jour.
          </li>
        </ol>

        <h4 className="help-center-subsection-title">Étape 2 — Enregistrer les passages du jour</h4>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Pour la <strong>date du passage</strong>, l&apos;application affiche les <strong>créneaux attendus</strong> issus
            du profil (ouverture 08:00, ronde aléatoire dans une fenêtre, etc.).
          </li>
          <li>
            Tant qu&apos;aucune fiche n&apos;existe pour un créneau, ouvrez-le pour <strong>matérialiser le passage</strong> (création
            de la fiche liée au profil et au créneau).
          </li>
          <li>
            Après l&apos;intervention : <strong>clôturer</strong> la fiche. Sur une ronde contractuelle, le{" "}
            <strong>compte rendu texte est obligatoire</strong> à la clôture.
          </li>
        </ol>

        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Modifier la règle :</strong> utilisez <strong>Modifier la programmation</strong> (onglet Programmations ou
          édition du profil). Conservez les identifiants des lignes si possible pour ne pas désynchroniser les fiches déjà créées.
          <strong> Arrêter le flux</strong> fixe une date de fin avec motif ; <strong>Supprimer</strong> désactive le profil (les
          rondes clôturées restent en historique).
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📋 Lignes de planification (contractuel et exceptionnel)</h3>
        <p className="muted">Chaque ligne décrit un type de passage et les jours où il s&apos;applique (Lun–Dim, jours fériés).</p>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Type de ligne</th>
                <th scope="col">À utiliser pour</th>
                <th scope="col">Champs clés</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Ouverture</strong>
                </td>
                <td>Ronde d&apos;ouverture à heure fixe.</td>
                <td>
                  <strong>Heure demandée</strong> (ex. 08:00).
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Fermeture</strong>
                </td>
                <td>Ronde de fermeture à heure fixe.</td>
                <td>
                  <strong>Heure demandée</strong> (ex. 20:00).
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Accompagnement</strong>
                </td>
                <td>Passage ponctuel à heure précise (souvent une journée unique).</td>
                <td>
                  <strong>Heure demandée</strong> ; le mode <strong>Jour unique</strong> est en général adapté.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Aléatoire</strong>
                </td>
                <td>
                  Une ou plusieurs rondes dans une <strong>fenêtre horaire</strong> (ex. entre 22:00 et 06:00), ou à intervalle
                  régulier.
                </td>
                <td>
                  Fenêtre <strong>de / à</strong>, ou <strong>intervalle en heures</strong> + heure de fin de validité ;{" "}
                  <strong>nombre de rondes</strong> si pas d&apos;intervalle. Passage après minuit : fin le lendemain si fin ≤
                  début.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Les horaires de deux lignes ne doivent pas se chevaucher sur un même jour (refus à l&apos;enregistrement).
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚡ Créer une ronde exceptionnelle</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Onglet <strong>Ronde exceptionnelle</strong> → <strong>Nouvelle ronde</strong> (origine <strong>Appel client</strong>{" "}
            par défaut).
          </li>
          <li>
            <strong>Site</strong>, <strong>Prestataire</strong>, <strong>motif</strong> (et détail si le motif l&apos;exige).
            Indiquez la date/heure de la demande.
          </li>
          <li>
            Définissez la <strong>validité</strong> (Du / Au, éventuellement <strong>Jour unique</strong>) et les{" "}
            <strong>lignes de planification</strong> comme pour un besoin récurrent sur une courte période.
          </li>
          <li>
            Consultez l&apos;<strong>aperçu</strong> : il indique combien de fiches seront créées. Ajustez lignes ou dates si le
            nombre ne convient pas.
          </li>
          <li>
            Validez : toutes les fiches du lot sont créées <strong>immédiatement</strong>. Vous pourrez ensuite les clôturer une
            par une.
          </li>
        </ol>
        <ul className="muted help-center-list">
          <li>
            <strong>Suite intervention :</strong> créez la ronde depuis une intervention <strong>en cours</strong> (origine et
            site souvent déjà renseignés).
          </li>
          <li>
            <strong>Demande liée :</strong> sur un lot exceptionnel existant, rouvrez la demande pour modifier site, validité ou
            grille ; les fiches <strong>non clôturées</strong> peuvent être resynchronisées, les fiches <strong>clôturées</strong>{" "}
            sont conservées.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Clôturer un passage (terrain)</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>En cours :</strong> ouvrez la fiche (coche ou crayon) et renseignez le passage : heures d&apos;arrivée et de
            départ, n° de bon, compte rendu, champs complémentaires éventuels du profil.
          </li>
          <li>
            <strong>Ronde contractuelle :</strong> le <strong>compte rendu texte est obligatoire</strong> pour clôturer.
          </li>
          <li>
            <strong>Ronde exceptionnelle :</strong> compte rendu, heures et n° de bon sont <strong>facultatifs</strong> (seul un
            format d&apos;heure invalide est refusé si vous en saisissez). La trace de la demande reste même sans détail terrain.
          </li>
          <li>
            <strong>Annuler</strong> demande un motif. <strong>Rouvrir</strong> une fiche clôturée ou annulée est possible selon vos
            droits, pour corriger ou compléter.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">💡 Exemples pratiques</h3>
        <ul className="muted help-center-list help-center-list--examples">
          <li>
            <strong>Besoin :</strong> ouverture tous les matins à 08:00 du lundi au samedi sur 1 an.
            <br />
            <strong>→ Contractuel :</strong> <em>Planifier une ronde</em> — validité sur 1 an, ligne <strong>Ouverture</strong>{" "}
            08:00, Lun–Sam. Chaque matin : matérialiser le créneau du jour puis clôturer avec compte rendu.
          </li>
          <li>
            <strong>Besoin :</strong> 3 rondes aléatoires chaque nuit entre 22:00 et 06:00 en semaine.
            <br />
            <strong>→ Contractuel :</strong> ligne <strong>Aléatoire</strong>, fenêtre 22:00–06:00, nombre de rondes = 3, Lun–Ven.
          </li>
          <li>
            <strong>Besoin :</strong> le client demande des rondes renforcées du mercredi au vendredi de cette semaine.
            <br />
            <strong>→ Exceptionnel :</strong> <em>Nouvelle ronde</em> — validité sur la semaine, lignes adaptées, vérifier
            l&apos;aperçu, valider le lot.
          </li>
          <li>
            <strong>Besoin :</strong> ronde suite à une intervention déjà saisie.
            <br />
            <strong>→ Exceptionnel :</strong> créer depuis l&apos;intervention <strong>en cours</strong> (lien et contexte
            conservés).
          </li>
        </ul>
      </div>
    </article>
  );
}
