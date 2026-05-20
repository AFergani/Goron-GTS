import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import type { AnomalyTypeRef, FransorResponsableRef, HolidayRef, IntervenantRef, SiteRef } from "../../../types";
import type { RondeMotifTypeRef } from "../../rondes/model/ronde.types";
import type { Role } from "../../../types";
import type { DataTab } from "../model/settings.types";
import type { PendingInterventionSite } from "../../intervention/model/intervention.types";
import type { PendingInterventionIntervenant } from "../../intervention/model/intervention.types";
import { SitesDataTab } from "./dataTabs/SitesDataTab";
import { IntervenantsDataTab } from "./dataTabs/IntervenantsDataTab";
import { TypesDataTab } from "./dataTabs/TypesDataTab";
import { RondeMotifsDataTab } from "./dataTabs/RondeMotifsDataTab";
import { HolidaysDataTab } from "./dataTabs/HolidaysDataTab";
import { FransorResponsablesDataTab } from "./dataTabs/FransorResponsablesDataTab";
import { PendingSitesDataTab } from "./dataTabs/PendingSitesDataTab";
import { PendingIntervenantsDataTab } from "./dataTabs/PendingIntervenantsDataTab";
import { DataSearchImportBar } from "./DataSearchImportBar";
import { mergeWithFrenchFixedHolidays } from "../../rondes/model/rondeCalendarLocal";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import "./DataManagementPanel.css";

type DataManagementPanelProps = {
  requesterRole: Role;
  activeDataTab: DataTab;
  onDataTabChange: (tab: DataTab) => void;
  sites: SiteRef[];
  intervenants: IntervenantRef[];
  anomalyTypes: AnomalyTypeRef[];
  holidays: HolidayRef[];
  rondeMotifTypes: RondeMotifTypeRef[];
  fransorResponsables: FransorResponsableRef[];
  interventionPendingSites: PendingInterventionSite[];
  interventionPendingIntervenants: PendingInterventionIntervenant[];
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
  onRefreshImportedData: (target: DataTab) => Promise<void>;
  onResolvePendingSite: (payload: { pendingId: string; parc: string; famille: string }) => void | Promise<void>;
  onResolvePendingIntervenant: (payload: { pendingId: string; name: string }) => void | Promise<void>;
  onDeletePendingSiteSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onDeletePendingIntervenantSubmission: (payload: { pendingId: string; reason: string }) => void | Promise<void>;
  onNotify: (message: string) => void;
};

const PAGE_SIZE = 200;

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
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw.trim()) return "Erreur inconnue";
  const segments = raw.split(/\s*Error:\s*/i);
  const last = segments[segments.length - 1]?.trim();
  return last || raw;
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
  const [createModalTarget, setCreateModalTarget] = useState<
    "sites" | "intervenants" | "types" | "rondeMotifs" | "fransorResponsables"
  >("sites");
  const [pendingSiteToResolveId, setPendingSiteToResolveId] = useState<string | null>(null);
  const [pendingIntervenantToResolveId, setPendingIntervenantToResolveId] = useState<string | null>(null);
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
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [siteParcFilter, setSiteParcFilter] = useState("");
  const [siteFamilleFilter, setSiteFamilleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteReasonTargetLabel, setDeleteReasonTargetLabel] = useState("");
  const [deleteReasonValue, setDeleteReasonValue] = useState("");
  const [onConfirmDeleteReason, setOnConfirmDeleteReason] = useState<((reason: string) => void | Promise<void>) | null>(null);
  const [blockedActionMessage, setBlockedActionMessage] = useState("");

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
    const lines: string[] = [];
    try {
      for (let i = 0; i < list.length; i += 1) {
        setImportBatchProgress({ current: i + 1, total: list.length });
        const result = await runSingleFileImport(list[i], target);
        if (result.ok) {
          lines.push(`${result.fileName}: ${result.success} ligne(s) importée(s), ${result.failed} en échec.`);
        } else {
          lines.push(`${result.fileName}: échec — ${result.message}`);
        }
      }
      await props.onRefreshImportedData(target);
      const header =
        list.length > 1
          ? `Import terminé (${list.length} fichiers, traitement séquentiel) —`
          : "Import terminé —";
      props.onNotify(`${header} ${lines.join(" ")}`);
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
        : props.activeDataTab === "interventionPendingSites"
          ? "Consolidation par les responsables dans cette section."
          : props.activeDataTab === "interventionPendingIntervenants"
            ? "Consolidation par les responsables dans cette section."
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
  const siteParcOptions = [...new Set(props.sites.map((s) => (s.parc || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  const siteFamilleOptions = [...new Set(props.sites.map((s) => (s.famille || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr")
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
    if (holidayYear.trim() && itemYear !== holidayYear.trim()) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return item.dateIso.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
  });
  const searchPlaceholder =
    props.activeDataTab === "sites"
      ? "Rechercher un site (code, nom, parc, famille)"
      : props.activeDataTab === "intervenants"
        ? "Rechercher un intervenant (nom)"
        : props.activeDataTab === "interventionPendingSites"
          ? "Rechercher un site en attente (code, nom)"
          : props.activeDataTab === "interventionPendingIntervenants"
            ? "Rechercher un intervenant en attente (nom)"
          : props.activeDataTab === "rondeMotifs"
            ? "Rechercher par libellé"
          : props.activeDataTab === "holidays"
            ? "Rechercher un jour férié (date, libellé)"
          : props.activeDataTab === "documentTemplates"
            ? "Recherche (non utilisée sur cet onglet)"
        : "Rechercher un type d'anomalie";
  const filteredPendingSites = props.interventionPendingSites.filter((site) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return site.code.toLowerCase().includes(query) || site.name.toLowerCase().includes(query);
  });
  const filteredPendingIntervenants = props.interventionPendingIntervenants.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return item.name.toLowerCase().includes(query);
  });
  const activeFilteredCount =
    props.activeDataTab === "documentTemplates"
      ? 0
      : props.activeDataTab === "sites"
        ? filteredSites.length
        : props.activeDataTab === "intervenants"
          ? filteredIntervenants.length
        : props.activeDataTab === "types"
          ? filteredTypes.length
          : props.activeDataTab === "rondeMotifs"
            ? filteredRondeMotifs.length
            : props.activeDataTab === "holidays"
              ? filteredHolidays.length
          : props.activeDataTab === "interventionPendingSites"
            ? filteredPendingSites.length
            : props.activeDataTab === "interventionPendingIntervenants"
              ? filteredPendingIntervenants.length
          : props.fransorResponsables.filter((resp) => {
              const query = searchQuery.trim().toLowerCase();
              if (!query) return true;
              return resp.name.toLowerCase().includes(query);
            }).length;
  const totalPages = Math.max(1, Math.ceil(activeFilteredCount / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, siteParcFilter, siteFamilleFilter, holidayYear, props.activeDataTab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedSites = filteredSites.slice(pageStart, pageEnd);
  const pagedIntervenants = filteredIntervenants.slice(pageStart, pageEnd);
  const pagedTypes = filteredTypes.slice(pageStart, pageEnd);
  const pagedRondeMotifs = filteredRondeMotifs.slice(pageStart, pageEnd);
  const pagedHolidays = filteredHolidays.slice(pageStart, pageEnd);
  const pagedPendingSites = filteredPendingSites.slice(pageStart, pageEnd);
  const pagedPendingIntervenants = filteredPendingIntervenants.slice(pageStart, pageEnd);
  const filteredFransorResponsables = props.fransorResponsables.filter((resp) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return resp.name.toLowerCase().includes(query);
  });
  const pagedFransorResponsables = filteredFransorResponsables.slice(pageStart, pageEnd);
  const goToPage = (nextPage: number) => {
    const safePage = Math.max(1, Math.min(totalPages, nextPage));
    setCurrentPage(safePage);
    toolbarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    setPendingSiteToResolveId(null);
    setPendingIntervenantToResolveId(null);
  };

  const submitCreate = async () => {
    if (createModalTarget === "sites") {
      if (pendingSiteToResolveId) {
        await Promise.resolve(
          props.onResolvePendingSite({
            pendingId: pendingSiteToResolveId,
            parc: siteParc,
            famille: siteFamille
          })
        );
      } else {
        await Promise.resolve(
          props.onCreateSite({ code: siteCode, name: siteName, address: siteAddress, parc: siteParc, famille: siteFamille })
        );
      }
    } else if (createModalTarget === "intervenants") {
      if (pendingIntervenantToResolveId) {
        await Promise.resolve(
          props.onResolvePendingIntervenant({
            pendingId: pendingIntervenantToResolveId,
            name: intervenantName
          })
        );
      } else {
        await Promise.resolve(props.onCreateIntervenant(intervenantName));
      }
    } else if (createModalTarget === "types") {
      await Promise.resolve(props.onCreateType(typeLabel, typeColor));
    } else if (createModalTarget === "rondeMotifs") {
      await Promise.resolve(props.onCreateRondeMotifType(rondeMotifLabel, rondeMotifColor));
    } else {
      await Promise.resolve(props.onCreateFransorResponsable(fransorResponsableName));
    }
    resetCreateForm();
    setShowCreateModal(false);
  };

  const openDeleteReasonModal = (label: string, onConfirm: (reason: string) => void | Promise<void>) => {
    setDeleteReasonTargetLabel(label);
    setDeleteReasonValue("");
    setOnConfirmDeleteReason(() => onConfirm);
  };

  return (
    <section className="panel">
      <div className="tabs">
        <button className={props.activeDataTab === "sites" ? "tab active" : "tab"} onClick={() => props.onDataTabChange("sites")}>
          Sites
        </button>
        <button
          className={props.activeDataTab === "intervenants" ? "tab active" : "tab"}
          onClick={() => props.onDataTabChange("intervenants")}
        >
          Intervenants
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
      <div ref={toolbarRef}>
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
          onSearchQueryChange={setSearchQuery}
          onSiteParcFilterChange={setSiteParcFilter}
          onSiteFamilleFilterChange={setSiteFamilleFilter}
          onResetSearch={() => {
            setSearchQuery("");
            setSiteParcFilter("");
            setSiteFamilleFilter("");
          }}
          onOpenImport={() => importInputRef.current?.click()}
          onOpenCreate={() => {
            setCreateModalTarget(
              props.activeDataTab === "sites" ||
                props.activeDataTab === "intervenants" ||
                props.activeDataTab === "types" ||
                props.activeDataTab === "rondeMotifs" ||
                props.activeDataTab === "fransorResponsables"
                ? props.activeDataTab
                : "sites"
            );
            resetCreateForm();
            setShowCreateModal(true);
          }}
          showImport={
            props.activeDataTab !== "fransorResponsables" &&
            props.activeDataTab !== "types" &&
            props.activeDataTab !== "holidays" &&
            props.activeDataTab !== "rondeMotifs" &&
            props.activeDataTab !== "interventionPendingSites" &&
            props.activeDataTab !== "interventionPendingIntervenants"
          }
          showCreate={
            props.activeDataTab !== "interventionPendingSites" && props.activeDataTab !== "interventionPendingIntervenants"
          }
        />
      </div>
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
          interventionPendingSites={props.interventionPendingSites}
          pagedSites={pagedSites}
          filteredSites={filteredSites}
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
          onOpenPendingSiteValidation={(site) => {
            setCreateModalTarget("sites");
            setPendingSiteToResolveId(site.id);
            setPendingIntervenantToResolveId(null);
            setSiteCode(site.code);
            setSiteName(site.name);
            setSiteAddress("");
            setSiteParc("");
            setSiteFamille("");
            setShowCreateModal(true);
          }}
          onDeletePendingSiteSubmission={props.onDeletePendingSiteSubmission}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "intervenants" && (
        <IntervenantsDataTab
          canDeleteData={props.canDeleteData}
          interventionPendingIntervenants={props.interventionPendingIntervenants}
          pagedIntervenants={pagedIntervenants}
          filteredIntervenants={filteredIntervenants}
          editingIntervenantId={editingIntervenantId}
          editingIntervenantName={editingIntervenantName}
          setEditingIntervenantId={setEditingIntervenantId}
          setEditingIntervenantName={setEditingIntervenantName}
          onUpdateIntervenant={props.onUpdateIntervenant}
          onDeleteIntervenant={props.onDeleteIntervenant}
          onOpenPendingIntervenantValidation={(item) => {
            setCreateModalTarget("intervenants");
            setPendingIntervenantToResolveId(item.id);
            setPendingSiteToResolveId(null);
            setIntervenantName(item.name);
            setShowCreateModal(true);
          }}
          onDeletePendingIntervenantSubmission={props.onDeletePendingIntervenantSubmission}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "types" && (
        <TypesDataTab
          canDeleteData={props.canDeleteData}
          pagedTypes={pagedTypes}
          filteredTypes={filteredTypes}
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
          pagedRondeMotifs={pagedRondeMotifs}
          filteredRondeMotifs={filteredRondeMotifs}
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
          allHolidays={holidaysForUi}
          holidayDateIso={holidayDateIso}
          holidayLabel={holidayLabel}
          holidayYear={holidayYear}
          editingHolidayId={editingHolidayId}
          editingHolidayDateIso={editingHolidayDateIso}
          editingHolidayLabel={editingHolidayLabel}
          pagedHolidays={pagedHolidays}
          filteredHolidays={filteredHolidays}
          setHolidayDateIso={setHolidayDateIso}
          setHolidayLabel={setHolidayLabel}
          setHolidayYear={setHolidayYear}
          setEditingHolidayId={setEditingHolidayId}
          setEditingHolidayDateIso={setEditingHolidayDateIso}
          setEditingHolidayLabel={setEditingHolidayLabel}
          onCreateHoliday={props.onCreateHoliday}
          onUpdateHoliday={props.onUpdateHoliday}
          onDeleteHoliday={props.onDeleteHoliday}
          openDeleteReasonModal={openDeleteReasonModal}
          onNotify={props.onNotify}
        />
      )}


      {props.activeDataTab === "fransorResponsables" && (
        <FransorResponsablesDataTab
          canDeleteData={props.canDeleteData}
          pagedFransorResponsables={pagedFransorResponsables}
          filteredFransorResponsables={filteredFransorResponsables}
          editingFransorResponsableId={editingFransorResponsableId}
          editingFransorResponsableName={editingFransorResponsableName}
          setEditingFransorResponsableId={setEditingFransorResponsableId}
          setEditingFransorResponsableName={setEditingFransorResponsableName}
          onUpdateFransorResponsable={props.onUpdateFransorResponsable}
          onDeleteFransorResponsable={props.onDeleteFransorResponsable}
          openDeleteReasonModal={openDeleteReasonModal}
        />
      )}

      {props.activeDataTab === "interventionPendingSites" && (
        <PendingSitesDataTab
          pagedPendingSites={pagedPendingSites}
          hasAnyPendingSites={Boolean(props.interventionPendingSites.length)}
          onValidate={(site) => {
            setCreateModalTarget("sites");
            setPendingSiteToResolveId(site.id);
            setPendingIntervenantToResolveId(null);
            setSiteCode(site.code);
            setSiteName(site.name);
            setSiteAddress("");
            setSiteParc("");
            setSiteFamille("");
            setShowCreateModal(true);
          }}
          onDelete={(site) => {
            openDeleteReasonModal(`site en attente ${site.code}`, (reason) =>
              props.onDeletePendingSiteSubmission({ pendingId: site.id, reason })
            );
          }}
        />
      )}
      {props.activeDataTab === "interventionPendingIntervenants" && (
        <PendingIntervenantsDataTab
          pagedPendingIntervenants={pagedPendingIntervenants}
          hasAnyPendingIntervenants={Boolean(props.interventionPendingIntervenants.length)}
          onValidate={(item) => {
            setCreateModalTarget("intervenants");
            setPendingIntervenantToResolveId(item.id);
            setPendingSiteToResolveId(null);
            setIntervenantName(item.name);
            setShowCreateModal(true);
          }}
          onDelete={(item) => {
            openDeleteReasonModal(`intervenant en attente ${item.name}`, (reason) =>
              props.onDeletePendingIntervenantSubmission({ pendingId: item.id, reason })
            );
          }}
        />
      )}

      <div className="pagination-row">
        <span className="muted">
          {activeFilteredCount} résultat(s) - page {currentPage}/{totalPages}
        </span>
        <div className="row-actions">
          <button className="btn-light" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} title="Page précédente">
            <ChevronLeft size={14} />
          </button>
          <button
            className="btn-light"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            title="Page suivante"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <section className="modal fransor-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h3>
              {createModalTarget === "sites"
                ? "Ajouter un site"
                : createModalTarget === "intervenants"
                  ? "Ajouter un intervenant"
                  : createModalTarget === "types"
                    ? "Ajouter un type d'anomalie"
                    : createModalTarget === "rondeMotifs"
                      ? "Ajouter un motif de ronde"
                      : "Ajouter un responsable Fransor"}
              </h3>
            </div>
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
                <input
                  placeholder="Nom"
                  value={intervenantName}
                  onChange={(e) => setIntervenantName(e.target.value)}
                />
              )}
              {createModalTarget === "types" && (
                <div className="data-management-create-ref-form data-management-create-ref-form--anomaly-inline">
                  <label className="data-management-create-ref-form__label">
                    Libellé
                    <input placeholder="Type d'anomalie" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} />
                  </label>
                  <label className="data-type-color-field">
                    Couleur du badge
                    <input type="color" value={typeColor} onChange={(e) => setTypeColor(e.target.value)} />
                  </label>
                </div>
              )}
              {createModalTarget === "rondeMotifs" && (
                <div className="data-management-create-ref-form">
                  <label className="data-management-create-ref-form__label">
                    Libellé
                    <input placeholder="Libellé du motif" value={rondeMotifLabel} onChange={(e) => setRondeMotifLabel(e.target.value)} />
                  </label>
                  <label className="data-type-color-field">
                    Couleur du badge
                    <input type="color" value={rondeMotifColor} onChange={(e) => setRondeMotifColor(e.target.value)} />
                  </label>
                </div>
              )}
              {createModalTarget === "fransorResponsables" && (
                <input
                  placeholder="Nom du responsable Fransor"
                  value={fransorResponsableName}
                  onChange={(e) => setFransorResponsableName(e.target.value)}
                />
              )}
            </div>
            <div className="row-actions modal-actions">
              <button className="btn-light" onClick={() => setShowCreateModal(false)}>
                Annuler
              </button>
              <button onClick={() => void submitCreate()}>
                {pendingSiteToResolveId || pendingIntervenantToResolveId ? "Valider l'entrée" : "Ajouter"}
              </button>
            </div>
          </section>
        </div>
      )}
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
              props.onNotify("Le motif de suppression est obligatoire.");
              return;
            }
            const confirmDelete = onConfirmDeleteReason;
            setOnConfirmDeleteReason(null);
            setDeleteReasonValue("");
            if (confirmDelete) {
              try {
                await Promise.resolve(confirmDelete(reason));
              } catch (error) {
                const message = error instanceof Error ? error.message : "Action impossible.";
                setBlockedActionMessage(message);
              }
            }
          })();
        }}
      >
        <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
            Motif (obligatoire) <span style={{ color: "var(--danger, #e55)" }}>*</span>
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
      {blockedActionMessage ? (
        <div className="modal-overlay" onClick={() => setBlockedActionMessage("")}>
          <section className="modal fransor-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h3>Suppression bloquée</h3>
            </div>
            <p className="muted">{blockedActionMessage}</p>
            <div className="row-actions modal-actions">
              <button type="button" className="btn-light" onClick={() => setBlockedActionMessage("")}>
                OK
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
            className="modal fransor-help-modal data-import-batch-modal"
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
