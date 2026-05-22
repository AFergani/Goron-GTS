/**
 * Export Word d’une fiche gardiennage clôturée ou annulée.
 *
 * Modèle `gardiennage-template.docx` (Paramètres ou ressource publique) via Docxtemplater.
 * Texte assaini pour XML ; repli docx programmatique si modèle absent.
 */

import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { downloadBlob } from "../../mainCourante/export/downloadBlob";
import { safeExportFilenamePart } from "../../mainCourante/export/mainCouranteExportFormat";
import { exportTimestampFrForFilename } from "../../intervention/export/interventionExportFormat";
import type { GardiennageEntry } from "../model/gardiennage.types";

const GARDIENNAGE_TEMPLATE_URL = "/templates/gardiennage-template.docx";
const GARDIENNAGE_TEMPLATE_NAME = "gardiennage-template.docx";
let templateMissingWarningShown = false;

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

function shiftDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateFr(isoDate: string): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusLabelFr(status: GardiennageEntry["status"]): string {
  if (status === "ACTIF") return "Actif";
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "Planifié";
}

function buildTemplateData(entry: GardiennageEntry): Record<string, string> {
  const startDateIso = entry.recurrenceStartDate || "";
  const fallbackEndDateIso = entry.crossesMidnight ? shiftDate(startDateIso, 1) : startDateIso;
  const endDateIso = entry.recurrenceEndDate || fallbackEndDateIso;
  return {
    site: safeText(entry.siteDisplay),
    prestataire: safeText(entry.intervenantName),
    dateDebut: safeText(formatDateFr(startDateIso)),
    heureDebut: safeText(entry.startTime),
    dateFin: safeText(formatDateFr(endDateIso)),
    heureFin: safeText(entry.endTime),
    statut: safeText(statusLabelFr(entry.status)),
    consigne: safeText(entry.notes),
    compteRendu: safeText(entry.closureReport),
    numeroBon: safeText(entry.workOrderNumber),
    passageMinuit: entry.crossesMidnight ? "Oui" : "Non"
  };
}

async function loadTemplateBufferByName(templateName: string): Promise<ArrayBuffer | null> {
  try {
    const template = await gtsApiClient.getDocumentTemplate(templateName);
    if (template.found && template.dataBase64) {
      return toArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
  } catch {
    // Continue with web fallback.
  }

  if (templateName !== GARDIENNAGE_TEMPLATE_NAME) return null;

  try {
    const response = await fetch(GARDIENNAGE_TEMPLATE_URL);
    if (!response.ok) {
      throw new Error(`Template HTTP ${response.status}`);
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

async function renderDocxFromTemplate(entry: GardiennageEntry, buffer: ArrayBuffer): Promise<Blob | null> {
  try {
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });
    doc.render(buildTemplateData(entry));
    return doc
      .getZip()
      .generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }) as Blob;
  } catch {
    return null;
  }
}

async function renderFromResolvedTemplate(entry: GardiennageEntry): Promise<Blob | null> {
  try {
    const resolved = await gtsApiClient.resolveTemplateFileForContext({
      requesterRole: "OPERATEUR",
      flowKind: "GARDIENNAGE",
      siteId: entry.siteId || null
    });
    const templateName = String(resolved.templateFileName || "").trim();
    if (!templateName) return null;
    const buffer = await loadTemplateBufferByName(templateName);
    if (!buffer) return null;
    return renderDocxFromTemplate(entry, buffer);
  } catch {
    return null;
  }
}

async function renderFromDefaultTemplate(entry: GardiennageEntry): Promise<Blob | null> {
  const buffer = await loadTemplateBufferByName(GARDIENNAGE_TEMPLATE_NAME);
  if (!buffer) return null;
  return renderDocxFromTemplate(entry, buffer);
}

async function buildFallbackDocument(entry: GardiennageEntry): Promise<Document> {
  const data = buildTemplateData(entry);
  return new Document({
    creator: "Goron GTS",
    title: "Gardiennage — Fiche",
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [new TextRun({ text: "Fiche de gardiennage", bold: true, size: 30 })]
          }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Site : ${data.site}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Prestataire : ${data.prestataire}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Date de début : ${data.dateDebut}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de début : ${data.heureDebut}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Date de fin : ${data.dateFin}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de fin : ${data.heureFin}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Statut : ${data.statut}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Passage minuit : ${data.passageMinuit}`)] }),
          new Paragraph({ spacing: { before: 120, after: 90 }, children: [new TextRun({ text: "Consigne", bold: true })] }),
          new Paragraph({ spacing: { after: 150 }, children: [new TextRun(data.consigne)] }),
          new Paragraph({ spacing: { before: 120, after: 90 }, children: [new TextRun({ text: "Compte rendu", bold: true })] }),
          new Paragraph({ spacing: { after: 150 }, children: [new TextRun(data.compteRendu)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`N° bon : ${data.numeroBon}`)] })
        ]
      }
    ]
  });
}

/** Télécharge la fiche Word pour une entrée (statut clôturé / annulé côté UI). */
export async function exportGardiennageEntryToWord(entry: GardiennageEntry): Promise<void> {
  const templateBlob = (await renderFromResolvedTemplate(entry)) ?? (await renderFromDefaultTemplate(entry));
  if (!templateBlob && !templateMissingWarningShown) {
    templateMissingWarningShown = true;
    console.warn("[Gardiennage][Word] Template absent/invalide (gardiennage-template.docx). Export DOCX en mode secours.");
  }
  const blob = templateBlob ?? (await Packer.toBlob(await buildFallbackDocument(entry)));
  const sitePart = safeExportFilenamePart(entry.siteDisplay || "gardiennage");
  const name = `Gardiennage_${sitePart}_${exportTimestampFrForFilename()}.docx`;
  downloadBlob(blob, name);
}
