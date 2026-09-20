/**
 * Actions de la barre d’onglets rondes (profils, export, vue jour/liste, files, création).
 */

import { Plus } from "lucide-react";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { ListExportButtons } from "../../common/components/ExportFileButtons";
import type { RondeListView } from "./RondePageTabsBar";

type RondeServiceTabActionsProps = {
  listView: RondeListView;
  activeDisplayMode: "day" | "list";
  canUpsertProfiles: boolean;
  canManageCancellation: boolean;
  pendingCancellationCount: number;
  canManageBatchDelete: boolean;
  pendingBatchDeleteCount: number;
  onOpenProfilesList: () => void;
  onExport: () => void;
  onOpenLastExport: () => void;
  canOpenLastExport: boolean;
  lastExportPath: string | null;
  onDisplayModeChange: (mode: "day" | "list") => void;
  onOpenCancellationQueue: () => void;
  onOpenBatchDeleteQueue: () => void;
  onCreate: () => void;
};

export function RondeServiceTabActions({
  listView,
  activeDisplayMode,
  canUpsertProfiles,
  canManageCancellation,
  pendingCancellationCount,
  canManageBatchDelete,
  pendingBatchDeleteCount,
  onOpenProfilesList,
  onExport,
  onOpenLastExport,
  canOpenLastExport,
  lastExportPath,
  onDisplayModeChange,
  onOpenCancellationQueue,
  onOpenBatchDeleteQueue,
  onCreate
}: RondeServiceTabActionsProps) {
  return (
    <div className="main-courante-table-toolbar tabs-bar__toolbar">
      {listView === "planifie" && canUpsertProfiles ? (
        <button
          type="button"
          className="btn-light"
          title="Parcourir les profils de programmation"
          onClick={onOpenProfilesList}
        >
          Profils des rondes
        </button>
      ) : null}
      {activeDisplayMode === "list" ? (
        <ListExportButtons
          exportDisabled={false}
          canOpenLast={canOpenLastExport}
          lastFilePath={lastExportPath}
          onExport={onExport}
          onOpenLast={onOpenLastExport}
          exportLabel="Export données"
          exportTitle="Exporter Excel (filtres actifs)"
          exportAriaLabel="Exporter données (filtres actifs)"
        />
      ) : null}
      <div className="row-actions">
        <ToggleSwitch
          checked={activeDisplayMode === "day"}
          onChange={(checked) => onDisplayModeChange(checked ? "day" : "list")}
          label={activeDisplayMode === "day" ? "Affichage jour" : "Affichage liste"}
          labelFirst
        />
      </div>
      {listView === "planifie" && canUpsertProfiles && canManageCancellation && pendingCancellationCount > 0 ? (
        <button
          type="button"
          className="btn-light data-pending-submissions-btn"
          title={`${pendingCancellationCount} demande(s) d'arrêt à traiter`}
          onClick={onOpenCancellationQueue}
        >
          Demandes d&apos;arrêt
          <span className="tab-badge" aria-hidden>
            {pendingCancellationCount}
          </span>
        </button>
      ) : null}
      {listView === "urgence" && canManageBatchDelete ? (
        <button
          type="button"
          className="btn-light data-pending-submissions-btn"
          title={
            pendingBatchDeleteCount > 0
              ? `${pendingBatchDeleteCount} demande(s) de suppression à traiter`
              : "Historique des demandes de suppression de lot"
          }
          onClick={onOpenBatchDeleteQueue}
        >
          Demandes de suppression
          {pendingBatchDeleteCount > 0 ? (
            <span className="tab-badge" aria-hidden>
              {pendingBatchDeleteCount}
            </span>
          ) : null}
        </button>
      ) : null}
      <button
        type="button"
        className="mc-btn-primary ronde-primary-action-btn"
        onClick={onCreate}
      >
        <Plus size={16} aria-hidden />
        {listView === "urgence" ? "Nouvelle ronde" : "Nouvelle planification"}
      </button>
    </div>
  );
}
