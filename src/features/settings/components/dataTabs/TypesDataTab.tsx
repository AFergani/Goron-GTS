/**
 * Onglet types d’anomalie main courante (libellé, couleur).
 */

import type { AnomalyTypeRef } from "../../../../types";
import type { OpenDeleteReasonModal } from "./common";
import { LabelColorReferenceDataTab } from "./LabelColorReferenceDataTab";

type TypesDataTabProps = {
  canDeleteData: boolean;
  filteredTypes: AnomalyTypeRef[];
  pageStart: number;
  pageEnd: number;
  onEditType: (item: AnomalyTypeRef) => void;
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
      onEdit={props.onEditType}
      onDelete={props.onDeleteType}
      openDeleteReasonModal={props.openDeleteReasonModal}
      columnLabel="Type d'anomalie"
      emptyMessage="Aucun type d'anomalie. Colonne attendue pour l'import: type anomalie (ou libellé)."
      colorDefault="#1f5fcf"
      deleteReasonPrefix="type"
    />
  );
}
