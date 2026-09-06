/**
 * Modale « Demandes d'arrêt » : file d'attente Accepter / Refuser pour les responsables.
 */

import { useMemo } from "react";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { summarizeRondePlannedProfile } from "../model/rondePlannedSummary";
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
      pendingProfiles.map((row) => ({
        id: row.id,
        title: (row.siteDisplay || row.label || "").trim() || "—",
        subtitle: (
          <span title={summarizeRondePlannedProfile(row)}>{summarizeRondePlannedProfile(row)}</span>
        ),
        requestedBy: row.cancellationRequestedBy || "",
        reason: row.cancellationRequestReason || ""
      })),
    [pendingProfiles]
  );

  const profileById = useMemo(() => new Map(pendingProfiles.map((p) => [p.id, p])), [pendingProfiles]);

  return (
    <RondePendingRequestsQueueModal
      isOpen={isOpen}
      title="Demandes d'arrêt"
      hint="Validez ou refusez les demandes d'arrêt de programmation en attente."
      subjectColumnLabel="Profil"
      rows={rows}
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
    />
  );
}
