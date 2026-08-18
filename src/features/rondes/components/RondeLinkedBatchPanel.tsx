/**
 * Panneau lot de demandes exceptionnelles liées (aperçu, suppression groupe).
 */

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import type { RondeEntry } from "../model/ronde.types";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import type { NotifyToast } from "../../common/model/toast.types";

function statusWordFr(status: RondeEntry["status"]): string {
  switch (status) {
    case "EN_COURS":
      return "En cours";
    case "CLOTURE":
      return "Clôturé";
    case "ANNULE":
      return "Annulé";
    default:
      return status;
  }
}

type RondeLinkedBatchPanelProps = {
  entries: RondeEntry[];
  onOpenRonde: (entry: RondeEntry) => void;
  onNotify?: NotifyToast;
  bulkCancelBatch: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; cancelledCount: number; skippedCount: number } | null>;
  bulkDeleteBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; deletedCount: number; skippedCount?: number } | null>;
  /** Notifie le parent après annulation / suppression réussie (ex. fermer la modale). */
  onBatchDestructiveDone?: () => void;
};

export function RondeLinkedBatchPanel({
  entries,
  onOpenRonde,
  onNotify,
  bulkCancelBatch,
  bulkDeleteBatch,
  onBatchDestructiveDone
}: RondeLinkedBatchPanelProps) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.requestDate.localeCompare(b.requestDate)),
    [entries]
  );
  const inProgressIds = useMemo(
    () => sortedEntries.filter((e) => e.status === "EN_COURS").map((e) => e.id),
    [sortedEntries]
  );
  const counts = useMemo(() => {
    return sortedEntries.reduce(
      (acc, e) => {
        acc[e.status] += 1;
        return acc;
      },
      { EN_COURS: 0, CLOTURE: 0, ANNULE: 0 }
    );
  }, [sortedEntries]);

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  return (
    <>
      <section className="panel ronde-demand-consult__batch-section" style={{ marginTop: 12, padding: 12 }}>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Fiches du lot · {sortedEntries.length} passage{sortedEntries.length > 1 ? "s" : ""} (en cours {counts.EN_COURS},
          clôturés {counts.CLOTURE}, annulés {counts.ANNULE})
        </p>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.9em" }}>
          En validant une modification du planning du lot : les passages prévus sont recalculés depuis la grille — les fiches non
          clôturées qui ne correspondent plus sont retirées, les passages encore manquants sont créés. Les clôturées restent conservées en
          base.
        </p>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.9em" }}>
          Annulation ouverte à tous les rôles. Suppression réservée au responsable : les fiches clôturées sont conservées, la programmation
          du lot est désactivée, puis les autres fiches sont supprimées.
        </p>
        <div className="app-scroll-panel ronde-linked-batch-table-scroll">
          <table className="ronde-demand-consult__table">
            <thead>
              <tr>
                <th>Passage</th>
                <th>Statut</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(`${e.requestDate}T12:00:00`).toLocaleDateString("fr-FR")}</td>
                  <td>{statusWordFr(e.status)}</td>
                  <td style={{ width: 48 }}>
                    <button
                      type="button"
                      className="btn-light action-icon-btn"
                      title="Ouvrir la fiche"
                      aria-label="Ouvrir la fiche"
                      onClick={() => onOpenRonde(e)}
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          {inProgressIds.length ? (
            <button type="button" className="btn-light" onClick={() => setConfirmCancelOpen(true)}>
              Annuler toutes les rondes « en cours »
            </button>
          ) : null}
          {bulkDeleteBatch && sortedEntries.length ? (
            <button type="button" className="btn-danger" onClick={() => setConfirmDeleteOpen(true)}>
              Supprimer tout le lot
            </button>
          ) : null}
        </div>
      </section>

      <ConfirmModal
        isOpen={confirmCancelOpen}
        title="Annuler les passages en cours"
        message={`Toutes les fiches encore « En cours » de ce lot seront annulées (${inProgressIds.length}). Les fiches déjà clôturées ou annulées sont inchangées.`}
        confirmLabel="Annuler les rondes en cours"
        confirmClassName="btn-danger"
        confirmDisabled={!cancelReason.trim()}
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={async () => {
          const r = cancelReason.trim();
          if (!r) return;
          const res = await bulkCancelBatch(inProgressIds, r);
          setConfirmCancelOpen(false);
          if (res?.ok) {
            onNotify?.(`${res.cancelledCount} passage(s) annulé(s).${res.skippedCount ? ` ${res.skippedCount} ignorée(s).` : ""}`);
            onBatchDestructiveDone?.();
          }
        }}
      >
        <label className="form-block" style={{ marginTop: 10 }}>
          Motif obligatoire
          <textarea className="mc-textarea" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </label>
      </ConfirmModal>

      <ConfirmModal
        isOpen={confirmDeleteOpen && Boolean(bulkDeleteBatch)}
        title="Supprimer définitivement le lot"
        message={`Les fiches clôturées (${counts.CLOTURE}) seront conservées. La programmation du lot sera désactivée, puis les autres fiches seront supprimées (${sortedEntries.length - counts.CLOTURE}). Motif obligatoire pour l’historique.`}
        confirmLabel="Supprimer le lot"
        confirmClassName="btn-danger"
        confirmDisabled={!deleteReason.trim()}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          const r = deleteReason.trim();
          if (!bulkDeleteBatch || !r) return;
          /* Envoyer tout le lot : le backend applique les règles métier (clôturées + auteur). */
          const res = await bulkDeleteBatch(
            sortedEntries.map((x) => x.id),
            r
          );
          setConfirmDeleteOpen(false);
          if (res?.ok) {
            const skipped = typeof res.skippedCount === "number" ? res.skippedCount : 0;
            onNotify?.(
              `${res.deletedCount} fiche(s) supprimée(s).${skipped ? ` ${skipped} fiche(s) clôturée(s) conservée(s) + programmation désactivée.` : ""}`
            );
            onBatchDestructiveDone?.();
          }
        }}
      >
        <label className="form-block" style={{ marginTop: 10 }}>
          Motif obligatoire
          <textarea className="mc-textarea" rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
        </label>
      </ConfirmModal>
    </>
  );
}
