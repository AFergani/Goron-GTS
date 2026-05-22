import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
/**
 * Export Word fiche ronde (modèle par défaut ou par profil planifié).
 *
 * Jetons Docxtemplater, champs clôture, repli docx ; partagé avec Paramètres (modèles).
 */

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { downloadBlob } from "../../mainCourante/export/downloadBlob";
import { safeExportFilenamePart } from "../../mainCourante/export/mainCouranteExportFormat";
import { splitSiteDisplayParts } from "../utils/closureLabelTemplate";
import { formatDateShortFr } from "../utils/formatDateShortFr";
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

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function sanitizeXmlText(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    const validXmlChar =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    if (validXmlChar) out += char;
  }
  return out;
}

function safeText(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleaned = sanitizeXmlText(normalized).trim();
  return cleaned || "—";
}

function statusLabelFr(status: RondeEntry["status"]): string {
  if (status === "CLOTURE") return "Clôturée";
  if (status === "ANNULE") return "Annulée";
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
  const siteCode = safeText(parts.codePart);
  const siteName = safeText(parts.namePart);
  const siteLabel = safeText(entry.siteDisplay);
  const profil = safeText(profileLabel);
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
    prestataire: safeText(entry.intervenantName),
    date_demande: safeText(dateJour),
    date_du_jour: safeText(dateJour),
    heure_demandee: safeText(heureDem || "—"),
    motif_type: safeText(entry.motifTypeLabel),
    motif_detail: safeText(entry.motifDetail),
    motif: safeText(
      entry.motifDetail.trim() ? `${entry.motifTypeLabel.trim()} (${entry.motifDetail.trim()})` : entry.motifTypeLabel
    ),
    horaires_demande_obs: safeText(entry.horairesDemandeObs),
    origine: safeText(originSummary(entry)),
    heure_arrivee: safeText(entry.arrivalTime),
    heure_depart: safeText(entry.departureTime),
    duree_minutes:
      entry.durationMinutes == null ? "—" : safeText(`${entry.durationMinutes} min`),
    numero_bon: safeText(entry.workOrderNumber),
    compte_rendu: safeText(entry.report),
    statut: safeText(statusLabelFr(entry.status)),
    type_passage: safeText(roundKindLabel(entry)),
    date_logique_passage: safeText(logicalDateFr),
    date_logique: safeText(logicalDateFr),
    date_logique_iso: safeText(logicalDateIso),
    transition_date: safeText(transitionDateLabel),
    passage_apres_minuit: logicalDateComputed.shiftedAfterMidnight ? "Oui" : "Non"
  };

  const merged: Record<string, string> = { ...base };
  const customs = entry.closureCustomValues && typeof entry.closureCustomValues === "object" ? entry.closureCustomValues : {};
  for (const [key, val] of Object.entries(customs)) {
    const k = String(key || "").trim();
    if (!k) continue;
    merged[k] = safeText(val);
  }
  return merged;
}

async function loadProfileTemplateBuffer(profileLabel: string): Promise<ArrayBuffer | null> {
  const name = plannedProfileWordTemplateFileName(profileLabel);
  try {
    const template = await gtsApiClient.getDocumentTemplate(name);
    if (template.found && template.dataBase64) {
      return toArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
  } catch {
    /* fichier absent ou erreur réseau */
  }
  return null;
}

async function loadScopedRondeTemplateBuffer(entry: RondeEntry, flowKind: RondeTemplateFlowKind): Promise<ArrayBuffer | null> {
  try {
    const resolved = await gtsApiClient.resolveTemplateFileForContext({
      requesterRole: "OPERATEUR",
      flowKind,
      siteId: entry.siteId || null
    });
    const templateName = String(resolved.templateFileName || "").trim();
    if (!templateName) return null;
    const template = await gtsApiClient.getDocumentTemplate(templateName);
    if (template.found && template.dataBase64) {
      return toArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
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
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });
    doc.render(buildTemplateData(entry, profileLabel, profiles));
    return doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }) as Blob;
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
  try {
    const template = await gtsApiClient.getDocumentTemplate(DEFAULT_RONDE_WORD_TEMPLATE_FILE);
    if (template.found && template.dataBase64) {
      return toArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
  } catch {
    /* fichier absent */
  }
  return null;
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
