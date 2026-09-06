import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
/**
 * Export Word fiche ronde (modèle par défaut ou par profil planifié).
 *
 * Jetons Docxtemplater, champs clôture, repli docx ; partagé avec Paramètres (modèles).
 */

import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { downloadBlob } from "../../common/utils/downloadBlob";
import {
  loadDocumentTemplateBuffer,
  renderDocxtemplaterBlob,
  safeDocxText
} from "../../common/utils/docxTemplateHelpers";
import { safeExportFilenamePart } from "../../common/utils/exportFilename";
import { splitSiteDisplayParts } from "../../common/utils/siteDisplayCopy";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { computeRondeLogicalDate } from "../utils/logicalDate";
import { resolvePlannedHeureDemandeeFromProfiles } from "../utils/plannedHeureDemandee";
import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef, RondePlannedRoundKind } from "../model/rondePlanned.types";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import { plannedProfileWordTemplateFileName } from "./profileTemplateFilename";

let templateMissingWarningShown = false;

/** Fichier installable depuis Paramètres → Données → Gestion des modèles ; utilisé si aucun modèle spécifique au profil. */
export const DEFAULT_RONDE_WORD_TEMPLATE_FILE = "ronde-template.docx";
type RondeTemplateFlowKind = "RONDE_PLANIFIEE" | "RONDE_EXCEPTIONNELLE";

function statusLabelFr(entry: RondeEntry): string {
  if (entry.status === "CLOTURE") return "Clôturée";
  if (entry.status === "ANNULE") {
    return entry.cancellationKind === "NON_EFFECTUEE" ? "Non effectuée" : "Annulée";
  }
  return "En cours";
}

function originSummary(entry: RondeEntry): string {
  if (entry.originKind === "TELESURVEILLANCE") return "Télésurveillance";
  if (entry.originKind === "CLIENT") {
    return entry.originDetail.trim() ? `Client — ${entry.originDetail.trim()}` : "Client";
  }
  return entry.originDetail.trim() ? `Autre — ${entry.originDetail.trim()}` : "Autre";
}

function roundKindLabel(entry: RondeEntry): string {
  const k = entry.plannedRoundKind;
  if (!k) return "—";
  return formatPlannedRoundKindLabel(k as RondePlannedRoundKind);
}

/** Données Docxtemplater : jetons ronde contractuelle + champs fiche + clés champs de clôture. */
function buildTemplateData(
  entry: RondeEntry,
  profileLabel: string,
  profiles?: RondePlannedProfileRef[] | null
): Record<string, string> {
  const parts = splitSiteDisplayParts(entry.siteDisplay);
  const siteCode = safeDocxText(parts.codePart);
  const siteName = safeDocxText(parts.namePart);
  const siteLabel = safeDocxText(entry.siteDisplay);
  const profil = safeDocxText(profileLabel);
  const dateJour = formatDateShortFr(entry.requestDate);
  const heureDem = resolvePlannedHeureDemandeeFromProfiles(entry, profiles);
  const customLogicalDate = String(
    entry.closureCustomValues?.date_logique_passage || entry.closureCustomValues?.date_logique || ""
  ).trim();
  const logicalDateComputed = computeRondeLogicalDate({
    requestDate: entry.requestDate,
    plannedRoundKind: entry.plannedRoundKind || null,
    arrivalTime: entry.arrivalTime,
    departureTime: entry.departureTime,
    preferredDate: customLogicalDate || null
  });
  const logicalDateIso = logicalDateComputed.logicalDate;
  const logicalDateFr = logicalDateIso ? formatDateShortFr(logicalDateIso) : "—";
  const transitionDateLabel =
    logicalDateIso && entry.requestDate && logicalDateIso !== entry.requestDate
      ? `${formatDateShortFr(entry.requestDate)} -> ${logicalDateFr}`
      : "Aucune transition détectée";

  const base: Record<string, string> = {
    site_code: siteCode,
    site_name: siteName,
    site_label: siteLabel,
    profil_label: profil,
    profil_libelle: profil,
    prestataire: safeDocxText(entry.intervenantName),
    date_demande: safeDocxText(dateJour),
    date_du_jour: safeDocxText(dateJour),
    heure_demandee: safeDocxText(heureDem || "—"),
    motif_type: safeDocxText(entry.motifTypeLabel),
    motif_detail: safeDocxText(entry.motifDetail),
    motif: safeDocxText(
      entry.motifDetail.trim() ? `${entry.motifTypeLabel.trim()} (${entry.motifDetail.trim()})` : entry.motifTypeLabel
    ),
    horaires_demande_obs: safeDocxText(entry.horairesDemandeObs),
    origine: safeDocxText(originSummary(entry)),
    heure_arrivee: safeDocxText(entry.arrivalTime),
    heure_depart: safeDocxText(entry.departureTime),
    duree_minutes:
      entry.durationMinutes == null ? "—" : safeDocxText(`${entry.durationMinutes} min`),
    numero_bon: safeDocxText(entry.workOrderNumber),
    compte_rendu: safeDocxText(entry.report),
    statut: safeDocxText(statusLabelFr(entry)),
    type_passage: safeDocxText(roundKindLabel(entry)),
    date_logique_passage: safeDocxText(logicalDateFr),
    date_logique: safeDocxText(logicalDateFr),
    date_logique_iso: safeDocxText(logicalDateIso),
    transition_date: safeDocxText(transitionDateLabel),
    passage_apres_minuit: logicalDateComputed.shiftedAfterMidnight ? "Oui" : "Non"
  };

  const merged: Record<string, string> = { ...base };
  const customs = entry.closureCustomValues && typeof entry.closureCustomValues === "object" ? entry.closureCustomValues : {};
  for (const [key, val] of Object.entries(customs)) {
    const k = String(key || "").trim();
    if (!k) continue;
    merged[k] = safeDocxText(val);
  }
  return merged;
}

async function loadProfileTemplateBuffer(profileLabel: string): Promise<ArrayBuffer | null> {
  return loadDocumentTemplateBuffer({
    templateFileName: plannedProfileWordTemplateFileName(profileLabel)
  });
}

async function loadScopedRondeTemplateBuffer(
  entry: RondeEntry,
  flowKind: RondeTemplateFlowKind
): Promise<ArrayBuffer | null> {
  try {
    const resolved = await gtsApiClient.resolveTemplateFileForContext({
      requesterRole: "OPERATEUR",
      flowKind,
      siteId: entry.siteId || null
    });
    const templateName = String(resolved.templateFileName || "").trim();
    if (!templateName) return null;
    return loadDocumentTemplateBuffer({ templateFileName: templateName });
  } catch {
    /* attribution absente/invalide: fallback normal */
  }
  return null;
}

function isPlannedFlowEntry(entry: RondeEntry): boolean {
  return entry.source === "PLANIFIE" || Boolean(entry.plannedProfileId) || Boolean(entry.plannedRoundKind);
}

function resolveProfileLabel(
  entry: RondeEntry,
  profiles?: RondePlannedProfileRef[] | null,
  preferredLabel?: string
): string {
  const explicit = String(preferredLabel || "").trim();
  if (explicit) return explicit;
  const fromProfile = entry.plannedProfileId
    ? profiles?.find((profile) => profile.id === entry.plannedProfileId)?.label
    : null;
  const resolved = String(fromProfile || "").trim();
  return resolved || "—";
}

async function renderDocxFromBuffer(
  entry: RondeEntry,
  profileLabel: string,
  buffer: ArrayBuffer,
  profiles?: RondePlannedProfileRef[] | null
): Promise<Blob | null> {
  try {
    return renderDocxtemplaterBlob(buffer, buildTemplateData(entry, profileLabel, profiles));
  } catch {
    return null;
  }
}

async function renderFromProfileTemplate(
  entry: RondeEntry,
  profileLabel: string,
  profiles?: RondePlannedProfileRef[] | null
): Promise<Blob | null> {
  try {
    const buffer = await loadProfileTemplateBuffer(profileLabel);
    if (!buffer) return null;
    const blob = await renderDocxFromBuffer(entry, profileLabel, buffer, profiles);
    if (!blob && !templateMissingWarningShown) {
      templateMissingWarningShown = true;
      console.warn(
        "[Rondes][Word] Modèle profil absent ou invalide (data/templates/<profil>_template.docx). Export en secours."
      );
    }
    return blob;
  } catch {
    if (!templateMissingWarningShown) {
      templateMissingWarningShown = true;
      console.warn(
        "[Rondes][Word] Modèle profil absent ou invalide (data/templates/<profil>_template.docx). Export en secours."
      );
    }
    return null;
  }
}

async function renderFromScopedPlannedRondeTemplate(
  entry: RondeEntry,
  profileLabel: string,
  profiles?: RondePlannedProfileRef[] | null
): Promise<Blob | null> {
  try {
    const buffer = await loadScopedRondeTemplateBuffer(entry, "RONDE_PLANIFIEE");
    if (!buffer) return null;
    return renderDocxFromBuffer(entry, profileLabel, buffer, profiles);
  } catch {
    return null;
  }
}

async function renderFromScopedExceptionalRondeTemplate(
  entry: RondeEntry,
  profileLabel: string,
  profiles?: RondePlannedProfileRef[] | null
): Promise<Blob | null> {
  try {
    const buffer = await loadScopedRondeTemplateBuffer(entry, "RONDE_EXCEPTIONNELLE");
    if (!buffer) return null;
    return renderDocxFromBuffer(entry, profileLabel, buffer, profiles);
  } catch {
    return null;
  }
}

async function loadDefaultRondeTemplateBuffer(): Promise<ArrayBuffer | null> {
  return loadDocumentTemplateBuffer({
    templateFileName: DEFAULT_RONDE_WORD_TEMPLATE_FILE
  });
}

/** Modèle générique `ronde-template.docx` (remplaçable dans Gestion des modèles). */
async function renderFromDefaultRondeTemplate(
  entry: RondeEntry,
  profileLabel: string,
  profiles?: RondePlannedProfileRef[] | null
): Promise<Blob | null> {
  const buffer = await loadDefaultRondeTemplateBuffer();
  if (!buffer) return null;
  return renderDocxFromBuffer(entry, profileLabel, buffer, profiles);
}

async function buildFallbackDocument(
  entry: RondeEntry,
  profileLabel: string,
  profiles?: RondePlannedProfileRef[] | null
): Promise<Document> {
  const data = buildTemplateData(entry, profileLabel, profiles);
  const lines = Object.entries(data).map(([k, v]) => `${k} : ${v}`);
  return new Document({
    creator: "Goron GTS",
    title: "Ronde — Export",
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [new TextRun({ text: "Ronde contractuelle — export", bold: true, size: 28 })]
          }),
          ...lines.map(
            (line) =>
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun(line)]
              })
          )
        ]
      }
    ]
  });
}

export async function exportRondeEntryToWord(
  entry: RondeEntry,
  options?: { profileLabel?: string; profiles?: RondePlannedProfileRef[] | null }
): Promise<void> {
  const profiles = options?.profiles;
  const label = resolveProfileLabel(entry, profiles, options?.profileLabel);
  const isPlannedFlow = isPlannedFlowEntry(entry);
  const templateBlob =
    (isPlannedFlow
      ? await renderFromScopedPlannedRondeTemplate(entry, label || "—", profiles)
      : await renderFromScopedExceptionalRondeTemplate(entry, label || "—", profiles)) ??
    (isPlannedFlow && label ? await renderFromProfileTemplate(entry, label, profiles) : null) ??
    (await renderFromDefaultRondeTemplate(entry, label || "—", profiles));
  const blob =
    templateBlob ?? (await Packer.toBlob(await buildFallbackDocument(entry, label || "—", profiles)));
  const part = safeExportFilenamePart(entry.siteDisplay || entry.workOrderNumber || "ronde");
  const datePart = safeExportFilenamePart(formatDateShortFr(entry.requestDate));
  const name = `Ronde_${part}_${datePart}.docx`;
  downloadBlob(blob, name);
}
