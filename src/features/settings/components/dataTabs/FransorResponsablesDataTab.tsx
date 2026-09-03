/**
 * Onglet responsables Fransor (référentiel module Fransor).
 */

import type { FransorResponsableRef } from "../../../../types";
import { NameOnlyReferenceDataTab } from "./NameOnlyReferenceDataTab";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

type FransorResponsablesDataTabProps = {
  canDeleteData: boolean;
  filteredFransorResponsables: FransorResponsableRef[];
  pageStart: number;
  pageEnd: number;
  editingFransorResponsableId: string | null;
  editingFransorResponsableName: string;
  setEditingFransorResponsableId: (value: string | null) => void;
  setEditingFransorResponsableName: (value: string) => void;
  onUpdateFransorResponsable: (id: string, name: string) => SyncOrAsync;
  onDeleteFransorResponsable: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function FransorResponsablesDataTab(props: FransorResponsablesDataTabProps) {
  return (
    <NameOnlyReferenceDataTab
      canDeleteData={props.canDeleteData}
      filteredItems={props.filteredFransorResponsables}
      pageStart={props.pageStart}
      pageEnd={props.pageEnd}
      columnLabel="Responsable Fransor"
      emptyMessage="Aucun responsable Fransor."
      deleteReasonPrefix="responsable"
      editingId={props.editingFransorResponsableId}
      editingName={props.editingFransorResponsableName}
      setEditingId={props.setEditingFransorResponsableId}
      setEditingName={props.setEditingFransorResponsableName}
      onUpdate={props.onUpdateFransorResponsable}
      onDelete={props.onDeleteFransorResponsable}
      openDeleteReasonModal={props.openDeleteReasonModal}
    />
  );
}
