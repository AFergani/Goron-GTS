/**
 * Rubrique Paramètres — connexion PostgreSQL.
 */

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
  const pgHostHint = "hôte PostgreSQL (ex. 192.168.111.10) — port 5432";

  return (
    <article className="help-center-article">
      <h2 className="help-center-content-title">💾 Gestion de la base de données</h2>
      <p className="help-center-lead">
        L&apos;onglet <strong>Gestion base de données</strong> (accessible dans les <em>Paramètres</em>) centralise la{" "}
        <strong>connexion PostgreSQL</strong>. Le badge <strong>DB</strong> de la sidebar indique si le serveur est
        joignable.
      </p>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔐 Matrice des droits</h3>
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
                <td>Configuration PostgreSQL (hôte, port, base, compte technique), test et reconnexion.</td>
              </tr>
              <tr>
                <td>
                  <strong>Superviseur / Opérateur</strong>
                </td>
                <td>
                  Consultation des indicateurs si l&apos;accès Paramètres est ouvert. Pas de modification de la connexion
                  PostgreSQL.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">🔑 Connexion PostgreSQL et badge DB</h3>
        <p className="muted">
          Chaque poste Goron-GTS se connecte directement au serveur PostgreSQL (PC H24 ou VM). Le secret technique est
          stocké localement de façon chiffrée. Le badge <strong>DB</strong> reflète la joignabilité : vert = accessible,
          rouge = inaccessible.
        </p>
        <div className="help-center-callout help-center-callout--warn" role="note">
          <strong>Important :</strong> tant que PostgreSQL est injoignable, les écritures métier sont refusées. La saisie
          à l&apos;écran n&apos;est pas effacée automatiquement — corrigez le réseau ou le service, puis réessayez.
        </div>
      </div>

      <div className="help-center-card help-center-card--accent">
        <h3 className="help-center-card-title">✅ Mise en service conseillée</h3>
        <ol className="muted help-center-list help-center-list--ordered">
          <li>Renseignez la connexion PostgreSQL (hôte / port / base / compte technique) et testez-la.</li>
          <li>
            Vérifiez le badge <strong>DB</strong> dans la sidebar (accessible) sur chaque poste de la station.
          </li>
        </ol>
      </div>

      <div className="help-center-card">
        <h3 className="help-center-card-title">⌨️ Outils de diagnostic (PowerShell)</h3>
        <p className="muted">
          En cas de doute sur les informations d&apos;un poste client, exécutez les commandes suivantes dans la console du
          PC :
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
            <code>{pgHostHint}</code>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Copier l'exemple"
              aria-label="Copier l'exemple"
              onClick={() => void copyText(pgHostHint, "path")}
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="muted">{copied === "path" ? "Exemple copié." : "Exemple d'hôte PostgreSQL — à adapter à votre infrastructure."}</p>
        </div>
      </div>
    </article>
  );
}
