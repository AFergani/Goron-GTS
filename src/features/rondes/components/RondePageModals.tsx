/**
 * Modales de la page Rondes (fiche, demande, profils, files d’attente, gardiennage lié).
 *
 * L’état et les handlers restent dans `RondePage` : ce fichier ne fait que le montage UI.
 */

import type { Dispatch, SetStateAction, ComponentProps } from "react";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import type { RondeEntry, RondeBatchDeleteRequestRef } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import type { RondePlannedProfilePayload, RondePlannedProfileRef } from "../model/rondePlanned.types";
import type { GardiennageSavePayload } from "../../gardiennage/model/gardiennage.types";
import type { RequestOrigin } from "../model/requestOrigin";
import type { RondeEntryCreatePreset } from "../hooks/useRondeEntryForm";
import { useRondePresenter } from "../presenter/useRondePresenter";
import { useRondeReferenceData } from "../presenter/useRondeReferenceData";
import { useRondePlannedProfileLifecycle } from "../hooks/useRondePlannedProfileLifecycle";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { wordExportKey } from "../../common/utils/workstationExportPaths";
import { RondeEntryModal } from "./RondeEntryModal";
import { RondeRequestModal } from "./RondeRequestModal";
import { GardiennageEntryModal } from "../../gardiennage/components/GardiennageEntryModal";
import { RondePlannedProfilesListModal } from "./RondePlannedProfilesListModal";
import { RondePlannedCancellationQueueModal } from "./RondePlannedCancellationQueueModal";
import { RondeBatchDeleteQueueModal } from "./RondeBatchDeleteQueueModal";
import { RondePlannedProfileLifecycleModals } from "./RondePlannedProfileLifecycleModals";

type RondePageModalsProps = {
  requesterRole: Role;
  onToast?: NotifyToast;
  ronde: ReturnType<typeof useRondePresenter>;
  references: ReturnType<typeof useRondeReferenceData>;
  lifecycle: ReturnType<typeof useRondePlannedProfileLifecycle>;
  workstationExports: ReturnType<typeof useWorkstationExports>;
  modalOpen: boolean;
  modalMode: "create" | "edit";
  liveActiveEntry: RondeEntry | null;
  createPreset: RondeEntryCreatePreset | null;
  canAccessGardiennage: boolean;
  canManageRondes: boolean;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
  setModalMode: Dispatch<SetStateAction<"create" | "edit">>;
  setActiveEntry: Dispatch<SetStateAction<RondeEntry | null>>;
  setCreatePreset: Dispatch<SetStateAction<RondeEntryCreatePreset | null>>;
  setLinkedRondeForGardiennage: Dispatch<SetStateAction<RondeEntry | null>>;
  setLinkedGardiennageOpen: Dispatch<SetStateAction<boolean>>;
  linkedGardiennageOpen: boolean;
  linkedRondeForGardiennage: RondeEntry | null;
  createLinkedGardiennage: (payload: GardiennageSavePayload) => Promise<boolean>;
  handleExportRondeWord: (entry: RondeEntry) => Promise<void>;
  openLinkedDemand: NonNullable<ComponentProps<typeof RondeEntryModal>["onOpenLinkedRequest"]>;
  openLinkedDemandForEntry: (entry: RondeEntry, origin: "batch-delete-queue" | "ronde-report" | null) => void;
  requestModalOpen: boolean;
  setRequestModalOpen: Dispatch<SetStateAction<boolean>>;
  clearLinkedDemandNavigation: () => void;
  requestFixedOrigin: RequestOrigin | null;
  requestInitial: {
    requestDate?: string | null;
    motifTypeId?: string | null;
    consigne?: string | null;
    siteId?: string | null;
    intervenantId?: string | null;
    interventionId?: string | null;
  } | null;
  requestPlanningReplay: RondePlanningSnapshotV1 | null;
  linkedDemandAnchorId: string | null;
  linkedDemandGroup: RondeEntry[];
  linkedDemandOrigin: "batch-delete-queue" | "ronde-report" | null;
  refreshBatchDeleteRequests: () => Promise<void> | void;
  setBatchDeleteQueueOpen: Dispatch<SetStateAction<boolean>>;
  onNavigateToLinkedIntervention?: (interventionId: string) => void;
  onNavigateToLinkedGardiennage?: (gardiennageId: string) => void;
  onUpsertRondePlannedProfile?: (
    payload: RondePlannedProfilePayload
  ) => void | Promise<void | RondePlannedProfileRef>;
  onDeleteRondePlannedProfile?: (id: string, reason: string) => void | Promise<unknown>;
  onRequestRondePlannedProfileCancellation?: (id: string, reason: string) => void | Promise<unknown>;
  onReviewRondePlannedProfileCancellationRequest?: (
    id: string,
    payload: { decision: "approve" | "reject"; reviewReason: string; planningEndDate?: string }
  ) => void | Promise<unknown>;
  onSetRondePlannedProfilePlanningEnd?: (id: string, planningEndDate: string, reason: string) => void | Promise<unknown>;
  profileModalOpen: boolean;
  editingProfile: RondePlannedProfileRef | null;
  setEditingProfile: Dispatch<SetStateAction<RondePlannedProfileRef | null>>;
  closeProfileModal: () => void;
  profilesListOpen: boolean;
  setProfilesListOpen: Dispatch<SetStateAction<boolean>>;
  openProfileEditor: (profile: RondePlannedProfileRef) => void;
  cancellationQueueOpen: boolean;
  setCancellationQueueOpen: Dispatch<SetStateAction<boolean>>;
  batchDeleteQueueOpen: boolean;
  batchDeleteRequests: RondeBatchDeleteRequestRef[];
};

/**
 * @param props - État et handlers déjà calculés par `RondePage`
 */
export function RondePageModals(props: RondePageModalsProps) {
  const {
    requesterRole,
    onToast,
    ronde,
    references,
    lifecycle,
    workstationExports,
    modalOpen,
    modalMode,
    liveActiveEntry,
    createPreset,
    canAccessGardiennage,
    canManageRondes,
    setModalOpen,
    setModalMode,
    setActiveEntry,
    setCreatePreset,
    setLinkedRondeForGardiennage,
    setLinkedGardiennageOpen,
    linkedGardiennageOpen,
    linkedRondeForGardiennage,
    createLinkedGardiennage,
    handleExportRondeWord,
    openLinkedDemand,
    openLinkedDemandForEntry,
    requestModalOpen,
    setRequestModalOpen,
    clearLinkedDemandNavigation,
    requestFixedOrigin,
    requestInitial,
    requestPlanningReplay,
    linkedDemandAnchorId,
    linkedDemandGroup,
    linkedDemandOrigin,
    refreshBatchDeleteRequests,
    setBatchDeleteQueueOpen,
    onNavigateToLinkedIntervention,
    onNavigateToLinkedGardiennage,
    onUpsertRondePlannedProfile,
    onDeleteRondePlannedProfile,
    onRequestRondePlannedProfileCancellation,
    onReviewRondePlannedProfileCancellationRequest,
    onSetRondePlannedProfilePlanningEnd,
    profileModalOpen,
    editingProfile,
    setEditingProfile,
    closeProfileModal,
    profilesListOpen,
    setProfilesListOpen,
    openProfileEditor,
    cancellationQueueOpen,
    setCancellationQueueOpen,
    batchDeleteQueueOpen,
    batchDeleteRequests
  } = props;

  return (
    <>
      <RondeEntryModal
        isOpen={modalOpen}
        mode={modalMode}
        entry={liveActiveEntry}
        sites={references.sites}
        intervenants={references.intervenants}
        rondeMotifs={references.rondeMotifs}
        plannedProfiles={references.plannedProfiles}
        linkedInterventionEntry={null}
        onNotify={onToast}
        onClose={() => setModalOpen(false)}
        createPreset={createPreset}
        onCreate={ronde.createEntry}
        onUpdate={ronde.updateEntry}
        onSetStatus={ronde.setStatus}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        onNavigateToLinkedIntervention={onNavigateToLinkedIntervention}
        onNavigateToLinkedGardiennage={onNavigateToLinkedGardiennage}
        canOpenLinkedGardiennage={Boolean(
          canAccessGardiennage &&
            liveActiveEntry &&
            liveActiveEntry.status === "EN_COURS" &&
            !liveActiveEntry.id.startsWith("virtual-planned-")
        )}
        onOpenLinkedGardiennage={() => {
          if (!liveActiveEntry) return;
          setLinkedRondeForGardiennage(liveActiveEntry);
          setLinkedGardiennageOpen(true);
        }}
        onOpenLinkedRequest={openLinkedDemand}
        requesterRole={requesterRole}
        onSaveWord={
          liveActiveEntry ? () => void handleExportRondeWord(liveActiveEntry) : undefined
        }
        onOpenWord={
          liveActiveEntry
            ? () => void workstationExports.openLastExport(wordExportKey("ronde", liveActiveEntry.id), onToast)
            : undefined
        }
        canOpenWord={
          liveActiveEntry
            ? Boolean(workstationExports.getLastPath(wordExportKey("ronde", liveActiveEntry.id)))
            : false
        }
        lastWordFilePath={
          liveActiveEntry ? workstationExports.getLastPath(wordExportKey("ronde", liveActiveEntry.id)) : null
        }
      />
      <GardiennageEntryModal
        isOpen={linkedGardiennageOpen}
        mode="create"
        entry={null}
        sites={references.sites}
        intervenants={references.intervenants}
        holidays={references.holidays}
        requesterRole={requesterRole}
        createPreset={
          linkedRondeForGardiennage
            ? {
                siteId: linkedRondeForGardiennage.siteId,
                siteDisplay: linkedRondeForGardiennage.siteDisplay,
                intervenantId: linkedRondeForGardiennage.intervenantId,
                intervenantName: linkedRondeForGardiennage.intervenantName,
                linkedInterventionId: linkedRondeForGardiennage.originInterventionId ?? null,
                linkedRondeId: linkedRondeForGardiennage.id
              }
            : null
        }
        onClose={() => {
          setLinkedGardiennageOpen(false);
          setLinkedRondeForGardiennage(null);
        }}
        onCreate={createLinkedGardiennage}
        onUpdate={async () => null}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        onNotify={onToast}
      />
      <RondeRequestModal
        isOpen={requestModalOpen}
        onClose={() => {
          setRequestModalOpen(false);
          clearLinkedDemandNavigation();
        }}
        fixedOrigin={requestFixedOrigin}
        initialRequestDate={requestInitial?.requestDate}
        initialMotifTypeId={requestInitial?.motifTypeId}
        initialConsigne={requestInitial?.consigne}
        initialSiteId={requestInitial?.siteId}
        initialIntervenantId={requestInitial?.intervenantId}
        initialInterventionId={requestInitial?.interventionId}
        onNavigateToLinkedIntervention={onNavigateToLinkedIntervention}
        replayPlanningSnapshot={requestPlanningReplay}
        requesterRole={requesterRole}
        linkedBatchEntries={linkedDemandAnchorId && linkedDemandGroup.length ? linkedDemandGroup : null}
        onSaveLinkedBatch={(payload) => ronde.updateBatchSharedFields(payload)}
        cancelLinkedBatchOne={async (entry, reason, kind) =>
          ronde.setStatus(entry.id, entry.updatedAt, "ANNULE", reason, kind)
        }
        bulkCancelLinkedBatch={canManageRondes ? ronde.bulkCancelBatch : undefined}
        bulkDeleteLinkedBatch={canManageRondes ? ronde.bulkDeleteBatch : undefined}
        requestLinkedBatchDelete={!canManageRondes ? ronde.requestBatchDelete : undefined}
        onOpenLinkedBatchRonde={(e) => {
          setRequestModalOpen(false);
          clearLinkedDemandNavigation();
          setCreatePreset(null);
          setActiveEntry(e);
          setModalMode("edit");
          setModalOpen(true);
        }}
        navigateBack={
          linkedDemandOrigin === "batch-delete-queue"
            ? {
                label: "Demandes de suppression",
                title: "Retour aux demandes de suppression",
                onNavigate: () => {
                  setRequestModalOpen(false);
                  clearLinkedDemandNavigation();
                  void refreshBatchDeleteRequests();
                  setBatchDeleteQueueOpen(true);
                }
              }
            : linkedDemandOrigin === "ronde-report" && linkedDemandAnchorId
              ? {
                  label: "Rapport de ronde",
                  title: "Retour au rapport de ronde",
                  onNavigate: () => {
                    const anchor = ronde.entries.find((e) => e.id === linkedDemandAnchorId);
                    if (!anchor) {
                      onToast?.("Rapport de ronde d'origine introuvable.", "error");
                      return;
                    }
                    setRequestModalOpen(false);
                    clearLinkedDemandNavigation();
                    setCreatePreset(null);
                    setActiveEntry(anchor);
                    setModalMode("edit");
                    setModalOpen(true);
                  }
                }
              : null
        }
        onNotify={onToast}
        sites={references.sites}
        intervenants={references.intervenants}
        onCreatePendingSite={references.createPendingSite}
        onCreatePendingIntervenant={references.createPendingIntervenant}
        holidays={references.holidays}
        rondeMotifs={references.rondeMotifs}
        onCreateEntry={async (payload) => ronde.createEntry(payload)}
        onCreateProfile={async (payload) => {
          if (!onUpsertRondePlannedProfile) {
            throw new Error("La création de profil n'est pas disponible.");
          }
          const result = await onUpsertRondePlannedProfile(payload);
          await references.reload();
          return result ?? undefined;
        }}
      />

      {onUpsertRondePlannedProfile ? (
        <RondeRequestModal
          isOpen={profileModalOpen}
          editProfile={editingProfile}
          sites={references.sites}
          intervenants={references.intervenants}
          rondeMotifs={references.rondeMotifs}
          requesterRole={requesterRole}
          onNotify={onToast}
          onClose={closeProfileModal}
          onStopProfile={
            lifecycle.canManageCancellation && onSetRondePlannedProfilePlanningEnd && editingProfile
              ? () => lifecycle.beginStop(editingProfile)
              : undefined
          }
          onRequestStopProfile={
            !lifecycle.canManageCancellation &&
            onRequestRondePlannedProfileCancellation &&
            editingProfile &&
            !editingProfile.cancellationRequestedAt
              ? () => lifecycle.beginRequestCancellation(editingProfile)
              : undefined
          }
          onDeleteProfile={
            lifecycle.canDelete && onDeleteRondePlannedProfile && editingProfile
              ? () => lifecycle.beginDelete(editingProfile)
              : undefined
          }
          onCreateProfile={async (payload) => {
            const result = await onUpsertRondePlannedProfile(payload);
            await references.reload();
            if (result) setEditingProfile(result);
            return result ?? undefined;
          }}
        />
      ) : null}

      <RondePlannedProfilesListModal
        isOpen={profilesListOpen}
        profiles={references.plannedProfiles}
        onClose={() => setProfilesListOpen(false)}
        onOpenProfile={openProfileEditor}
      />

      <RondePlannedCancellationQueueModal
        isOpen={cancellationQueueOpen}
        profiles={references.plannedProfiles}
        onClose={() => setCancellationQueueOpen(false)}
        onApprove={(profile) => {
          lifecycle.beginStop(profile);
        }}
        onReject={(profile) => {
          lifecycle.beginReject(profile);
        }}
        onOpenProfile={(profile) => {
          setCancellationQueueOpen(false);
          openProfileEditor(profile);
        }}
      />

      <RondeBatchDeleteQueueModal
        isOpen={batchDeleteQueueOpen}
        requests={batchDeleteRequests}
        onClose={() => setBatchDeleteQueueOpen(false)}
        onOpenLinkedDemand={(request) => {
          const anchorId = request.entryIds[0];
          const entry =
            (anchorId ? ronde.entries.find((e) => e.id === anchorId) : null) ||
            ronde.entries.find((e) => e.requestBatchId === request.requestBatchId) ||
            null;
          if (!entry) {
            onToast?.("Demande liée introuvable (fiches absentes ou déjà traitées).", "error");
            return;
          }
          setBatchDeleteQueueOpen(false);
          openLinkedDemandForEntry(entry, "batch-delete-queue");
        }}
        onApprove={async (requestBatchId, reviewReason) => {
          const res = await ronde.reviewBatchDeleteRequest(requestBatchId, "approve", reviewReason);
          if (res?.ok) {
            onToast?.("Demande de suppression approuvée.");
            await refreshBatchDeleteRequests();
            return true;
          }
          return false;
        }}
        onReject={async (requestBatchId, reviewReason) => {
          const res = await ronde.reviewBatchDeleteRequest(requestBatchId, "reject", reviewReason);
          if (res?.ok) {
            onToast?.("Demande de suppression refusée.");
            await refreshBatchDeleteRequests();
            return true;
          }
          return false;
        }}
      />

      <RondePlannedProfileLifecycleModals
        lifecycle={lifecycle}
        hasSetPlanningEnd={Boolean(onSetRondePlannedProfilePlanningEnd)}
        hasReviewCancellation={Boolean(onReviewRondePlannedProfileCancellationRequest)}
        hasRequestCancellation={Boolean(onRequestRondePlannedProfileCancellation)}
        hasDelete={Boolean(onDeleteRondePlannedProfile)}
      />

    </>
  );
}
