/**
 * File des demandes d'annulation de gardiennage (une carte par lot).
 */

import { useMemo } from "react";
import { PendingRequestsQueueModal } from "../../common/components/PendingRequestsQueueModal";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { GardiennageEntry } from "../model/gardiennage.types";

type GardiennageCancellationQueueModalProps = {
  isOpen: boolean;
  entries: GardiennageEntry[];
  onClose: () => void;
  onApprove: (entry: GardiennageEntry) => void;
  onReject: (entry: GardiennageEntry) => void;
  onView?: (entry: GardiennageEntry) => void;
};

export function pendingGardiennageCancellationEntries(entries: GardiennageEntry[]): GardiennageEntry[] {
  const byBatch = new Map<string, GardiennageEntry>();
  for (const entry of entries) {
    const request = entry.planningSnapshot?.cancellationRequest;
    if (!request?.requestedAt) continue;
    if (entry.status === "CLOTURE" || entry.status === "ANNULE") continue;
    const key = String(entry.planningBatchId || entry.id);
    const current = byBatch.get(key);
    if (!current || String(entry.recurrenceStartDate) < String(current.recurrenceStartDate)) {
      byBatch.set(key, entry);
    }
  }
  return [...byBatch.values()].sort((a, b) =>
    String(a.planningSnapshot?.cancellationRequest?.requestedAt || "").localeCompare(
      String(b.planningSnapshot?.cancellationRequest?.requestedAt || "")
    )
  );
}

export function GardiennageCancellationQueueModal({
  isOpen,
  entries,
  onClose,
  onApprove,
  onReject,
  onView
}: GardiennageCancellationQueueModalProps) {
  const pending = useMemo(() => pendingGardiennageCancellationEntries(entries), [entries]);
  const rows = useMemo(
    () =>
      pending.map((entry) => {
        const request = entry.planningSnapshot?.cancellationRequest;
        const requestedAt = String(request?.requestedAt || "");
        const datePart = requestedAt.slice(0, 10);
        return {
          id: entry.id,
          title: entry.siteDisplay || "—",
          subtitle: `${entry.startTime || "—"} → ${entry.endTime || "—"}`,
          requestedBy: request?.requestedByDisplay || request?.requestedBy || "",
          reason: request?.reason || "",
          metaLine: /^\d{4}-\d{2}-\d{2}/.test(datePart) ? formatDateShortFr(datePart) || datePart : undefined
        };
      }),
    [pending]
  );
  const byId = useMemo(() => new Map(pending.map((entry) => [entry.id, entry])), [pending]);

  return (
    <PendingRequestsQueueModal
      isOpen={isOpen}
      title="Demandes d'annulation"
      hint="Validez ou refusez les demandes d'annulation de gardiennage. Une journée déjà clôturée est conservée."
      rows={rows}
      searchPlaceholder="Site, demandeur, motif…"
      onClose={onClose}
      onAccept={(id) => {
        const entry = byId.get(id);
        if (entry) onApprove(entry);
      }}
      onReject={(id) => {
        const entry = byId.get(id);
        if (entry) onReject(entry);
      }}
      onView={
        onView
          ? (id) => {
            const entry = byId.get(id);
            if (entry) onView(entry);
          }
          : undefined
      }
      acceptLabel="Accepter"
      rejectLabel="Refuser"
      viewLabel="Voir"
    />
  );
}
