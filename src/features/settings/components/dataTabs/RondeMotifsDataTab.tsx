/**
 * Onglet motifs de ronde (libellé, couleur).
 */

import type { RondeMotifTypeRef } from "../../../rondes/model/ronde.types";
import type { OpenDeleteReasonModal } from "./common";
import { LabelColorReferenceDataTab } from "./LabelColorReferenceDataTab";

type RondeMotifsDataTabProps = {
  canDeleteData: boolean;
  filteredRondeMotifs: RondeMotifTypeRef[];
  pageStart: number;
  pageEnd: number;
  onEditRondeMotif: (item: RondeMotifTypeRef) => void;
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
      onEdit={props.onEditRondeMotif}
      onDelete={props.onDeleteRondeMotifType}
      openDeleteReasonModal={props.openDeleteReasonModal}
      columnLabel="Motif de ronde"
      emptyMessage="Aucun motif de ronde. Ajoutez des libellés pour alimenter les formulaires opérationnels."
      colorDefault="#5c6bc0"
      deleteReasonPrefix="motif"
    />
  );
}
