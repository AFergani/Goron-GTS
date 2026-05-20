import { Download } from "lucide-react";
import "./WriterConfigGeneratorPanel.css";

type WriterNode = {
  hostname: string;
  host: string;
  port: number;
  whoami: string;
};

export type WriterConfigDraft = {
  serviceSubnet: string;
  heartbeatIntervalMs: number;
  writerTimeoutMs: number;
  retryIntervalMs: number;
  master: WriterNode;
  backup: WriterNode;
};

type WriterConfigGeneratorPanelProps = {
  draft: WriterConfigDraft;
  onChange: (next: WriterConfigDraft) => void;
  onPrefillNode: (target: "master" | "backup") => void;
  onGenerate: () => void;
};

function NodeEditor({
  title,
  value,
  onChange,
  onPrefill,
  defaultPort
}: {
  title: string;
  value: WriterNode;
  onChange: (next: WriterNode) => void;
  onPrefill: () => void;
  defaultPort: number;
}) {
  return (
    <div className="writer-config-card">
      <div className="writer-config-node-card__head">
        <h4>{title}</h4>
        <button type="button" className="btn-light" onClick={onPrefill}>
          Préremplir avec ce poste
        </button>
      </div>
      <div className="form writer-config-grid-2">
        <label>
          Hostname
          <input value={value.hostname} onChange={(e) => onChange({ ...value, hostname: e.target.value })} />
        </label>
        <label>
          Adresse IPv4
          <input value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value })} />
        </label>
        <label>
          Whoami
          <input value={value.whoami} onChange={(e) => onChange({ ...value, whoami: e.target.value })} />
        </label>
        <label>
          Port TCP ({defaultPort})
          <input
            type="number"
            min={1}
            value={String(value.port)}
            onChange={(e) => onChange({ ...value, port: Number(e.target.value) || defaultPort })}
          />
        </label>
      </div>
    </div>
  );
}

export function WriterConfigGeneratorPanel({ draft, onChange, onPrefillNode, onGenerate }: WriterConfigGeneratorPanelProps) {
  return (
    <section className="panel writer-config-panel">
      <div className="row">
        <h3>Configuration writer</h3>
      </div>
      <p className="muted writer-config-lead">
        Génère <strong>gts_writer-config.json</strong> à placer dans le dossier <code>data</code> du partage. L&apos;aide de l&apos;onglet
        (icône en tête de page) décrit la base, l&apos;archivage et ce fichier.
      </p>

      <div className="writer-config-layout">
        <div className="writer-config-card">
          <h4 className="writer-config-card__title">Options globales</h4>

          <div className="writer-config-subsection">
            <p className="writer-config-subsection__label">Réseau</p>
            <div className="form writer-config-subnet-row">
              <label>
                Sous-réseau (CIDR)
                <input value={draft.serviceSubnet} onChange={(e) => onChange({ ...draft, serviceSubnet: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="writer-config-subsection">
            <p className="writer-config-subsection__label">Délais (millisecondes)</p>
            <div className="form writer-config-grid-3">
              <label>
                Heartbeat
                <input
                  type="number"
                  min={500}
                  value={String(draft.heartbeatIntervalMs)}
                  onChange={(e) => onChange({ ...draft, heartbeatIntervalMs: Number(e.target.value) || 3000 })}
                />
              </label>
              <label>
                Timeout writer
                <input
                  type="number"
                  min={1000}
                  value={String(draft.writerTimeoutMs)}
                  onChange={(e) => onChange({ ...draft, writerTimeoutMs: Number(e.target.value) || 15000 })}
                />
              </label>
              <label>
                Retry
                <input
                  type="number"
                  min={500}
                  value={String(draft.retryIntervalMs)}
                  onChange={(e) => onChange({ ...draft, retryIntervalMs: Number(e.target.value) || 5000 })}
                />
              </label>
            </div>
          </div>

        </div>

        <div className="writer-config-nodes">
          <NodeEditor
            title="Poste Master"
            defaultPort={4711}
            value={draft.master}
            onChange={(master) => onChange({ ...draft, master })}
            onPrefill={() => onPrefillNode("master")}
          />
          <NodeEditor
            title="Poste Backup"
            defaultPort={4811}
            value={draft.backup}
            onChange={(backup) => onChange({ ...draft, backup })}
            onPrefill={() => onPrefillNode("backup")}
          />
        </div>

        <div className="writer-config-actions">
          <button type="button" onClick={onGenerate}>
            <Download size={16} aria-hidden />
            Générer le fichier writer
          </button>
        </div>
      </div>
    </section>
  );
}
