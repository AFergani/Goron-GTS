import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique Paramètres — référentiels partagés (sites, prestataires, fériés, etc.). */
export function HelpSettingsDataTopic() {
  return (
    <HelpTopicLayout
      title="🗂️ Gestion des données"
      purpose="Cet onglet des Paramètres centralise les référentiels partagés (sites, prestataires, types...) qui alimentent tous les formulaires de saisie de l'application."
    >
      <ul className="muted help-center-list">
        <li>
          Six sous-onglets : <strong>Sites</strong>, <strong>Intervenants</strong>,{" "}
          <strong>Types d&apos;anomalie</strong>, <strong>Jours fériés</strong>, <strong>Motifs ronde</strong>,{" "}
          <strong>Fransor</strong>.
        </li>
        <li>
          Ajoutez une entrée avec <strong>Nouvelle entrée / Ajouter</strong>, modifiez-la avec le crayon (validez avec
          la disquette), ou supprimez-la avec la corbeille — un <strong>motif est obligatoire</strong> pour toute
          suppression.
        </li>
        <li>
          ⚠️ Une suppression est refusée si la donnée est encore utilisée dans une fiche existante (site avec des
          interventions, type déjà utilisé en main courante, etc.).
        </li>
        <li>
          Sur <strong>Sites</strong> et <strong>Intervenants</strong>, un bouton <strong>Importer</strong> permet
          d&apos;ajouter en masse via un fichier Excel ; les saisies inconnues faites par le terrain apparaissent aussi
          en bannière pour validation ou rejet avec motif. La validation d&apos;un site demande aussi l&apos;adresse :
          une saisie en minuscules est enregistrée et affichée en majuscules.
        </li>
        <li>
          Sur <strong>Jours fériés</strong>, seules les dates locales/spécifiques s&apos;ajoutent ici (les jours fériés
          nationaux sont déjà intégrés) ; elles basculent automatiquement Fransor et Rondes en jour non ouvré.
        </li>
        <li>
          Sur <strong>Types d&apos;anomalie</strong> et <strong>Motifs ronde</strong>, une valeur par défaut système («
          Voir Observation » / « Voir Consigne ») existe toujours et ne peut être ni modifiée ni supprimée.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
