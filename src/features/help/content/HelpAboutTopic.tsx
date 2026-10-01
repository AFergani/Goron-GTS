/**
 * Rubrique À propos : identité de l'application, version et périmètre.
 */

import { APP_DISPLAY_NAME, APP_VERSION } from "../../../app/appVersion";
import { HelpTopicLayout } from "../components/HelpTopicLayout";

export function HelpAboutTopic() {
  return (
    <HelpTopicLayout
      title="ℹ️ À propos"
      purpose={`${APP_DISPLAY_NAME} (Goron-GTS) est l'application de bureau de la station. Elle sert à saisir, suivre et tracer les actions terrain, tant que le serveur PostgreSQL de la station est joignable.`}
      usageTitle="Fiche application"
    >
      <ul className="muted help-center-list">
        <li>
          <strong>Version</strong> : {APP_VERSION}
        </li>
        <li>
          Chaque poste se connecte en direct à la base <strong>PostgreSQL</strong> de la station (réseau local). Les
          données ne sont pas stockées dans le navigateur.
        </li>
        <li>
          Modules : <strong>Interventions</strong>, <strong>Rondes</strong>, <strong>Gardiennage</strong>,{" "}
          <strong>Main courante</strong>, <strong>Fransor</strong>, et <strong>Paramètres</strong> selon vos droits.
        </li>
        <li>
          Les comptes portent un profil : <strong>opérateur</strong>, <strong>opérateur +</strong>,{" "}
          <strong>superviseur</strong>, <strong>responsable de station</strong>, <strong>directeur de station</strong>{" "}
          ou <strong>admin</strong>. Les modules visibles dépendent de ce profil.
        </li>
        <li>
          Le bouton <strong>?</strong> en bas de la barre latérale ouvre ce centre d&apos;aide. Le numéro de version à
          côté du titre ouvre directement cette rubrique.
        </li>
      </ul>
    </HelpTopicLayout>
  );
}
