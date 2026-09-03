/**
 * Onglet prestataires / intervenants (CRUD).
 */

import type { IntervenantRef } from "../../../../types";
import { NameOnlyReferenceDataTab } from "./NameOnlyReferenceDataTab";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

type IntervenantsDataTabProps = {
  canDeleteData: boolean;
  filteredIntervenants: IntervenantRef[];
  pageStart: number;
  pageEnd: number;
  editingIntervenantId: string | null;
  editingIntervenantName: string;
  setEditingIntervenantId: (value: string | null) => void;
  setEditingIntervenantName: (value: string) => void;
  onUpdateIntervenant: (id: string, name: string) => SyncOrAsync;
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
      editingId={props.editingIntervenantId}
      editingName={props.editingIntervenantName}
      setEditingId={props.setEditingIntervenantId}
      setEditingName={props.setEditingIntervenantName}
      onUpdate={props.onUpdateIntervenant}
      onDelete={props.onDeleteIntervenant}
      openDeleteReasonModal={props.openDeleteReasonModal}
    />
  );
}
