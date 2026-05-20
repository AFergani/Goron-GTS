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
      <p className="help-center-lead writer-config-help-lead">
        Cet onglet regroupe la <strong>base SQLite partagée</strong>, l&apos;<strong>archivage</strong> et la génération de{" "}
        <strong>gts_writer-config.json</strong> pour le service writer (écritures sérialisées, bascule Master / Backup sur le LAN).
      </p>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📁 Base SQLite et fichiers</h3>
        <ul className="muted help-center-list">
          <li>
            <strong>Base active</strong> : une seule base utilisée par les postes ; le chemin peut être un partage UNC (
            <code>\\SERVEUR\…</code>), accès <strong>SMB</strong>.
          </li>
          <li>
            Organisation conseillée : <strong>data/Activedb</strong> pour <strong>gts-active.db</strong> ;{" "}
            <strong>data/Archives</strong> pour les fichiers du type <strong>GTS-du_JJ-MM-AAAA_au_JJ-MM-AAAA.db</strong>.
          </li>
          <li>
            <strong>Changer emplacement DB</strong> enregistre le nouveau chemin ; le tableau liste les bases détectées et permet de{" "}
            <strong>basculer</strong> vers une archive lorsque c&apos;est autorisé.
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🗄️ Archivage</h3>
        <ul className="muted help-center-list">
          <li>La base active conserve une fenêtre glissante d&apos;environ <strong>90 jours</strong> de données métier.</li>
          <li>Un cycle automatique n&apos;est pas enchaîné plus d&apos;une fois tous les <strong>10 jours</strong> (règle produit).</li>
          <li>Les référentiels et comptes restent en base active ; seules les données métier anciennes partent en archive.</li>
          <li>
            À l&apos;ouverture de l&apos;onglet, la liste des bases et le statut d&apos;archivage se <strong>rafraîchissent automatiquement</strong> ; vous
            pouvez aussi utiliser les boutons dédiés pour forcer un contrôle immédiat.
          </li>
        </ul>
        <div className="help-center-subsection help-center-subsection--traceability">
          <h4 className="help-center-subsection-title">Traçabilité</h4>
          <p className="muted">
            Le journal des actions trace notamment l&apos;entrée et la sortie du mode archive. Les modifications dans une archive restent
            historisées dans le fichier d&apos;archive concerné.
          </p>
        </div>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">📂 Mode archive « source active »</h3>
        <ul className="muted help-center-list">
          <li>Un profil <strong>responsable</strong> peut ouvrir une archive en édition dédiée.</li>
          <li>Les autres utilisateurs voient un message explicite ; consultation des archives souvent en lecture seule.</li>
          <li>
            Retour au fonctionnement normal : <strong>Revenir à la base active locale</strong> depuis la ligne de l&apos;archive ouverte
            (lorsque c&apos;est votre poste qui l&apos;a ouverte).
          </li>
        </ul>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🌐 SMB (fichiers) et TCP (writer)</h3>
        <p className="muted">
          Le partage de la base utilise SMB (ports gérés par l&apos;OS). Le writer est un service <strong>TCP</strong> sur le poste Master ou
          Backup : ce ne sont pas les mêmes ports ni le même rôle que le partage fichier. Les deux coexistent.
        </p>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">🔑 Fichier gts_writer-config.json</h3>
        <p className="muted">
          Chaque client sur le LAN lit ce JSON pour joindre le writer. Il contient adresses, noms, ports, délais et un{" "}
          <strong>secret HMAC</strong> généré à la création du fichier. En production : profil Master + Backup, IPv4, failover. Le secret est
          dans <code>writer.secret</code> ; sur un partage commun, tous les nœuds reçoivent la même valeur. Une régénération du fichier
          produit un nouveau secret : tous les postes le reprennent au prochain rechargement de config.
        </p>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">⚙️ Formulaire « Configuration writer »</h3>
        <dl className="writer-config-help-glossary">
          <dt>Sous-réseau (CIDR)</dt>
          <dd>Plage IP du LAN pour la découverte du writer (ex. <code>192.168.111.0/24</code>).</dd>
          <dt>Heartbeat, timeout writer, retry</dt>
          <dd>
            Fréquence de contrôle du writer, délai max avant « injoignable », attente avant nouvelle tentative après échec.
          </dd>
          <dt>Ports TCP</dt>
          <dd>
            Convention <strong>4711</strong> (Master) et <strong>4811</strong> (Backup) ; identiques au port d&apos;écoute du service sur chaque PC — pas le port SMB.
          </dd>
          <dt>Préremplir avec ce poste</dt>
          <dd>Remplit hostname, IPv4 et whoami. En cas de VPN, vérifiez l&apos;IP avec <code>ipconfig</code> et corrigez si besoin.</dd>
          <dt>Master / Backup</dt>
          <dd>
            <strong>Hostname</strong> (<code>hostname</code>), <strong>IPv4</strong> du writer, <strong>whoami</strong> Windows, <strong>port</strong> comme ci-dessus.
          </dd>
        </dl>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">✅ Workflow conseillé</h3>
        <ol className="muted help-center-list">
          <li>Configurer le chemin de la base et vérifier le tableau des fichiers détectés.</li>
          <li>Sur Master puis Backup : « Préremplir avec ce poste », contrôler IPv4 et ports.</li>
          <li>Générer le JSON et l&apos;enregistrer dans le dossier <code>data</code> du partage applicatif.</li>
        </ol>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">⌨️ Commandes utiles (poste client)</h3>
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
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">📎 Exemple de chemin pour le JSON writer</h3>
        <div className="db-box help-center-db-box">
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
          <p className="muted">{copied === "path" ? "Chemin copié." : "À adapter à votre infrastructure réelle."}</p>
        </div>
      </div>
    </article>
  );
}
