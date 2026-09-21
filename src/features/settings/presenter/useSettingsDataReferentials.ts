/**
 * Chargement et CRUD des référentiels Paramètres (sites, intervenants, types, fériés, Fransor, pending).
 *
 * Utilisé par `useSettingsPresenter` : l’orchestration onglets / utilisateurs / audit reste dans le presenter.
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "../../../app/session/SessionProvider";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { DataRefreshTarget } from "../model/settings.types";
import type { NotifyToast } from "../../common/model/toast.types";
import type { AnomalyTypeRef, FransorResponsableRef, HolidayRef, IntervenantRef, SiteRef } from "../../../types";
import type { PendingIntervenant, PendingSite } from "../../common/model/pendingRefs.types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import { useSettingsRondePlannedProfiles } from "./useSettingsRondePlannedProfiles";

/**
 * @param params.session - Session courante (aucune écriture si absente)
 * @param params.onError - Message d’erreur utilisateur
 * @param params.onToast - Confirmation métier
 */
export function useSettingsDataReferentials({
  session,
  onError,
  onToast
}: {
  session: Session | null;
  onError: NotifyToast;
  onToast: NotifyToast;
}) {
  const {
    rondePlannedProfiles,
    loadRondePlannedProfiles,
    onUpsertRondePlannedProfile,
    onDeleteRondePlannedProfile,
    onRequestRondePlannedProfileCancellation,
    onReviewRondePlannedProfileCancellationRequest,
    onSetRondePlannedProfilePlanningEnd,
    onSetRondePlannedProfileValidated,
    resetRondePlannedProfiles
  } = useSettingsRondePlannedProfiles({ session, onError, onToast });

  const [sites, setSites] = useState<SiteRef[]>([]);
  const [intervenants, setIntervenants] = useState<IntervenantRef[]>([]);
  const [anomalyTypes, setAnomalyTypes] = useState<AnomalyTypeRef[]>([]);
  const [holidays, setHolidays] = useState<HolidayRef[]>([]);
  const [rondeMotifTypes, setRondeMotifTypes] = useState<RondeMotifTypeRef[]>([]);
  const [fransorResponsables, setFransorResponsables] = useState<FransorResponsableRef[]>([]);
  const [pendingSites, setPendingSites] = useState<PendingSite[]>([]);
  const [pendingIntervenants, setPendingIntervenants] = useState<PendingIntervenant[]>([]);

  const loadSites = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listSites({ requesterRole: session.user.role });
      setSites(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des sites."));
    }
  }, [onError, session]);

  const loadIntervenants = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listIntervenants({ requesterRole: session.user.role });
      setIntervenants(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des intervenants."));
    }
  }, [onError, session]);

  const loadAnomalyTypes = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listAnomalyTypes({ requesterRole: session.user.role });
      setAnomalyTypes(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des types d'anomalie."));
    }
  }, [onError, session]);

  const loadRondeMotifTypes = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listRondeMotifTypes({ requesterRole: session.user.role });
      setRondeMotifTypes(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des motifs de ronde."));
    }
  }, [onError, session]);

  const loadHolidays = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listHolidays({ requesterRole: session.user.role });
      setHolidays(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des jours fériés."));
    }
  }, [onError, session]);

  const loadFransorResponsables = useCallback(async () => {
    if (!session) return;
    onError("");
    try {
      const data = await gtsApiClient.listFransorResponsables({ requesterRole: session.user.role });
      setFransorResponsables(data);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de chargement des responsables Fransor."));
    }
  }, [onError, session]);

  const loadDataSection = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      loadSites(),
      loadIntervenants(),
      loadAnomalyTypes(),
      loadHolidays(),
      loadRondeMotifTypes(),
      loadRondePlannedProfiles(),
      loadFransorResponsables(),
      gtsApiClient
        .listPendingSites({ requesterRole: session.user.role })
        .then((rows) => setPendingSites(rows))
        .catch(() => setPendingSites([])),
      gtsApiClient
        .listPendingIntervenants({ requesterRole: session.user.role })
        .then((rows) => setPendingIntervenants(rows))
        .catch(() => setPendingIntervenants([]))
    ]);
  }, [loadAnomalyTypes, loadFransorResponsables, loadHolidays, loadIntervenants, loadRondeMotifTypes, loadRondePlannedProfiles, loadSites, session]);

  useEffect(() => {
    if (!session) return;
    const loadPendingCounts = () => {
      void gtsApiClient
        .listPendingSites({ requesterRole: session.user.role })
        .then((rows) => setPendingSites(rows))
        .catch(() => setPendingSites([]));
      void gtsApiClient
        .listPendingIntervenants({ requesterRole: session.user.role })
        .then((rows) => setPendingIntervenants(rows))
        .catch(() => setPendingIntervenants([]));
    };
    loadPendingCounts();
    const pendingTimer = setInterval(loadPendingCounts, 30000);
    return () => clearInterval(pendingTimer);
  }, [session]);

  const onCreateSite = async ({
    code,
    name,
    address,
    parc,
    famille
  }: {
    code: string;
    name: string;
    address: string;
    parc: string;
    famille: string;
  }) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        code,
        name,
        address,
        parc,
        famille
      });
      onToast("Site ajouté.");
      await loadSites();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du site."));
    }
  };

  const onDeleteSite = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteSite({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Site supprimé.");
      await loadSites();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du site."));
    }
  };

  const onUpdateSite = async (payload: { id: string; code: string; name: string; address: string; parc: string; famille: string }) => {
    if (!session) return;
    onError("");
    try {
      const current = sites.find((s) => s.id === payload.id);
      await gtsApiClient.updateSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        ...payload,
        expectedUpdatedAt: current?.updatedAt ?? null
      });
      onToast("Site modifié.");
      await loadSites();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du site."));
    }
  };

  const onCreateIntervenant = async (name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        name
      });
      onToast("Intervenant ajouté.");
      await loadIntervenants();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout de l'intervenant."));
    }
  };

  const onDeleteIntervenant = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteIntervenant({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Intervenant supprimé.");
      await loadIntervenants();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression de l'intervenant."));
    }
  };

  const onUpdateIntervenant = async (id: string, name: string) => {
    if (!session) return;
    onError("");
    try {
      const current = intervenants.find((item) => item.id === id);
      await gtsApiClient.updateIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        name,
        expectedUpdatedAt: current?.updatedAt ?? null
      });
      onToast("Intervenant modifié.");
      await loadIntervenants();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification de l'intervenant."));
    }
  };

  const onCreateAnomalyType = async (label: string, colorHex: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createAnomalyType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        label,
        colorHex
      });
      onToast("Type d'anomalie ajouté.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du type d'anomalie."));
    }
  };

  const onDeleteAnomalyType = async (id: string, reason: string) => {
    if (!session) return;
    if (anomalyTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce type d'anomalie est un type système et ne peut pas être supprimé.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.deleteAnomalyType({ requesterRole: session.user.role, requesterUsername: session.user.username, id, reason });
      onToast("Type d'anomalie supprimé.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du type d'anomalie."));
    }
  };

  const onUpdateAnomalyType = async (id: string, label: string, colorHex: string) => {
    if (!session) return;
    if (anomalyTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce type d'anomalie est un type système et ne peut pas être modifié.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.updateAnomalyType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        label,
        colorHex,
        expectedUpdatedAt: anomalyTypes.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Type d'anomalie modifié.");
      await loadAnomalyTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du type d'anomalie."));
    }
  };

  const onCreateHoliday = async (dateIso: string, label: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createHoliday({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        dateIso,
        label
      });
      onToast("Jour férié ajouté.");
      await loadHolidays();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du jour férié."));
    }
  };

  const onUpdateHoliday = async (id: string, dateIso: string, label: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateHoliday({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        dateIso,
        label,
        expectedUpdatedAt: holidays.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Jour férié modifié.");
      await loadHolidays();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du jour férié."));
    }
  };

  const onDeleteHoliday = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteHoliday({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Jour férié supprimé.");
      await loadHolidays();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du jour férié."));
    }
  };

  const onCreateRondeMotifType = async (label: string, colorHex: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        label,
        colorHex,
        requiresFreeText: false
      });
      onToast("Motif de ronde ajouté.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du motif de ronde."));
    }
  };

  const onUpdateRondeMotifType = async (id: string, label: string, colorHex: string) => {
    if (!session) return;
    if (rondeMotifTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce motif de ronde est un type système et ne peut pas être modifié.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.updateRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        label,
        colorHex,
        requiresFreeText: false,
        expectedUpdatedAt: rondeMotifTypes.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Motif de ronde modifié.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du motif de ronde."));
    }
  };

  const onDeleteRondeMotifType = async (id: string, reason: string) => {
    if (!session) return;
    if (rondeMotifTypes.find((item) => item.id === id)?.isSystem) {
      onError("Ce motif de ronde est un type système et ne peut pas être supprimé.");
      return;
    }
    onError("");
    try {
      await gtsApiClient.deleteRondeMotifType({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Motif de ronde supprimé.");
      await loadRondeMotifTypes();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du motif de ronde."));
    }
  };

  const onCreateFransorResponsable = async (name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.createFransorResponsable({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        name
      });
      onToast("Responsable Fransor ajouté.");
      await loadFransorResponsables();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur d'ajout du responsable Fransor."));
    }
  };

  const onUpdateFransorResponsable = async (id: string, name: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.updateFransorResponsable({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        name,
        expectedUpdatedAt: fransorResponsables.find((item) => item.id === id)?.updatedAt ?? null
      });
      onToast("Responsable Fransor modifié.");
      await loadFransorResponsables();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de modification du responsable Fransor."));
    }
  };

  const onDeleteFransorResponsable = async (id: string, reason: string) => {
    if (!session) return;
    onError("");
    try {
      await gtsApiClient.deleteFransorResponsable({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        id,
        reason
      });
      onToast("Responsable Fransor supprimé.");
      await loadFransorResponsables();
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de suppression du responsable Fransor."));
    }
  };

  const onImportSiteRow = async (payload: { code: string; name: string; address: string; parc: string; famille: string }) => {
    if (!session) return;
    await gtsApiClient.createSite({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      ...payload,
      auditMode: "batch"
    });
  };

  const onImportIntervenantRow = async (name: string) => {
    if (!session) return;
    await gtsApiClient.createIntervenant({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      name,
      auditMode: "batch"
    });
  };

  const onImportTypeRow = async (label: string) => {
    if (!session) return;
    await gtsApiClient.createAnomalyType({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      label,
      auditMode: "batch"
    });
  };

  const onLogImportSummary = async (payload: {
    target: "sites" | "intervenants" | "types";
    fileName: string;
    total: number;
    success: number;
    failed: number;
    errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
  }) => {
    if (!session) return;
    await gtsApiClient.logBulkImportAudit({
      requesterRole: session.user.role,
      requesterUsername: session.user.username,
      ...payload
    });
  };

  const onRefreshImportedData = async (target: DataRefreshTarget) => {
    if (target === "sites") {
      await loadSites();
      return;
    }
    if (target === "intervenants") {
      await loadIntervenants();
      return;
    }
    if (target === "fransorResponsables") {
      await loadFransorResponsables();
      return;
    }
    if (target === "pendingSites") {
      if (!session) return;
      const rows = await gtsApiClient.listPendingSites({ requesterRole: session.user.role });
      setPendingSites(rows);
      return;
    }
    if (target === "pendingIntervenants") {
      if (!session) return;
      const rows = await gtsApiClient.listPendingIntervenants({ requesterRole: session.user.role });
      setPendingIntervenants(rows);
      return;
    }
    if (target === "rondeMotifs") {
      await loadRondeMotifTypes();
      return;
    }
    if (target === "holidays") {
      await loadHolidays();
      return;
    }
    await loadAnomalyTypes();
  };

  const onResolvePendingSite = async (payload: { pendingId: string; parc: string; famille: string }) => {
    if (!session) return;
    onError("");
    try {
      const result = await gtsApiClient.resolvePendingSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        parc: payload.parc,
        famille: payload.famille
      });
      const p = result?.propagation;
      const totalPropagated = p
        ? (p.interventionEntries || 0) + (p.rondeEntries || 0) + (p.gardiennageEntries || 0) + (p.mainCouranteEntries || 0)
        : 0;
      const toastMsg = totalPropagated > 0
        ? `Site validé et propagé à ${totalPropagated} entrée(s) existante(s).`
        : "Site en attente validé et ajouté aux sites.";
      onToast(toastMsg);
      await Promise.all([loadSites(), onRefreshImportedData("pendingSites")]);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de validation du site en attente."));
    }
  };

  const onResolvePendingIntervenant = async (payload: { pendingId: string; name: string }) => {
    if (!session) return;
    onError("");
    try {
      const result = await gtsApiClient.resolvePendingIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        name: payload.name
      });
      const p = result?.propagation;
      const totalPropagated = p
        ? (p.interventionEntries || 0) + (p.rondeEntries || 0) + (p.gardiennageEntries || 0)
        : 0;
      const toastMsg = totalPropagated > 0
        ? `Intervenant validé et propagé à ${totalPropagated} entrée(s) existante(s).`
        : "Intervenant en attente validé et ajouté aux intervenants.";
      onToast(toastMsg);
      await Promise.all([loadIntervenants(), onRefreshImportedData("pendingIntervenants")]);
    } catch (err) {
      onError(extractUserFacingErrorMessage(err, "Erreur de validation de l'intervenant en attente."));
    }
  };

  const onDeletePendingSiteSubmission = async (payload: { pendingId: string; reason: string }) => {
    if (!session) return;
    try {
      await gtsApiClient.deletePendingSite({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        reason: payload.reason
      });
      onToast("Soumission site en attente supprimée.");
      await onRefreshImportedData("pendingSites");
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur de suppression de la soumission site.");
      throw new Error(message);
    }
  };

  const onDeletePendingIntervenantSubmission = async (payload: { pendingId: string; reason: string }) => {
    if (!session) return;
    try {
      await gtsApiClient.deletePendingIntervenant({
        requesterRole: session.user.role,
        requesterUsername: session.user.username,
        pendingId: payload.pendingId,
        reason: payload.reason
      });
      onToast("Soumission intervenant en attente supprimée.");
      await onRefreshImportedData("pendingIntervenants");
    } catch (err) {
      const message = extractUserFacingErrorMessage(err, "Erreur de suppression de la soumission intervenant.");
      throw new Error(message);
    }
  };


  const resetDataReferentials = useCallback(() => {
    setSites([]);
    setIntervenants([]);
    setAnomalyTypes([]);
    setHolidays([]);
    setRondeMotifTypes([]);
    resetRondePlannedProfiles();
    setFransorResponsables([]);
    setPendingSites([]);
    setPendingIntervenants([]);
  }, [resetRondePlannedProfiles]);

  return {
    sites,
    intervenants,
    anomalyTypes,
    holidays,
    rondeMotifTypes,
    rondePlannedProfiles,
    fransorResponsables,
    pendingSites,
    pendingIntervenants,
    loadDataSection,
    onCreateSite,
    onUpdateSite,
    onDeleteSite,
    onCreateIntervenant,
    onUpdateIntervenant,
    onDeleteIntervenant,
    onCreateAnomalyType,
    onUpdateAnomalyType,
    onDeleteAnomalyType,
    onCreateHoliday,
    onUpdateHoliday,
    onDeleteHoliday,
    onCreateRondeMotifType,
    onUpdateRondeMotifType,
    onDeleteRondeMotifType,
    onUpsertRondePlannedProfile,
    onDeleteRondePlannedProfile,
    onRequestRondePlannedProfileCancellation,
    onReviewRondePlannedProfileCancellationRequest,
    onSetRondePlannedProfilePlanningEnd,
    onSetRondePlannedProfileValidated,
    onCreateFransorResponsable,
    onUpdateFransorResponsable,
    onDeleteFransorResponsable,
    onImportSiteRow,
    onImportIntervenantRow,
    onImportTypeRow,
    onLogImportSummary,
    onRefreshImportedData,
    onResolvePendingSite,
    onResolvePendingIntervenant,
    onDeletePendingSiteSubmission,
    onDeletePendingIntervenantSubmission,
    resetDataReferentials
  };
}
