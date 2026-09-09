/**
 * Panneau lot exceptionnel : non effectuée unitaire, demande / suppression de lot selon rôle.
 */

import { useEffect, useMemo, useState } from "react";
import type { Role } from "../../../types";
import type { RondeEntry } from "../model/ronde.types";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { NotifyToast } from "../../common/model/toast.types";
import { isRondeManagerRole, isRondePassagePast } from "../utils/rondePassageRules";
import { rondeStatusLabelFr } from "../export/rondeExportFormat";
import { RondeConfirmReasonField } from "./RondeConfirmReasonField";

type RondeLinkedBatchPanelProps = {
  entries: RondeEntry[];
  requesterRole?: Role;
  onOpenRonde: (entry: RondeEntry) => void;
  onNotify?: NotifyToast;
  onCancelOne: (
    entry: RondeEntry,
    reason: string,
    kind: "NON_EFFECTUEE" | "ANNULATION"
  ) => Promise<boolean>;
  bulkCancelBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; cancelledCount: number; skippedCount: number } | null>;
  bulkDeleteBatch?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; deletedCount: number; skippedCount?: number } | null>;
  requestBatchDelete?: (
    entryIds: string[],
    reason: string
  ) => Promise<{ ok: boolean; requestBatchId: string } | null>;
  onBatchDestructiveDone?: () => void;
};

export function RondeLinkedBatchPanel({
  entries,
  requesterRole,
  onOpenRonde,
  onNotify,
  onCancelOne,
  bulkCancelBatch,
  bulkDeleteBatch,
  requestBatchDelete,
  onBatchDestructiveDone
}: RondeLinkedBatchPanelProps) {
  const isManager = isRondeManagerRole(requesterRole);
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

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cancelOneTarget, setCancelOneTarget] = useState<RondeEntry | null>(null);
  const [cancelOneReason, setCancelOneReason] = useState("");
  const [confirmCancelSelectedOpen, setConfirmCancelSelectedOpen] = useState(false);
  const [cancelSelectedReason, setCancelSelectedReason] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmRequestDeleteOpen, setConfirmRequestDeleteOpen] = useState(false);
  const [requestDeleteReason, setRequestDeleteReason] = useState("");

  useEffect(() => {
    const allowed = new Set(inProgressIds);
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [inProgressIds]);

  const selectedCancellableIds = selectedIds.filter((id) => inProgressIds.includes(id));
  const allInProgressSelected =
    inProgressIds.length > 0 && selectedCancellableIds.length === inProgressIds.length;
  const pendingDelete = sortedEntries.some((e) => Boolean(e.batchDeleteRequestedAt));
  const pendingDeleteEntry = sortedEntries.find((e) => Boolean(e.batchDeleteRequestedAt)) ?? null;
  const canSelectRows = isManager || Boolean(requestBatchDelete);

  /** « Non effectuée » = prestataire n’a pas fait : uniquement après passage, côté opérateur. */
  const cancelOneIsNonEffectuee = Boolean(
    cancelOneTarget && !isManager && isRondePassagePast(cancelOneTarget)
  );

  return (
    <>
      <section className="panel ronde-demand-consult__batch-section" style={{ marginTop: 12, padding: 12 }}>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Fiches du lot · {sortedEntries.length} passage{sortedEntries.length > 1 ? "s" : ""} (en cours {counts.EN_COURS},
          clôturés {counts.CLOTURE}, annulés {counts.ANNULE})
        </p>
        {pendingDelete && pendingDeleteEntry ? (
          <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.9em" }}>
            Demande de suppression en attente
            {pendingDeleteEntry.batchDeleteRequestedBy ? ` (${pendingDeleteEntry.batchDeleteRequestedBy})` : ""}
            {pendingDeleteEntry.batchDeleteReason ? ` — ${pendingDeleteEntry.batchDeleteReason}` : ""}.
          </p>
        ) : null}
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.9em" }}>
          {isManager
            ? "Annulation unitaire ou groupée des fiches en cours. Suppression du lot avec règles avant/après passage."
            : "Marquez une ronde déjà passée comme non effectuée. Cochez des rondes en cours pour demander leur suppression (validation responsable)."}
        </p>

        {canSelectRows ? (
          <div className="row-actions ronde-linked-batch-selection-bar" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="btn-light"
              disabled={!inProgressIds.length || allInProgressSelected || pendingDelete}
              onClick={() => setSelectedIds([...inProgressIds])}
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              className="btn-light"
              disabled={!selectedCancellableIds.length}
              onClick={() => setSelectedIds([])}
            >
              Rien sélectionner
            </button>
            {isManager && bulkCancelBatch ? (
              <button
                type="button"
                className="btn-light"
                disabled={!selectedCancellableIds.length}
                onClick={() => {
                  setCancelSelectedReason("");
                  setConfirmCancelSelectedOpen(true);
                }}
              >
                Annuler les rondes cochées
                {selectedCancellableIds.length ? ` (${selectedCancellableIds.length})` : ""}
              </button>
            ) : null}
            {!isManager && requestBatchDelete ? (
              <button
                type="button"
                className="btn-danger"
                disabled={!selectedCancellableIds.length || pendingDelete}
                onClick={() => {
                  setRequestDeleteReason("");
                  setConfirmRequestDeleteOpen(true);
                }}
              >
                Demander la suppression des rondes cochées
                {selectedCancellableIds.length ? ` (${selectedCancellableIds.length})` : ""}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="app-scroll-panel ronde-linked-batch-table-scroll">
          <table className="ronde-demand-consult__table ronde-linked-batch-table">
            <thead>
              <tr>
                {canSelectRows ? <th className="ronde-linked-batch-check-col" aria-hidden /> : null}
                <th>Passage</th>
                <th>Statut</th>
                <th className="ronde-linked-batch-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => {
                const canUnitCancel =
                  e.status === "EN_COURS" && (isManager || isRondePassagePast(e));
                const unitLabel = isManager ? "Annuler" : "Non effectuée";
                const checked = selectedCancellableIds.includes(e.id);
                return (
                  <tr key={e.id}>
                    {canSelectRows ? (
                      <td className="ronde-linked-batch-check-col">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={e.status !== "EN_COURS" || pendingDelete}
                          onChange={(ev) => {
                            if (ev.target.checked) {
                              setSelectedIds((prev) => (prev.includes(e.id) ? prev : [...prev, e.id]));
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== e.id));
                            }
                          }}
                          aria-label={`Sélectionner ${formatDateShortFr(e.requestDate)}`}
                        />
                      </td>
                    ) : null}
                    <td>{formatDateShortFr(e.requestDate) || "—"}</td>
                    <td>
                      {rondeStatusLabelFr(e)}
                      {e.batchDeleteRequestedAt ? (
                        <div className="muted" style={{ fontSize: "0.8em" }}>
                          Suppression demandée
                          {e.batchDeleteReason ? ` — ${e.batchDeleteReason}` : ""}
                        </div>
                      ) : null}
                      {e.batchSuppressedAt ? (
                        <div className="muted" style={{ fontSize: "0.8em" }}>
                          Lot supprimé le {formatDateShortFr(e.batchSuppressedAt.slice(0, 10)) || e.batchSuppressedAt}
                          {e.batchSuppressedReason ? ` — ${e.batchSuppressedReason}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="ronde-linked-batch-actions-col">
                      <div className="row-actions table-row-actions table-row-actions--text">
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text"
                          onClick={() => onOpenRonde(e)}
                        >
                          Rapport
                        </button>
                        {canUnitCancel ? (
                          <button
                            type="button"
                            className="table-action-btn table-action-btn--text"
                            onClick={() => {
                              setCancelOneReason("");
                              setCancelOneTarget(e);
                            }}
                          >
                            {unitLabel}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="row-actions" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          {isManager && bulkDeleteBatch && sortedEntries.length ? (
            <button type="button" className="btn-danger" onClick={() => setConfirmDeleteOpen(true)}>
              Supprimer tout le lot
            </button>
          ) : null}
        </div>
      </section>

      <ConfirmModal
        isOpen={Boolean(cancelOneTarget)}
        title={cancelOneIsNonEffectuee ? "Ronde non effectuée" : "Annuler cette ronde"}
        message={
          cancelOneTarget
            ? cancelOneIsNonEffectuee
              ? `La fiche du ${formatDateShortFr(cancelOneTarget.requestDate) || cancelOneTarget.requestDate} sera marquée non effectuée.`
              : `La fiche du ${formatDateShortFr(cancelOneTarget.requestDate) || cancelOneTarget.requestDate} sera annulée.`
            : ""
        }
        confirmLabel={cancelOneIsNonEffectuee ? "Confirmer non effectuée" : "Annuler cette ronde"}
        confirmClassName="btn-danger"
        confirmDisabled={!cancelOneReason.trim()}
        onCancel={() => setCancelOneTarget(null)}
        onConfirm={async () => {
          const target = cancelOneTarget;
          const r = cancelOneReason.trim();
          if (!target || !r) return;
          const kind: "NON_EFFECTUEE" | "ANNULATION" = isManager ? "ANNULATION" : "NON_EFFECTUEE";
          const ok = await onCancelOne(target, r, kind);
          setCancelOneTarget(null);
          if (ok) onNotify?.(kind === "NON_EFFECTUEE" ? "Ronde marquée non effectuée." : "Ronde annulée.");
        }}
      >
        <RondeConfirmReasonField value={cancelOneReason} onChange={setCancelOneReason} autoFocus />
      </ConfirmModal>

      <ConfirmModal
        isOpen={confirmCancelSelectedOpen && Boolean(bulkCancelBatch)}
        title="Annuler les rondes cochées"
        message={`${selectedCancellableIds.length} passage(s) « En cours » seront annulés.`}
        confirmLabel="Annuler les rondes cochées"
        confirmClassName="btn-danger"
        confirmDisabled={!cancelSelectedReason.trim() || !selectedCancellableIds.length}
        onCancel={() => setConfirmCancelSelectedOpen(false)}
        onConfirm={async () => {
          const ids = [...selectedCancellableIds];
          const r = cancelSelectedReason.trim();
          if (!bulkCancelBatch || !ids.length || !r) return;
          const res = await bulkCancelBatch(ids, r);
          setConfirmCancelSelectedOpen(false);
          if (res?.ok) {
            setSelectedIds([]);
            onNotify?.(
              `${res.cancelledCount} passage(s) traité(s).${res.skippedCount ? ` ${res.skippedCount} ignorée(s).` : ""}`
            );
          }
        }}
      >
        <RondeConfirmReasonField value={cancelSelectedReason} onChange={setCancelSelectedReason} autoFocus />
      </ConfirmModal>

      <ConfirmModal
        isOpen={confirmDeleteOpen && Boolean(bulkDeleteBatch)}
        title="Supprimer le lot"
        message="Avant la fin du lot : fiches sans données → non effectuées ; fiches avec données conservées (motif/date de suppression). Après la fin du lot : suppression des fiches non clôturées."
        confirmLabel="Supprimer le lot"
        confirmClassName="btn-danger"
        confirmDisabled={!deleteReason.trim()}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          const r = deleteReason.trim();
          if (!bulkDeleteBatch || !r) return;
          const res = await bulkDeleteBatch(
            sortedEntries.map((x) => x.id),
            r
          );
          setConfirmDeleteOpen(false);
          if (res?.ok) {
            onNotify?.(
              `Lot traité (${res.deletedCount} supprimée(s)${
                typeof (res as { nonEffectueeCount?: number }).nonEffectueeCount === "number"
                  ? `, ${(res as { nonEffectueeCount?: number }).nonEffectueeCount} non effectuée(s)`
                  : ""
              }${
                typeof (res as { suppressedCount?: number }).suppressedCount === "number"
                  ? `, ${(res as { suppressedCount?: number }).suppressedCount} conservée(s)`
                  : ""
              }).`
            );
            onBatchDestructiveDone?.();
          }
        }}
      >
        <RondeConfirmReasonField
          value={deleteReason}
          onChange={setDeleteReason}
          placeholder="Ex. prestation annulée par le client"
          autoFocus
        />
      </ConfirmModal>

      <ConfirmModal
        isOpen={confirmRequestDeleteOpen && Boolean(requestBatchDelete)}
        title="Demander la suppression des rondes cochées"
        message={`${selectedCancellableIds.length} ronde(s) en cours seront masquées jusqu'à validation ou refus par un responsable. Expliquez pourquoi vous demandez la suppression.`}
        confirmLabel="Envoyer la demande"
        confirmDisabled={!requestDeleteReason.trim() || !selectedCancellableIds.length}
        onCancel={() => setConfirmRequestDeleteOpen(false)}
        onConfirm={async () => {
          const r = requestDeleteReason.trim();
          const ids = [...selectedCancellableIds];
          if (!requestBatchDelete || !r || !ids.length) return;
          const res = await requestBatchDelete(ids, r);
          setConfirmRequestDeleteOpen(false);
          if (res?.ok) {
            setSelectedIds([]);
            onNotify?.("Demande de suppression envoyée.");
            onBatchDestructiveDone?.();
          }
        }}
      >
        <RondeConfirmReasonField
          value={requestDeleteReason}
          onChange={setRequestDeleteReason}
          placeholder="Ex. lot créé par erreur, prestation annulée"
          autoFocus
        />
      </ConfirmModal>
    </>
  );
}
