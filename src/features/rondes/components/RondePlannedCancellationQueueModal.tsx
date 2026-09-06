/**
 * Modale « Demandes d'arrêt » : file cartes Accepter / Refuser pour les responsables.
 */

import { useMemo } from "react";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { summarizeRondePlannedProfile } from "../model/rondePlannedSummary";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { RondePendingRequestsQueueModal } from "./RondePendingRequestsQueueModal";

type RondePlannedCancellationQueueModalProps = {
  isOpen: boolean;
  profiles: RondePlannedProfileRef[];
  onClose: () => void;
  onApprove: (profile: RondePlannedProfileRef) => void;
  onReject: (profile: RondePlannedProfileRef) => void;
  onOpenProfile?: (profile: RondePlannedProfileRef) => void;
};

export function RondePlannedCancellationQueueModal({
  isOpen,
  profiles,
  onClose,
  onApprove,
  onReject,
  onOpenProfile
}: RondePlannedCancellationQueueModalProps) {
  const pendingProfiles = useMemo(
    () =>
      profiles
        .filter((p) => Boolean(p.cancellationRequestedAt))
        .sort((a, b) =>
          (a.cancellationRequestedAt || "").localeCompare(b.cancellationRequestedAt || "")
        ),
    [profiles]
  );

  const rows = useMemo(
    () =>
      pendingProfiles.map((row) => {
        const requestedAt = String(row.cancellationRequestedAt || "").trim();
        const datePart = requestedAt.slice(0, 10);
        return {
          id: row.id,
          title: (row.siteDisplay || row.label || "").trim() || "—",
          subtitle: (
            <span title={summarizeRondePlannedProfile(row)}>{summarizeRondePlannedProfile(row)}</span>
          ),
          requestedBy: row.cancellationRequestedBy || "",
          reason: row.cancellationRequestReason || "",
          metaLine: /^\d{4}-\d{2}-\d{2}/.test(datePart)
            ? formatDateShortFr(datePart) || datePart
            : requestedAt || undefined
        };
      }),
    [pendingProfiles]
  );

  const profileById = useMemo(() => new Map(pendingProfiles.map((p) => [p.id, p])), [pendingProfiles]);

  return (
    <RondePendingRequestsQueueModal
      isOpen={isOpen}
      title="Demandes d'arrêt"
      hint="Validez ou refusez les demandes d'arrêt de programmation en attente."
      rows={rows}
      searchPlaceholder="Site, profil, demandeur, motif…"
      onClose={onClose}
      onAccept={(id) => {
        const profile = profileById.get(id);
        if (profile) onApprove(profile);
      }}
      onReject={(id) => {
        const profile = profileById.get(id);
        if (profile) onReject(profile);
      }}
      onView={
        onOpenProfile
          ? (id) => {
              const profile = profileById.get(id);
              if (profile) onOpenProfile(profile);
            }
          : undefined
      }
      viewLabel="Voir le profil"
    />
  );
}
