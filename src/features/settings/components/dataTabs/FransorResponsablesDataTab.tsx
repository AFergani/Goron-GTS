/**
 * Onglet responsables Fransor (référentiel module Fransor).
 */

import type { FransorResponsableRef } from "../../../../types";
import { NameOnlyReferenceDataTab } from "./NameOnlyReferenceDataTab";
import type { OpenDeleteReasonModal } from "./common";

type FransorResponsablesDataTabProps = {
  canDeleteData: boolean;
  filteredFransorResponsables: FransorResponsableRef[];
  pageStart: number;
  pageEnd: number;
  onEditFransorResponsable: (item: FransorResponsableRef) => void;
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
      onEdit={props.onEditFransorResponsable}
      onDelete={props.onDeleteFransorResponsable}
      openDeleteReasonModal={props.openDeleteReasonModal}
    />
  );
}
