/**
 * Onglet prestataires / intervenants (CRUD via modale).
 */

import type { IntervenantRef } from "../../../../types";
import { NameOnlyReferenceDataTab } from "./NameOnlyReferenceDataTab";
import type { OpenDeleteReasonModal } from "./common";

type IntervenantsDataTabProps = {
  canDeleteData: boolean;
  filteredIntervenants: IntervenantRef[];
  pageStart: number;
  pageEnd: number;
  onEditIntervenant: (item: IntervenantRef) => void;
  onDeleteIntervenant: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function IntervenantsDataTab(props: IntervenantsDataTabProps) {
  return (
    <NameOnlyReferenceDataTab
      canDeleteData={props.canDeleteData}
      filteredItems={props.filteredIntervenants}
      pageStart={props.pageStart}
      pageEnd={props.pageEnd}
      columnLabel="Nom"
      emptyMessage="Aucun intervenant. Colonne attendue pour l'import: nom (alias: intervenant, intervenants, société, prestataire, entreprise)."
      deleteReasonPrefix="intervenant"
      onEdit={props.onEditIntervenant}
      onDelete={props.onDeleteIntervenant}
      openDeleteReasonModal={props.openDeleteReasonModal}
    />
  );
}
