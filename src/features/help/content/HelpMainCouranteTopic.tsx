import { HelpTopicLayout } from "../components/HelpTopicLayout";

/** Rubrique centre d’aide — module Main courante. */
export function HelpMainCouranteTopic() {
  return (
    <HelpTopicLayout
      title="📒 Main courante"
      purpose="Ce module sert à consigner au fil de l'eau des faits, événements ou incidents (client mécontent, anomalie signalée, etc.), en dehors des missions planifiées."
    >
      <ul className="muted help-center-list">
        <li>
          Cliquez sur <strong>Nouvelle entrée</strong>, choisissez un type d&apos;anomalie et décrivez le fait dans{" "}
          <strong>Observation</strong>. Associez un site si l&apos;info le concerne, ou laissez vide pour un fait
          général.
        </li>
        <li>
          Une fois créée, l&apos;entrée est <strong>En attente</strong> ; vous pouvez encore la modifier tant qu&apos;un
          responsable ne l&apos;a pas traitée.
        </li>
        <li>
          Le responsable traite ensuite l&apos;entrée :
          <ul className="muted help-center-list">
            <li>
              <strong>À suivre</strong> : passe l&apos;entrée en <strong>En cours</strong> et ajoute une note (les notes
              s&apos;accumulent pour former l&apos;historique).
            </li>
            <li>
              <strong>Clôturer</strong> : ferme le dossier (nécessite toujours une observation responsable).
            </li>
          </ul>
        </li>
        <li>
          Une entrée clôturée est figée ; utilisez <strong>Rouvrir</strong> pour la repasser en cours si un nouveau
          suivi est nécessaire.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
