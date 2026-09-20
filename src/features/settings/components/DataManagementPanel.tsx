/**
 * Panneau gestion des données : onglets référentiels, import Excel, pending sites/intervenants.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
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

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const expected = normalizeHeader(alias);
    const matchedKey = keys.find((key) => normalizeHeader(key) === expected);
    if (!matchedKey) continue;
    const raw = row[matchedKey];
    if (raw == null) return "";
    return String(raw).trim();
  }
  return "";
}

/** Adresse complète : rue + colonne « CP/Ville » (export logiciel tiers), séparés par une virgule si les deux sont présents. */
function mergeSiteAddressFromRow(row: Record<string, unknown>): string {
  const street = getCell(row, ["adresse", "adresse site", "address", "adresse_site"]);
  const cpVille = getCell(row, ["cp/ville", "cp ville", "cp-ville", "code postal / ville", "cp et ville"]);
  if (street && cpVille) {
    return `${street}, ${cpVille}`.trim();
  }
  return street || cpVille || "";
}

const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMPORT_MAX_ROWS = 20000;
const DANGEROUS_IMPORT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INTERVENANT_IMPORT_ALIASES = [
  "name",
  "nom",
  "intervenant",
  "intervenants",
  "societe",
  "société",
  "prestataire",
  "entreprise",
  "raison sociale",
  "raison_sociale"
];

function sanitizeImportedRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    // Objet sans prototype pour éviter toute pollution du prototype chain.
    const safeRow: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) continue;
      if (DANGEROUS_IMPORT_KEYS.has(normalizedKey)) continue;
      safeRow[normalizedKey] = value;
    }
    return safeRow;
  });
}

/** Retire le bruit IPC Electron pour cause lisible (toast + Import_error.txt). */
function humanizeImportError(error: unknown): string {
  return extractUserFacingErrorMessage(error, "Erreur inconnue");
}

function parseRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      reject(new Error("Fichier trop volumineux (max 10 Mo)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          reject(new Error("Lecture du fichier impossible."));
          return;
        }
        const workbook = XLSX.read(data, { type: "array", dense: true, cellFormula: false });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
          reject(new Error("Le classeur est vide (aucune feuille). Formats pris en charge : XLS, XLSX."));
          return;
        }
        const sheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false, blankrows: false });
        if (rows.length > IMPORT_MAX_ROWS) {
          reject(new Error("Le fichier contient trop de lignes (max 20 000)."));
          return;
        }
        resolve(sanitizeImportedRows(rows));
      } catch (err) {
        reject(
          new Error(
            "Impossible de lire ce fichier. Utilisez un classeur XLS ou XLSX (première feuille = données avec ligne d'en-têtes)."
          )
        );
      }
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsArrayBuffer(file);
  });
}

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
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [editingHolidayDateIso, setEditingHolidayDateIso] = useState("");
  const [editingHolidayLabel, setEditingHolidayLabel] = useState("");
  const [fransorResponsableName, setFransorResponsableName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  /** Progression multi-fichiers : fichier courant / total (traitement séquentiel). */
  const [importBatchProgress, setImportBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPendingSubmissionsModal, setShowPendingSubmissionsModal] = useState(false);
  const [createModalTarget, setCreateModalTarget] = useState<
    "sites" | "intervenants" | "types" | "rondeMotifs" | "fransorResponsables" | "holidays"
  >("sites");
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingSiteCode, setEditingSiteCode] = useState("");
  const [editingSiteName, setEditingSiteName] = useState("");
  const [editingSiteAddress, setEditingSiteAddress] = useState("");
  const [editingSiteParc, setEditingSiteParc] = useState("");
  const [editingSiteFamille, setEditingSiteFamille] = useState("");
  const [editingIntervenantId, setEditingIntervenantId] = useState<string | null>(null);
  const [editingIntervenantName, setEditingIntervenantName] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeLabel, setEditingTypeLabel] = useState("");
  const [editingTypeColor, setEditingTypeColor] = useState("#1f5fcf");
  const [rondeMotifLabel, setRondeMotifLabel] = useState("");
  const [rondeMotifColor, setRondeMotifColor] = useState("#5c6bc0");
  const [editingRondeMotifId, setEditingRondeMotifId] = useState<string | null>(null);
  const [editingRondeMotifLabel, setEditingRondeMotifLabel] = useState("");
  const [editingRondeMotifColor, setEditingRondeMotifColor] = useState("#5c6bc0");
  const [editingFransorResponsableId, setEditingFransorResponsableId] = useState<string | null>(null);
  const [editingFransorResponsableName, setEditingFransorResponsableName] = useState("");
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

  type SingleImportOutcome =
    | { ok: true; fileName: string; success: number; failed: number; total: number }
    | { ok: false; fileName: string; message: string };

  const runSingleFileImport = async (file: File, target: DataTab): Promise<SingleImportOutcome> => {
    try {
      const rows = await parseRows(file);
      if (!rows.length) {
        return { ok: false, fileName: file.name, message: "Aucune ligne détectée dans le fichier." };
      }
      let success = 0;
      let failed = 0;
      const errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }> = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        try {
          if (target === "sites") {
            const code = getCell(row, ["code site", "code", "code_site"]);
            const name = getCell(row, ["site", "nom site", "name", "nom", "site name"]);
            const address = mergeSiteAddressFromRow(row);
            const parc = getCell(row, ["parc"]);
            const famille = getCell(row, ["famille", "family"]);
            if (!code || !name) {
              throw new Error("Colonnes requises : « Code site » et « Site » (ou équivalents nom / nom site).");
            }
            await props.onImportSiteRow({ code, name, address, parc, famille });
          } else if (target === "intervenants") {
            const name = getCell(row, INTERVENANT_IMPORT_ALIASES);
            if (!name) {
              throw new Error(
                "Colonne requise: nom (alias acceptés: intervenant, intervenants, société, prestataire, entreprise)."
              );
            }
            await props.onImportIntervenantRow(name);
          } else if (target === "types") {
            const label = getCell(row, ["label", "libelle", "type", "type anomalie"]);
            if (!label) {
              throw new Error("Colonne requise: libelle.");
            }
            await props.onImportTypeRow(label);
          } else {
            throw new Error("Import non disponible pour ce sous-onglet.");
          }
          success += 1;
        } catch (error) {
          failed += 1;
          errorEntries.push({
            rowIndex: index + 1,
            message: humanizeImportError(error),
            row
          });
        }
      }

      await props.onLogImportSummary({
        target: target as "sites" | "intervenants" | "types",
        fileName: file.name,
        total: rows.length,
        success,
        failed,
        errorEntries
      });
      return { ok: true, fileName: file.name, success, failed, total: rows.length };
    } catch (error) {
      return {
        ok: false,
        fileName: file.name,
        message: humanizeImportError(error)
      };
    }
  };

  const handleImportSelection = async (files: FileList | null, target: DataTab) => {
    if (!files?.length) {
      return;
    }
    const list = Array.from(files);
    setIsImporting(true);
    let successRows = 0;
    let failedRows = 0;
    let filesFailed = 0;
    try {
      for (let i = 0; i < list.length; i += 1) {
        setImportBatchProgress({ current: i + 1, total: list.length });
        const result = await runSingleFileImport(list[i], target);
        if (result.ok) {
          successRows += result.success;
          failedRows += result.failed;
        } else {
          filesFailed += 1;
        }
      }
      await props.onRefreshImportedData(target);
      const errorCount = failedRows + filesFailed;
      const filePart = list.length > 1 ? ` (${list.length} fichiers)` : "";
      const summary = `Import terminé${filePart} — ${successRows} succès, ${errorCount} erreur${errorCount > 1 ? "s" : ""}.`;
      const variant = errorCount === 0 ? "success" : successRows > 0 ? "warning" : "error";
      props.onNotify(summary, variant);
    } finally {
      setIsImporting(false);
      setImportBatchProgress(null);
    }
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

  const submitCreate = async () => {
    if (createModalTarget === "sites") {
      await Promise.resolve(
        props.onCreateSite({ code: siteCode, name: siteName, address: siteAddress, parc: siteParc, famille: siteFamille })
      );
    } else if (createModalTarget === "intervenants") {
      await Promise.resolve(props.onCreateIntervenant(intervenantName));
    } else if (createModalTarget === "types") {
      await Promise.resolve(props.onCreateType(typeLabel, typeColor));
    } else if (createModalTarget === "rondeMotifs") {
      await Promise.resolve(props.onCreateRondeMotifType(rondeMotifLabel, rondeMotifColor));
    } else if (createModalTarget === "holidays") {
      const date = holidayDateIso.trim();
      if (!date) {
        props.onNotify("La date est obligatoire.", "warning");
        return;
      }
      if (holidaysForUi.some((h) => h.dateIso === date)) {
        props.onNotify("Cette date fériée existe déjà.", "warning");
        return;
      }
      await Promise.resolve(props.onCreateHoliday(date, holidayLabel.trim()));
    } else {
      await Promise.resolve(props.onCreateFransorResponsable(fransorResponsableName));
    }
    resetCreateForm();
    setShowCreateModal(false);
  };

  const createModalTitle =
    createModalTarget === "sites"
      ? "Ajouter un site"
      : createModalTarget === "intervenants"
        ? "Ajouter un intervenant"
        : createModalTarget === "types"
          ? "Ajouter un type d'anomalie"
          : createModalTarget === "rondeMotifs"
            ? "Ajouter un motif de ronde"
            : createModalTarget === "holidays"
              ? "Ajouter un jour férié"
              : "Ajouter un responsable Fransor";

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
          onOpenCreate={() => {
            setCreateModalTarget(props.activeDataTab);
            resetCreateForm();
            setShowCreateModal(true);
          }}
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
          editingSiteId={editingSiteId}
          editingSiteCode={editingSiteCode}
          editingSiteName={editingSiteName}
          editingSiteAddress={editingSiteAddress}
          editingSiteParc={editingSiteParc}
          editingSiteFamille={editingSiteFamille}
          setEditingSiteId={setEditingSiteId}
          setEditingSiteCode={setEditingSiteCode}
          setEditingSiteName={setEditingSiteName}
          setEditingSiteAddress={setEditingSiteAddress}
          setEditingSiteParc={setEditingSiteParc}
          setEditingSiteFamille={setEditingSiteFamille}
          onUpdateSite={props.onUpdateSite}
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
          editingIntervenantId={editingIntervenantId}
          editingIntervenantName={editingIntervenantName}
          setEditingIntervenantId={setEditingIntervenantId}
          setEditingIntervenantName={setEditingIntervenantName}
          onUpdateIntervenant={props.onUpdateIntervenant}
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
          editingTypeId={editingTypeId}
          editingTypeLabel={editingTypeLabel}
          editingTypeColor={editingTypeColor}
          setEditingTypeId={setEditingTypeId}
          setEditingTypeLabel={setEditingTypeLabel}
          setEditingTypeColor={setEditingTypeColor}
          onUpdateType={props.onUpdateType}
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
          editingRondeMotifId={editingRondeMotifId}
          editingRondeMotifLabel={editingRondeMotifLabel}
          editingRondeMotifColor={editingRondeMotifColor}
          setEditingRondeMotifId={setEditingRondeMotifId}
          setEditingRondeMotifLabel={setEditingRondeMotifLabel}
          setEditingRondeMotifColor={setEditingRondeMotifColor}
          onUpdateRondeMotifType={props.onUpdateRondeMotifType}
          onDeleteRondeMotifType={props.onDeleteRondeMotifType}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "holidays" && (
        <HolidaysDataTab
          canDeleteData={props.canDeleteData}
          editingHolidayId={editingHolidayId}
          editingHolidayDateIso={editingHolidayDateIso}
          editingHolidayLabel={editingHolidayLabel}
          filteredHolidays={filteredHolidays}
          pageStart={pageStart}
          pageEnd={pageEnd}
          setEditingHolidayId={setEditingHolidayId}
          setEditingHolidayDateIso={setEditingHolidayDateIso}
          setEditingHolidayLabel={setEditingHolidayLabel}
          onUpdateHoliday={props.onUpdateHoliday}
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
          editingFransorResponsableId={editingFransorResponsableId}
          editingFransorResponsableName={editingFransorResponsableName}
          setEditingFransorResponsableId={setEditingFransorResponsableId}
          setEditingFransorResponsableName={setEditingFransorResponsableName}
          onUpdateFransorResponsable={props.onUpdateFransorResponsable}
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
        title={createModalTitle}
        onClose={() => setShowCreateModal(false)}
        onSubmit={() => submitCreate()}
        submitLabel="Ajouter"
      >
        <div className="form">
          {createModalTarget === "sites" && (
            <>
              <input placeholder="Code site" value={siteCode} onChange={(e) => setSiteCode(e.target.value)} />
              <input placeholder="Nom du site" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              <input placeholder="Adresse du site" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              <input placeholder="Parc" value={siteParc} onChange={(e) => setSiteParc(e.target.value)} />
              <input placeholder="Famille" value={siteFamille} onChange={(e) => setSiteFamille(e.target.value)} />
            </>
          )}
          {createModalTarget === "intervenants" && (
            <ReferenceInlineField
              variant="labelOnly"
              label="Nom"
              value={intervenantName}
              onChange={setIntervenantName}
              placeholder="Nom"
            />
          )}
          {createModalTarget === "types" && (
            <ReferenceInlineField
              variant="labelColor"
              label="Libellé"
              value={typeLabel}
              onChange={setTypeLabel}
              placeholder="Type d'anomalie"
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
              placeholder="Libellé du motif"
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
              placeholder="Ex. : pont local, fermeture exceptionnelle"
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
              placeholder="Nom du responsable Fransor"
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
            placeholder="Ex: soumission créée par erreur"
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
