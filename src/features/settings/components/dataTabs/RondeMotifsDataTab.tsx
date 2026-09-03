/**
 * Onglet motifs de ronde (libellé, couleur).
 */

import type { RondeMotifTypeRef } from "../../../rondes/model/ronde.types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";
import { LabelColorReferenceDataTab } from "./LabelColorReferenceDataTab";

type RondeMotifsDataTabProps = {
  canDeleteData: boolean;
  filteredRondeMotifs: RondeMotifTypeRef[];
  pageStart: number;
  pageEnd: number;
  editingRondeMotifId: string | null;
  editingRondeMotifLabel: string;
  editingRondeMotifColor: string;
  setEditingRondeMotifId: (value: string | null) => void;
  setEditingRondeMotifLabel: (value: string) => void;
  setEditingRondeMotifColor: (value: string) => void;
  onUpdateRondeMotifType: (id: string, label: string, colorHex: string) => SyncOrAsync;
  onDeleteRondeMotifType: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function RondeMotifsDataTab(props: RondeMotifsDataTabProps) {
  return (
    <LabelColorReferenceDataTab
      canDeleteData={props.canDeleteData}
      filteredItems={props.filteredRondeMotifs}
      pageStart={props.pageStart}
      pageEnd={props.pageEnd}
      editingId={props.editingRondeMotifId}
      editingLabel={props.editingRondeMotifLabel}
      editingColor={props.editingRondeMotifColor}
      setEditingId={props.setEditingRondeMotifId}
      setEditingLabel={props.setEditingRondeMotifLabel}
      setEditingColor={props.setEditingRondeMotifColor}
      onUpdate={props.onUpdateRondeMotifType}
      onDelete={props.onDeleteRondeMotifType}
      openDeleteReasonModal={props.openDeleteReasonModal}
      columnLabel="Motif de ronde"
      emptyMessage="Aucun motif de ronde. Ajoutez des libellés pour alimenter les formulaires opérationnels."
      colorDefault="#5c6bc0"
      deleteReasonPrefix="motif"
    />
  );
}
