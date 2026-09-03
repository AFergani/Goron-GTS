/**
 * Onglet types d’anomalie main courante (libellé, couleur).
 */

import type { AnomalyTypeRef } from "../../../../types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";
import { LabelColorReferenceDataTab } from "./LabelColorReferenceDataTab";

type TypesDataTabProps = {
  canDeleteData: boolean;
  filteredTypes: AnomalyTypeRef[];
  pageStart: number;
  pageEnd: number;
  editingTypeId: string | null;
  editingTypeLabel: string;
  editingTypeColor: string;
  setEditingTypeId: (value: string | null) => void;
  setEditingTypeLabel: (value: string) => void;
  setEditingTypeColor: (value: string) => void;
  onUpdateType: (id: string, label: string, colorHex: string) => SyncOrAsync;
  onDeleteType: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function TypesDataTab(props: TypesDataTabProps) {
  return (
    <LabelColorReferenceDataTab
      canDeleteData={props.canDeleteData}
      filteredItems={props.filteredTypes}
      pageStart={props.pageStart}
      pageEnd={props.pageEnd}
      editingId={props.editingTypeId}
      editingLabel={props.editingTypeLabel}
      editingColor={props.editingTypeColor}
      setEditingId={props.setEditingTypeId}
      setEditingLabel={props.setEditingTypeLabel}
      setEditingColor={props.setEditingTypeColor}
      onUpdate={props.onUpdateType}
      onDelete={props.onDeleteType}
      openDeleteReasonModal={props.openDeleteReasonModal}
      columnLabel="Type d'anomalie"
      emptyMessage="Aucun type d'anomalie. Colonne attendue pour l'import: type anomalie (ou libellé)."
      colorDefault="#1f5fcf"
      deleteReasonPrefix="type"
    />
  );
}
