import { useState } from "react";
import { Copy } from "lucide-react";

export function HelpSettingsDatabaseTopic() {
  const [copied, setCopied] = useState<string | null>(null);
  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 1200);
    } catch {
      setCopied(null);
    }
  };

  const clientCommands = ["hostname", "whoami", "ipconfig"].join("\n");
  const sharePathHint = String.raw`\\SERVEUR\partage\Goron-GTS\data\gts_writer-config.json`;

  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">💾 Gestion de la base de données</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Gestion base de données</strong> (accessible dans les <em>Paramètres</em>) centralise la configuration de la base SQLite
        partagée, le suivi de l&apos;archivage, ainsi que la génération du fichier réseau de synchronisation{" "}
        <strong>gts_writer-config.json</strong> (qui gère la bascule Master / Backup sur le réseau local).
      </p>
      <p className="help-center-lead">
        Une base de données correctement configurée est indispensable au fonctionnement de tous les modules métiers de l&apos;application. Pour des
        raisons de sécurité, toutes les actions critiques (changement de fichier source, archivage manuel, bascule vers une archive) sont tracées dans
        le <strong>journal d&apos;audit</strong> de la station.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits : qui peut gérer quoi ?</h3>
        <div className="help-center-callout help-center-callout--tip" role="note">
          <strong>Rappel :</strong> cet onglet est visible si le module <em>Paramètres</em> est activé sur votre compte. Les actions disponibles
          dépendent ensuite de votre niveau de responsabilité.
        </div>
        <div className="help-center-table-wrap">
          <table className="help-center-table">
            <thead>
              <tr>
                <th scope="col">Votre profil</th>
                <th scope="col">Droits sur cet onglet</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Directeur de station</strong>
                  <br />
                  <strong>Responsable de station</strong>
                </td>
                <td>
                  <strong>Gestion complète :</strong> modification de l&apos;emplacement de la base, bascule entre les fichiers détectés, déclenchement
                  manuel de l&apos;archivage, ouverture d&apos;une archive en mode « source active » et génération du fichier de configuration du{" "}
                  <em>writer</em>.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Superviseur</strong>
                </td>
                <td>
                  <strong>Gestion restreinte (consultation et lecture) :</strong> consultation des statuts et du tableau des bases. Autorisé à ouvrir
                  une archive en édition uniquement si le poste local l&apos;y autorise.{" "}
                  <em>Modification de chemin et archivage manuel refusés.</em>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Opérateur</strong>
                </td>
                <td>
                  <strong>Consultation simple :</strong> affichage de la base active et des indicateurs de santé (si l&apos;accès aux paramètres lui
                  est ouvert). <em>Toute action de modification lui est refusée.</em>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Organisation des fichiers et architecture réseau</h3>
        <p className="muted">
          Le système repose sur la coexistence de <strong>deux architectures distinctes</strong> sur votre réseau local (LAN) :
        </p>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>Le partage de fichiers (SMB) :</strong> un dossier partagé sur votre serveur (ex. <code>\\SERVEUR\partage</code>) qui héberge la base
            de données, les modèles Word et les fichiers de configuration.
          </li>
          <li>
            <strong>Le service de synchronisation (Writer TCP) :</strong> un flux réseau direct utilisant des ports TCP dédiés entre les postes
            configurés en <em>Master</em> et <em>Backup</em> pour sécuriser et sérialiser les écritures en base.
          </li>
        </ol>
        <h4 className="help-center-subsection-title">Structure des dossiers sur le partage</h4>
        <ul className="muted help-center-list">
          <li>
            <code>data/Activedb</code> : contient la base de données courante de l&apos;exploitation (généralement <code>gts-active.db</code>).
          </li>
          <li>
            <code>data/Archives</code> : reçoit les copies de sauvegardes trimestrielles (ex.{" "}
            <code>GTS-du_JJ-MM-AAAA_au_JJ-MM-AAAA.db</code>).
          </li>
          <li>
            <code>data/gts_writer-config.json</code> : fichier de configuration réseau à placer à la racine du dossier <code>data</code> pour que tous
            les postes clients trouvent le <em>writer</em> actif.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📊 Indicateurs de santé et barre d&apos;actions</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Le bandeau supérieur de l&apos;écran vous permet de contrôler l&apos;état du système en temps réel :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>DB active :</strong> affiche le chemin réseau de la base SQLite actuellement sollicitée par votre poste.
          </li>
          <li>
            <strong>Base ouverte sur :</strong> alerte visuelle indiquant si une archive est actuellement chargée en mode édition (par vous ou par un
            autre poste de la station).
          </li>
          <li>
            <strong>Indicateurs d&apos;archivage :</strong> statut du dernier run, nombre de jobs en file d&apos;attente et affichage de la{" "}
            <em>dernière erreur</em> système.
          </li>
        </ul>
        <h4 className="help-center-subsection-title">Boutons d&apos;action rapide</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Changer emplacement DB :</strong> permet de lier un nouveau fichier <code>.db</code> (le système le normalisera automatiquement dans
            le dossier <code>Activedb</code>).
          </li>
          <li>
            <strong>Rafraîchir les bases / l&apos;archivage :</strong> force la redétection des fichiers sur le partage et actualise les compteurs de
            santé.
          </li>
          <li>
            <strong>Lancer archivage maintenant :</strong> déclenche immédiatement un cycle d&apos;archivage (rotation trimestrielle + archivage
            logique de la main courante).
          </li>
        </ul>
        <p className="muted">
          À l&apos;ouverture de l&apos;onglet, la liste des bases et le statut d&apos;archivage se rafraîchissent déjà automatiquement.
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📋 Tableau des bases détectées</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Le tableau liste les fichiers SQLite repérés dans <code>Activedb</code> et <code>Archives</code> :
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Statut Active :</strong> base opérationnelle courante.
          </li>
          <li>
            <strong>Archive source active :</strong> archive montée en édition.
          </li>
          <li>
            <strong>Archive consultable :</strong> archive disponible sans session ouverte.
          </li>
          <li>
            <strong>Actions :</strong> <em>Basculer sur cette base</em>, <em>Revenir à la base active locale</em> (poste ayant ouvert l&apos;archive),
            ou mention <em>Utilisée</em> / <em>Lecture seule</em> selon le contexte réseau.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🗄️ Le mécanisme d&apos;archivage automatique</h3>
        <p className="muted">
          L&apos;application combine deux actions distinctes pour optimiser les performances de la base active :
        </p>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            <strong>La rotation trimestrielle :</strong> au changement de trimestre civil, l&apos;application crée automatiquement une copie figée de
            la base dans le dossier <code>Archives</code>. La base opérationnelle (<code>gts-active.db</code>) reste allégée mais conserve
            l&apos;intégralité de vos référentiels (sites, intervenants, comptes utilisateurs).{" "}
            <em>Ce mécanisme automatique nécessite au moins 90 jours d&apos;activité enregistrée.</em>
          </li>
          <li>
            <strong>L&apos;archivage logique (main courante) :</strong> les événements clôturés depuis plus de <strong>10 jours</strong> sont marqués
            comme archivés. Ils restent consultables par les opérateurs mais sortent du flux opérationnel courant pour accélérer les affichages.{" "}
            <em>L&apos;archivage logique automatique ne s&apos;exécute pas plus d&apos;une fois tous les 10 jours.</em>
          </li>
        </ol>
        <p className="muted">
          En mode client writer avec file SMB, un archivage manuel peut être mis en file d&apos;attente pour exécution sur le poste writer.
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📂 Mode archive « source active »</h3>
        <p className="muted">
          Pour consulter ou corriger une information historique, un responsable peut monter un fichier situé dans le dossier <code>Archives</code> en
          mode « source active ».
        </p>
        <ul className="muted help-center-list">
          <li>
            <strong>Impact sur le réseau :</strong> pendant toute la durée de la session, les autres postes de la station reçoivent une alerte et
            basculent automatiquement en <strong>lecture seule</strong> sur les archives pour éviter les conflits d&apos;écriture.
          </li>
          <li>
            <strong>Fermeture de session :</strong> une fois vos vérifications terminées, cliquez impérativement sur{" "}
            <strong>Revenir à la base active locale</strong> (visible uniquement sur le poste qui a ouvert l&apos;archive) pour rétablir le
            fonctionnement normal de la station.
          </li>
        </ul>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔑 Configuration du service « Writer » (gts_writer-config.json)</h3>
        <p className="muted">
          Le bloc inférieur de l&apos;écran vous permet de générer le fichier de configuration nécessaire à la communication TCP entre les postes.
        </p>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Attention :</strong> le secret de sécurité (HMAC) est régénéré à chaque création de fichier. Si vous générez un nouveau JSON, tous
          les postes de la station devront recharger leur configuration pour pouvoir écrire à nouveau en base.
        </div>
        <h4 className="help-center-subsection-title">Éléments à configurer dans le formulaire</h4>
        <ul className="muted help-center-list">
          <li>
            <strong>Sous-réseau (CIDR) :</strong> la plage IP de votre réseau local permettant la découverte automatique du service (ex.{" "}
            <code>192.168.111.0/24</code>).
          </li>
          <li>
            <strong>Paramètres de liaison :</strong> fréquence du signal (<em>Heartbeat</em>), délai max avant déclaration d&apos;incident (
            <em>Timeout</em>) et temps d&apos;attente avant bascule (<em>Retry</em>).
          </li>
          <li>
            <strong>Ports TCP :</strong> par convention, le port <strong>4711</strong> pour le poste Master et <strong>4811</strong> pour le poste
            Backup. Ces ports doivent être ouverts dans les pare-feux de vos machines locales.
          </li>
          <li>
            <strong>Bouton « Préremplir avec ce poste » :</strong> injecte automatiquement le nom de la machine, son adresse IP et son compte Windows
            actuel.
          </li>
          <li>
            <strong>Générer le fichier writer :</strong> enregistre le JSON dans le dossier <code>data</code> du partage.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">✅ Workflow de mise en service conseillé</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>
            Configurez le chemin de la base et assurez-vous que le statut affiche <strong>Active</strong> sur le fichier <code>gts-active.db</code>.
          </li>
          <li>
            Sur le poste destiné à être le serveur principal (<strong>Master</strong>), ouvrez l&apos;écran, cliquez sur <em>Préremplir avec ce poste</em>{" "}
            et contrôlez la cohérence de l&apos;IPv4.
          </li>
          <li>Répétez l&apos;opération pour le poste de secours (<strong>Backup</strong>).</li>
          <li>
            Cliquez sur <strong>Générer le fichier writer</strong> et vérifiez sa présence sur votre partage réseau (ex.{" "}
            <code>{sharePathHint}</code>).
          </li>
          <li>
            Redémarrez ou actualisez l&apos;application sur les postes clients, puis contrôlez l&apos;indicateur de statut du <em>writer</em> dans la
            barre latérale (état Master / Backup et disponibilité).
          </li>
        </ol>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">⌨️ Outils de diagnostic (PowerShell)</h3>
        <p className="muted">
          En cas de doute sur les informations d&apos;un poste client, exécutez les commandes suivantes dans la console du PC pour valider ses
          paramètres réseau :
        </p>
        <div className="db-box help-center-db-box">
          <div className="row">
            <code>{clientCommands}</code>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Copier les commandes"
              aria-label="Copier les commandes"
              onClick={() => void copyText(clientCommands, "cmds")}
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="muted">{copied === "cmds" ? "Commandes copiées." : "À exécuter dans PowerShell sur le poste concerné."}</p>
        </div>
        <div className="db-box help-center-db-box" style={{ marginTop: 12 }}>
          <div className="row">
            <code>{sharePathHint}</code>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Copier le chemin"
              aria-label="Copier le chemin"
              onClick={() => void copyText(sharePathHint, "path")}
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="muted">{copied === "path" ? "Chemin copié." : "Exemple de chemin — à adapter à votre infrastructure."}</p>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">💡 Bonnes pratiques de maintenance</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Communiquez avant d&apos;agir :</strong> ne modifiez jamais le chemin de la base de données et n&apos;ouvrez pas d&apos;archive en
            pleine journée sans prévenir les opérateurs. Toute modification coupe momentanément les accès en écriture des fiches de terrain.
          </li>
          <li>
            <strong>Doublez vos sauvegardes :</strong> bien que l&apos;application intègre un système d&apos;archivage trimestriel, effectuez des
            sauvegardes externes régulières de l&apos;intégralité de votre dossier partagé <code>data</code> (bases, archives, modèles Word et
            configurations).
          </li>
          <li>
            <strong>Analysez les refus d&apos;archivage :</strong> si le champ <em>Dernière erreur</em> remonte une alerte lors d&apos;un clic sur{" "}
            <em>Lancer archivage maintenant</em>, vérifiez si le délai de sécurité des 10 jours est bien écoulé ou si un autre utilisateur n&apos;a pas
            laissé une session d&apos;archive ouverte.
          </li>
        </ul>
      </div>
    </article>
  );
}
