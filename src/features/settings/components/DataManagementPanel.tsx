/**
 * Panneau gestion des données : onglets référentiels, import Excel, pending sites/intervenants.
 *
 * Création et modification passent par la même `FormModal`. L’import Excel (lecture classeur + lot)
 * vit dans `dataExcelImport.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnomalyTypeRef, FransorResponsableRef, HolidayRef, IntervenantRef, SiteRef } from "../../../types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import type { DataRefreshTarget, DataTab } from "../model/settings.types";
import type { PendingIntervenant, PendingSite } from "../../common/model/pendingRefs.types";
import { SitesDataTab } from "./dataTabs/SitesDataTab";
import { IntervenantsDataTab } from "./dataTabs/IntervenantsDataTab";
import { TypesDataTab } from "./dataTabs/TypesDataTab";
import { RondeMotifsDataTab } from "./dataTabs/RondeMotifsDataTab";
import { HolidaysDataTab } from "./dataTabs/HolidaysDataTab";
import { FransorResponsablesDataTab } from "./dataTabs/FransorResponsablesDataTab";
import { DataSearchImportBar } from "./DataSearchImportBar";
import { PendingSubmissionsModal } from "./PendingSubmissionsModal";
import { mergeWithFrenchFixedHolidays } from "../../rondes/model/rondeCalendarLocal";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { FormModal } from "../../common/components/FormModal";
import { TablePaginationBar } from "../../common/components/TablePaginationBar";
import type { NotifyToast } from "../../common/model/toast.types";
import { extractUserFacingErrorMessage } from "../../common/utils/extractUserFacingErrorMessage";
import { handleDataExcelImportSelection } from "../model/dataExcelImport";
import { ReferenceInlineField } from "./shared/ReferenceInlineField";
import { compareTextFr } from "./dataTabs/common";
import "./DataManagementPanel.css";

type DataManagementPanelProps = {
  activeDataTab: DataTab;
  onDataTabChange: (tab: DataTab) => void;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  anomalyTypes: AnomalyTypeRef[];
  holidays: HolidayRef[];
  rondeMotifTypes: RondeMotifTypeRef[];
  fransorResponsables: FransorResponsableRef[];
  pendingSites: PendingSite[];
  pendingIntervenants: PendingIntervenant[];
  onCreateSite: (payload: { code: string; name: string; address: string; parc: string; famille: string }) => void | Promise<void>;
  onUpdateSite: (payload: { id: string; code: string; name: string; address: string; parc: string; famille: string }) => void | Promise<void>;
  onDeleteSite: (id: string, reason: string) => void;
  canDeleteData: boolean;
  onCreateIntervenant: (name: string) => void | Promise<void>;
  onUpdateIntervenant: (id: string, name: string) => void | Promise<void>;
  onDeleteIntervenant: (id: string, reason: string) => void;
  onCreateType: (label: string, colorHex: string) => void | Promise<void>;
  onUpdateType: (id: string, label: string, colorHex: string) => void | Promise<void>;
  onDeleteType: (id: string, reason: string) => void;
  onCreateHoliday: (dateIso: string, label: string) => void | Promise<void>;
  onUpdateHoliday: (id: string, dateIso: string, label: string) => void | Promise<void>;
  onDeleteHoliday: (id: string, reason: string) => void;
  onCreateRondeMotifType: (label: string, colorHex: string) => void | Promise<void>;
  onUpdateRondeMotifType: (id: string, label: string, colorHex: string) => void | Promise<void>;
  onDeleteRondeMotifType: (id: string, reason: string) => void;
  onCreateFransorResponsable: (name: string) => void | Promise<void>;
  onUpdateFransorResponsable: (id: string, name: string) => void | Promise<void>;
  onDeleteFransorResponsable: (id: string, reason: string) => void;
  onImportSiteRow: (payload: { code: string; name: string; address: string; parc: string; famille: string }) => Promise<void>;
  onImportIntervenantRow: (name: string) => Promise<void>;
  onImportTypeRow: (label: string) => Promise<void>;
  onLogImportSummary: (payload: {
    target: "sites" | "intervenants" | "types";
    fileName: string;
    total: number;
    success: number;
    failed: number;
    errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
  }) => Promise<void>;
  onRefreshImportedData: (target: DataRefreshTarget) => Promise<void>;
  onResolvePendingSite: (payload: { pendingId: string; parc: string; famille: string }) => void | Promise<void>;
  onResolvePendingIntervenant: (payload: { pendingId: string; name: string }) => void | Promise<void>;
  onDeletePendingSiteSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onDeletePendingIntervenantSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onNotify: NotifyToast;
};


const EMPTY_SEARCH_BY_TAB: Record<DataTab, string> = {
  sites: "",
  intervenants: "",
  types: "",
  rondeMotifs: "",
  holidays: "",
  fransorResponsables: ""
};

const REFERENTIAL_MODAL_TITLES: Record<DataTab, { add: string; edit: string }> = {
  sites: { add: "Ajouter un site", edit: "Modifier le site" },
  intervenants: { add: "Ajouter un intervenant", edit: "Modifier l'intervenant" },
  types: { add: "Ajouter un type d'anomalie", edit: "Modifier le type d'anomalie" },
  rondeMotifs: { add: "Ajouter un motif de ronde", edit: "Modifier le motif de ronde" },
  holidays: { add: "Ajouter un jour férié", edit: "Modifier le jour férié" },
  fransorResponsables: { add: "Ajouter un responsable Fransor", edit: "Modifier le responsable Fransor" }
};

export function DataManagementPanel(props: DataManagementPanelProps) {
  const [siteCode, setSiteCode] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteParc, setSiteParc] = useState("");
  const [siteFamille, setSiteFamille] = useState("");
  const [intervenantName, setIntervenantName] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [typeColor, setTypeColor] = useState("#1f5fcf");
  const [holidayDateIso, setHolidayDateIso] = useState("");
  const [holidayLabel, setHolidayLabel] = useState("");
  const [holidayYear, setHolidayYear] = useState(String(new Date().getFullYear()));
  const [fransorResponsableName, setFransorResponsableName] = useState("");
  const [rondeMotifLabel, setRondeMotifLabel] = useState("");
  const [rondeMotifColor, setRondeMotifColor] = useState("#5c6bc0");
  const [isImporting, setIsImporting] = useState(false);
  /** Progression multi-fichiers : fichier courant / total (traitement séquentiel). */
  const [importBatchProgress, setImportBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPendingSubmissionsModal, setShowPendingSubmissionsModal] = useState(false);
  const [createModalTarget, setCreateModalTarget] = useState<DataTab>("sites");
  /** Identifiant de la ligne en cours d’édition dans la modale (null = création). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQueryByTab, setSearchQueryByTab] = useState<Record<DataTab, string>>(EMPTY_SEARCH_BY_TAB);
  const [siteParcFilter, setSiteParcFilter] = useState("");
  const [siteFamilleFilter, setSiteFamilleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [deleteReasonTargetLabel, setDeleteReasonTargetLabel] = useState("");
  const [deleteReasonValue, setDeleteReasonValue] = useState("");
  const [onConfirmDeleteReason, setOnConfirmDeleteReason] = useState<((reason: string) => void | Promise<void>) | null>(null);
  const [blockedActionMessage, setBlockedActionMessage] = useState("");
  const searchQuery = searchQueryByTab[props.activeDataTab] || "";
  const setActiveSearchQuery = (value: string) => {
    setSearchQueryByTab((previous) => ({
      ...previous,
      [props.activeDataTab]: value
    }));
  };

  const handleImportSelection = async (files: FileList | null, target: DataTab) => {
    await handleDataExcelImportSelection(files, target, {
      handlers: {
        onImportSiteRow: props.onImportSiteRow,
        onImportIntervenantRow: props.onImportIntervenantRow,
        onImportTypeRow: props.onImportTypeRow,
        onLogImportSummary: props.onLogImportSummary
      },
      onRefreshImportedData: props.onRefreshImportedData,
      onNotify: props.onNotify,
      setIsImporting,
      setImportBatchProgress
    });
  };

  const importColumnsHint =
    props.activeDataTab === "sites"
      ? "Import XLS ou XLSX — plusieurs fichiers possibles (traités l’un après l’autre). Ordre recommandé : Site, Code site, Adresse, CP/Ville, Parc, Famille (en-têtes reconnus même dans un autre ordre)."
      : props.activeDataTab === "intervenants"
        ? "Colonne attendue: nom (alias: intervenant, intervenants, société, prestataire, entreprise). Sélection multiple de fichiers : traitement séquentiel."
      : props.activeDataTab === "types"
        ? "Colonne attendue: type anomalie (ou libellé)."
          : props.activeDataTab === "rondeMotifs"
            ? "Libellés utilisés dans les formulaires de ronde (gestion par les responsables)."
          : props.activeDataTab === "holidays"
            ? "Dates d'exception exclues de la planification automatique des rondes."
        : "Saisie manuelle uniquement pour les responsables Fransor.";

  const filteredSites = props.sites.filter((site) => {
    const query = searchQuery.trim().toLowerCase();
    const byText =
      !query ||
      (
      site.code.toLowerCase().includes(query) ||
      site.name.toLowerCase().includes(query) ||
      (site.address || "").toLowerCase().includes(query) ||
      (site.parc || "").toLowerCase().includes(query) ||
      (site.famille || "").toLowerCase().includes(query)
      );
    const byParc = !siteParcFilter || (site.parc || "").trim().toLowerCase() === siteParcFilter.trim().toLowerCase();
    const byFamille =
      !siteFamilleFilter || (site.famille || "").trim().toLowerCase() === siteFamilleFilter.trim().toLowerCase();
    return byText && byParc && byFamille;
  });
  const siteParcOptions = [...new Set(props.sites.map((s) => (s.parc || "").trim()).filter(Boolean))].sort(compareTextFr);
  const siteFamilleOptions = [...new Set(props.sites.map((s) => (s.famille || "").trim()).filter(Boolean))].sort(
    compareTextFr
  );
  const filteredIntervenants = props.intervenants.filter((intervenant) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return intervenant.name.toLowerCase().includes(query);
  });
  const filteredTypes = props.anomalyTypes.filter((typeItem) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return typeItem.label.toLowerCase().includes(query);
  });
  const filteredRondeMotifs = props.rondeMotifTypes.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return item.label.toLowerCase().includes(query);
  });
  const holidaysForUi = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const yearsFromRows = props.holidays
      .map((item) => Number(String(item.dateIso || "").slice(0, 4)))
      .filter((year) => Number.isFinite(year));
    return mergeWithFrenchFixedHolidays(props.holidays, [nowYear - 1, nowYear, nowYear + 1, ...yearsFromRows]);
  }, [props.holidays]);
  const filteredHolidays = holidaysForUi.filter((item) => {
    const itemYear = String(item.dateIso || "").slice(0, 4);
    const query = searchQuery.trim().toLowerCase();
    if (!query && holidayYear.trim() && itemYear !== holidayYear.trim()) return false;
    if (!query) return true;
    return item.dateIso.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
  });
  const filteredFransorResponsables = props.fransorResponsables.filter((resp) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return resp.name.toLowerCase().includes(query);
  });
  const searchPlaceholder =
    props.activeDataTab === "sites"
      ? "Rechercher un site (code, nom, parc, famille)"
      : props.activeDataTab === "intervenants"
        ? "Rechercher un intervenant (nom)"
          : props.activeDataTab === "rondeMotifs"
            ? "Rechercher par motif"
          : props.activeDataTab === "holidays"
            ? "Rechercher un jour férié (date, libellé)"
        : props.activeDataTab === "fransorResponsables"
          ? "Rechercher un responsable"
        : "Rechercher un type d'anomalie";
  const activeFilteredCount =
    props.activeDataTab === "sites"
      ? filteredSites.length
      : props.activeDataTab === "intervenants"
        ? filteredIntervenants.length
      : props.activeDataTab === "types"
        ? filteredTypes.length
        : props.activeDataTab === "rondeMotifs"
          ? filteredRondeMotifs.length
          : props.activeDataTab === "holidays"
            ? filteredHolidays.length
            : filteredFransorResponsables.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(activeFilteredCount / pageSize));

  useEffect(() => {
    setCurrentPage(1);
    setShowPendingSubmissionsModal(false);
  }, [searchQuery, siteParcFilter, siteFamilleFilter, holidayYear, props.activeDataTab, pageSize]);

  useEffect(() => {
    const pendingCount =
      props.activeDataTab === "sites"
        ? props.pendingSites.length
        : props.activeDataTab === "intervenants"
          ? props.pendingIntervenants.length
          : 0;
    if (pendingCount === 0) {
      setShowPendingSubmissionsModal(false);
    }
  }, [props.activeDataTab, props.pendingIntervenants.length, props.pendingSites.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageStart = pageSize === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageEnd = pageSize === 0 ? activeFilteredCount : pageStart + pageSize;

  const resetCreateForm = () => {
    setSiteCode("");
    setSiteName("");
    setSiteAddress("");
    setSiteParc("");
    setSiteFamille("");
    setIntervenantName("");
    setTypeLabel("");
    setTypeColor("#1f5fcf");
    setRondeMotifLabel("");
    setRondeMotifColor("#5c6bc0");
    setFransorResponsableName("");
    setHolidayDateIso("");
    setHolidayLabel("");
  };

  /** Ferme la modale référentiel et vide le brouillon (création ou édition). */
  const closeReferentialModal = () => {
    setShowCreateModal(false);
    setEditingId(null);
    resetCreateForm();
  };

  /** Ouvre la modale vide pour ajouter une entrée de l’onglet courant. */
  const openCreateModal = () => {
    setCreateModalTarget(props.activeDataTab);
    setEditingId(null);
    resetCreateForm();
    setShowCreateModal(true);
  };

  /**
   * Ouvre la modale d’édition (les champs doivent déjà être remplis par l’appelant).
   *
   * @param target - Onglet / type d’entrée
   * @param id - Identifiant de la ligne à modifier
   */
  const openReferentialModal = (target: DataTab, id: string) => {
    setCreateModalTarget(target);
    setEditingId(id);
    setShowCreateModal(true);
  };

  /** Enregistre une création ou une modification selon `editingId`. */
  const submitReferentialForm = async () => {
    if (createModalTarget === "sites") {
      const payload = { code: siteCode, name: siteName, address: siteAddress, parc: siteParc, famille: siteFamille };
      if (editingId) {
        await Promise.resolve(props.onUpdateSite({ id: editingId, ...payload }));
      } else {
        await Promise.resolve(props.onCreateSite(payload));
      }
    } else if (createModalTarget === "intervenants") {
      if (editingId) {
        await Promise.resolve(props.onUpdateIntervenant(editingId, intervenantName));
      } else {
        await Promise.resolve(props.onCreateIntervenant(intervenantName));
      }
    } else if (createModalTarget === "types") {
      if (editingId) {
        await Promise.resolve(props.onUpdateType(editingId, typeLabel, typeColor));
      } else {
        await Promise.resolve(props.onCreateType(typeLabel, typeColor));
      }
    } else if (createModalTarget === "rondeMotifs") {
      if (editingId) {
        await Promise.resolve(props.onUpdateRondeMotifType(editingId, rondeMotifLabel, rondeMotifColor));
      } else {
        await Promise.resolve(props.onCreateRondeMotifType(rondeMotifLabel, rondeMotifColor));
      }
    } else if (createModalTarget === "holidays") {
      const date = holidayDateIso.trim();
      if (!date) {
        props.onNotify("La date est obligatoire.", "warning");
        return;
      }
      const dateTaken = holidaysForUi.some((h) => h.dateIso === date && h.id !== editingId);
      if (dateTaken) {
        props.onNotify("Cette date fériée existe déjà.", "warning");
        return;
      }
      if (editingId) {
        await Promise.resolve(props.onUpdateHoliday(editingId, date, holidayLabel.trim()));
      } else {
        await Promise.resolve(props.onCreateHoliday(date, holidayLabel.trim()));
      }
    } else if (editingId) {
      await Promise.resolve(props.onUpdateFransorResponsable(editingId, fransorResponsableName));
    } else {
      await Promise.resolve(props.onCreateFransorResponsable(fransorResponsableName));
    }
    closeReferentialModal();
  };

  const referentialModalTitle = editingId
    ? REFERENTIAL_MODAL_TITLES[createModalTarget].edit
    : REFERENTIAL_MODAL_TITLES[createModalTarget].add;

  const openDeleteReasonModal = (label: string, onConfirm: (reason: string) => void | Promise<void>) => {
    setDeleteReasonTargetLabel(label);
    setDeleteReasonValue("");
    setOnConfirmDeleteReason(() => onConfirm);
  };

  return (
    <section className="panel data-management-panel">
      <div className="tabs">
        <button className={props.activeDataTab === "sites" ? "tab active" : "tab"} onClick={() => props.onDataTabChange("sites")}>
          Sites
          {props.pendingSites.length > 0 ? (
            <span className="tab-badge" title={`${props.pendingSites.length} site(s) en attente`}>
              {props.pendingSites.length}
            </span>
          ) : null}
        </button>
        <button
          className={props.activeDataTab === "intervenants" ? "tab active" : "tab"}
          onClick={() => props.onDataTabChange("intervenants")}
        >
          Intervenants
          {props.pendingIntervenants.length > 0 ? (
            <span className="tab-badge" title={`${props.pendingIntervenants.length} intervenant(s) en attente`}>
              {props.pendingIntervenants.length}
            </span>
          ) : null}
        </button>
        <button className={props.activeDataTab === "types" ? "tab active" : "tab"} onClick={() => props.onDataTabChange("types")}>
          Types d'anomalie
        </button>
        <button className={props.activeDataTab === "holidays" ? "tab active" : "tab"} onClick={() => props.onDataTabChange("holidays")}>
          Jours fériés
        </button>
        <button className={props.activeDataTab === "rondeMotifs" ? "tab active" : "tab"} onClick={() => props.onDataTabChange("rondeMotifs")}>
          Motifs ronde
        </button>
        <button
          className={props.activeDataTab === "fransorResponsables" ? "tab active" : "tab"}
          onClick={() => props.onDataTabChange("fransorResponsables")}
        >
          Fransor
        </button>
      </div>
      <DataSearchImportBar
          activeDataTab={props.activeDataTab}
          searchQuery={searchQuery}
          searchPlaceholder={searchPlaceholder}
          siteParcFilter={siteParcFilter}
          siteFamilleFilter={siteFamilleFilter}
          siteParcOptions={siteParcOptions}
          siteFamilleOptions={siteFamilleOptions}
          importColumnsHint={importColumnsHint}
          isImporting={isImporting}
          pendingSubmissionsCount={
            props.activeDataTab === "sites"
              ? props.pendingSites.length
              : props.activeDataTab === "intervenants"
                ? props.pendingIntervenants.length
                : 0
          }
          onSearchQueryChange={setActiveSearchQuery}
          onSiteParcFilterChange={setSiteParcFilter}
          onSiteFamilleFilterChange={setSiteFamilleFilter}
          onResetSearch={() => {
            setActiveSearchQuery("");
            setSiteParcFilter("");
            setSiteFamilleFilter("");
          }}
          onOpenImport={() => importInputRef.current?.click()}
          onOpenCreate={openCreateModal}
          onOpenPendingSubmissions={() => setShowPendingSubmissionsModal(true)}
          showImport={
            props.activeDataTab === "sites" || props.activeDataTab === "intervenants"
          }
          showCreate
        />
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden-file-input"
        onChange={(e) => {
          void handleImportSelection(e.target.files, props.activeDataTab);
          e.currentTarget.value = "";
        }}
        disabled={isImporting}
      />
      {props.activeDataTab === "sites" && (
        <SitesDataTab
          canDeleteData={props.canDeleteData}
          filteredSites={filteredSites}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onEditSite={(site) => {
            setSiteCode(site.code);
            setSiteName(site.name);
            setSiteAddress(site.address || "");
            setSiteParc(site.parc || "");
            setSiteFamille(site.famille || "");
            openReferentialModal("sites", site.id);
          }}
          onDeleteSite={props.onDeleteSite}
          openDeleteReasonModal={openDeleteReasonModal}
          onNotify={props.onNotify}
        />
      )}

      {props.activeDataTab === "intervenants" && (
        <IntervenantsDataTab
          canDeleteData={props.canDeleteData}
          filteredIntervenants={filteredIntervenants}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onEditIntervenant={(item) => {
            setIntervenantName(item.name);
            openReferentialModal("intervenants", item.id);
          }}
          onDeleteIntervenant={props.onDeleteIntervenant}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "types" && (
        <TypesDataTab
          canDeleteData={props.canDeleteData}
          filteredTypes={filteredTypes}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onEditType={(item) => {
            setTypeLabel(item.label);
            setTypeColor(item.colorHex || "#1f5fcf");
            openReferentialModal("types", item.id);
          }}
          onDeleteType={props.onDeleteType}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "rondeMotifs" && (
        <RondeMotifsDataTab
          canDeleteData={props.canDeleteData}
          filteredRondeMotifs={filteredRondeMotifs}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onEditRondeMotif={(item) => {
            setRondeMotifLabel(item.label);
            setRondeMotifColor(item.colorHex || "#5c6bc0");
            openReferentialModal("rondeMotifs", item.id);
          }}
          onDeleteRondeMotifType={props.onDeleteRondeMotifType}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "holidays" && (
        <HolidaysDataTab
          canDeleteData={props.canDeleteData}
          filteredHolidays={filteredHolidays}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onEditHoliday={(item) => {
            setHolidayDateIso(item.dateIso);
            setHolidayLabel(item.label);
            openReferentialModal("holidays", item.id);
          }}
          onDeleteHoliday={props.onDeleteHoliday}
          openDeleteReasonModal={openDeleteReasonModal}
          onNotify={props.onNotify}
        />
      )}


      {props.activeDataTab === "fransorResponsables" && (
        <FransorResponsablesDataTab
          canDeleteData={props.canDeleteData}
          filteredFransorResponsables={filteredFransorResponsables}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onEditFransorResponsable={(item) => {
            setFransorResponsableName(item.name);
            openReferentialModal("fransorResponsables", item.id);
          }}
          onDeleteFransorResponsable={props.onDeleteFransorResponsable}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      <TablePaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={activeFilteredCount}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        yearNav={
          props.activeDataTab === "holidays"
            ? { year: holidayYear, onYearChange: setHolidayYear }
            : undefined
        }
      />

      {showPendingSubmissionsModal &&
      (props.activeDataTab === "sites" || props.activeDataTab === "intervenants") ? (
        <PendingSubmissionsModal
          kind={props.activeDataTab}
          pendingSites={props.pendingSites}
          pendingIntervenants={props.pendingIntervenants}
          onClose={() => setShowPendingSubmissionsModal(false)}
          onResolveSite={props.onResolvePendingSite}
          onResolveIntervenant={props.onResolvePendingIntervenant}
          onDeleteSiteSubmission={props.onDeletePendingSiteSubmission}
          onDeleteIntervenantSubmission={props.onDeletePendingIntervenantSubmission}
          openDeleteReasonModal={openDeleteReasonModal}
          onNotify={props.onNotify}
        />
      ) : null}

      <FormModal
        isOpen={showCreateModal}
        title={referentialModalTitle}
        onClose={closeReferentialModal}
        onSubmit={() => submitReferentialForm()}
        submitLabel={editingId ? "Enregistrer" : "Ajouter"}
      >
        <div className="form">
          {createModalTarget === "sites" && (
            <>
              <label>
                Code site
                <input placeholder="Ex. SITE-001" value={siteCode} onChange={(e) => setSiteCode(e.target.value)} />
              </label>
              <label>
                Nom du site
                <input placeholder="Ex. Site exemple" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              </label>
              <label>
                Adresse du site
                <input placeholder="Ex. 1 rue Exemple" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </label>
              <label>
                Parc
                <input placeholder="Ex. Parc exemple" value={siteParc} onChange={(e) => setSiteParc(e.target.value)} />
              </label>
              <label>
                Famille
                <input placeholder="Ex. Famille exemple" value={siteFamille} onChange={(e) => setSiteFamille(e.target.value)} />
              </label>
            </>
          )}
          {createModalTarget === "intervenants" && (
            <ReferenceInlineField
              variant="labelOnly"
              label="Nom"
              value={intervenantName}
              onChange={setIntervenantName}
              placeholder="Ex. Prestataire exemple"
            />
          )}
          {createModalTarget === "types" && (
            <ReferenceInlineField
              variant="labelColor"
              label="Libellé"
              value={typeLabel}
              onChange={setTypeLabel}
              placeholder="Ex. Type exemple"
              colorValue={typeColor}
              onColorChange={setTypeColor}
              colorLabel="Couleur du badge"
            />
          )}
          {createModalTarget === "rondeMotifs" && (
            <ReferenceInlineField
              variant="labelColor"
              label="Libellé"
              value={rondeMotifLabel}
              onChange={setRondeMotifLabel}
              placeholder="Ex. Motif exemple"
              colorValue={rondeMotifColor}
              onColorChange={setRondeMotifColor}
              colorLabel="Couleur du badge"
            />
          )}
          {createModalTarget === "holidays" && (
            <ReferenceInlineField
              variant="labelDate"
              label="Libellé"
              value={holidayLabel}
              onChange={setHolidayLabel}
              placeholder="Ex. Fermeture locale"
              dateValue={holidayDateIso}
              onDateChange={setHolidayDateIso}
              dateLabel="Date"
            />
          )}
          {createModalTarget === "fransorResponsables" && (
            <ReferenceInlineField
              variant="labelOnly"
              label="Nom du responsable Fransor"
              value={fransorResponsableName}
              onChange={setFransorResponsableName}
              placeholder="Ex. Nom exemple"
            />
          )}
        </div>
      </FormModal>
      <ConfirmModal
        isOpen={Boolean(onConfirmDeleteReason)}
        title="Motif de suppression"
        message={deleteReasonTargetLabel ? `Motif obligatoire - ${deleteReasonTargetLabel}` : "Motif obligatoire"}
        confirmLabel="Confirmer suppression"
        confirmClassName="btn-danger"
        confirmDisabled={!deleteReasonValue.trim()}
        onCancel={() => {
          setOnConfirmDeleteReason(null);
          setDeleteReasonValue("");
        }}
        onConfirm={() => {
          void (async () => {
            const reason = deleteReasonValue.trim();
            if (!reason) {
              props.onNotify("Le motif de suppression est obligatoire.", "warning");
              return;
            }
            const confirmDelete = onConfirmDeleteReason;
            setOnConfirmDeleteReason(null);
            setDeleteReasonValue("");
            if (confirmDelete) {
              try {
                await Promise.resolve(confirmDelete(reason));
              } catch (error) {
                setBlockedActionMessage(extractUserFacingErrorMessage(error, "Suppression impossible."));
              }
            }
          })();
        }}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
            Motif (obligatoire) <span className="text-error">*</span>
          </span>
          <textarea
            className="mc-textarea"
            rows={2}
            value={deleteReasonValue}
            onChange={(e) => setDeleteReasonValue(e.target.value)}
            placeholder="Ex. Motif exemple"
            autoFocus
          />
        </label>
      </ConfirmModal>
      <FormModal
        isOpen={Boolean(blockedActionMessage)}
        title="Suppression impossible"
        onClose={() => setBlockedActionMessage("")}
        onSubmit={() => setBlockedActionMessage("")}
        submitLabel="OK"
        hideCancel
      >
        <p className="muted">{blockedActionMessage}</p>
      </FormModal>
      {isImporting && importBatchProgress ? (
        <div
          className="modal-overlay data-import-batch-overlay"
          role="dialog"
          aria-modal="true"
          aria-busy="true"
          aria-live="polite"
          aria-label="Progression de l’import en masse"
        >
          <section
            className="modal data-import-batch-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="data-import-batch-label">Import en masse</h3>
            <p className="muted data-import-batch-hint">
              Fichier {importBatchProgress.current} / {importBatchProgress.total} traité (ordre séquentiel).
            </p>
            <progress
              className="data-import-batch-progress"
              value={importBatchProgress.current}
              max={importBatchProgress.total}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}
