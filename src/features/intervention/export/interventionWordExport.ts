/**
 * Export Word d’une fiche intervention (modèle `intervention-template.docx`).
 *
 * Docxtemplater + repli docx programmatique ; champs variables et `exportExtraValues`.
 */

import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {
  INTERVENTION_NO_WORK_ORDER_LABEL,
  type InterventionEntry
} from "../model/intervention.types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { downloadBlob } from "../../common/utils/downloadBlob";
import { safeExportFilenamePart } from "../../common/utils/exportFilename";

const INTERVENTION_TEMPLATE_NAME = "intervention-template.docx";
const INTERVENTION_TEMPLATE_URL = "/templates/intervention-template.docx";
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

function formatDateFr(dateIso: string): string {
  if (!dateIso) return "—";
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());
  return `${day}-${month}-${year}`;
}

function statusLabelFr(status: InterventionEntry["status"]): string {
  if (status === "EN_COURS") return "En cours";
  if (status === "CLOTURE") return "Clôturée";
  return "Annulée";
}

function billingLabelFr(status: InterventionEntry["billingStatus"]): string {
  return status === "NON_FACTURABLE" ? "Non facturable" : "Facturable";
}

async function loadTemplateBuffer(templateName: string): Promise<ArrayBuffer | null> {
  try {
    const template = await gtsApiClient.getDocumentTemplate(templateName);
    if (template.found && template.dataBase64) {
      return toArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
  } catch {
    // Continue with web fallback.
  }

  try {
    const response = await fetch(INTERVENTION_TEMPLATE_URL);
    if (!response.ok) {
      throw new Error(`Template HTTP ${response.status}`);
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

async function renderFromTemplate(entry: InterventionEntry): Promise<Blob | null> {
  try {
    const resolved = await gtsApiClient.resolveTemplateFileForContext({
      requesterRole: "OPERATEUR",
      flowKind: "INTERVENTION",
      siteId: entry.siteId || null
    });
    const templateName = resolved.templateFileName || INTERVENTION_TEMPLATE_NAME;
    const buffer = await loadTemplateBuffer(templateName);
    if (!buffer) throw new Error("Template introuvable");
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });
    const extras: Record<string, string> = {};
    const rawExtras = entry.exportExtraValues && typeof entry.exportExtraValues === "object" ? entry.exportExtraValues : {};
    for (const [k, v] of Object.entries(rawExtras)) {
      if (!k) continue;
      extras[k] = safeText(v);
    }
    doc.render({
      dateDemande: safeText(formatDateFr(entry.requestDate)),
      dateDemandeIso: safeText(entry.requestDate),
      heureDemande: safeText(entry.requestTime),
      site: safeText(entry.siteDisplay),
      motif: safeText(entry.requestReason),
      prestataire: safeText(entry.intervenantName),
      heureArrivee: safeText(entry.arrivalTime),
      heureDepart: safeText(entry.departureTime),
      delaiMinutes: safeText(entry.delayMinutes == null ? "—" : `${entry.delayMinutes} Minutes`),
      delaiMinutesLabel: safeText(entry.delayMinutes == null ? "—" : `${entry.delayMinutes} Minutes`),
      numeroBonIntervention: safeText(entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL),
      compteRendu: safeText(entry.report),
      statut: safeText(statusLabelFr(entry.status)),
      facturation: safeText(billingLabelFr(entry.billingStatus)),
      ...extras
    });
    return doc
      .getZip()
      .generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }) as Blob;
  } catch {
    if (!templateMissingWarningShown) {
      templateMissingWarningShown = true;
      console.warn("[Intervention][Word] Template absent/invalide (/templates/intervention-template.docx). Export DOCX en mode secours.");
    }
    return null;
  }
}

async function buildFallbackDocument(entry: InterventionEntry): Promise<Document> {
  return new Document({
    creator: "Goron GTS",
    title: "Intervention — Fiche",
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [new TextRun({ text: "Fiche d'intervention", bold: true, size: 30 })]
          }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Date de l'intervention : ${safeText(entry.requestDate)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de l'appel : ${safeText(entry.requestTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Site : ${safeText(entry.siteDisplay)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Motif de l'intervention : ${safeText(entry.requestReason)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure d'arrivée : ${safeText(entry.arrivalTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de départ : ${safeText(entry.departureTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Délai d'arrivée : ${safeText(entry.delayMinutes)} min`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Numéro du bon : ${safeText(entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL)}`)] }),
          new Paragraph({ spacing: { before: 220, after: 80 }, children: [new TextRun({ text: "Observation :", bold: true })] }),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun(safeText(entry.report))] })
        ]
      }
    ]
  });
}

/** Télécharge la fiche Word pour une intervention. */
export async function exportInterventionEntryToWord(entry: InterventionEntry): Promise<void> {
  const templateBlob = await renderFromTemplate(entry);
  const blob = templateBlob ?? (await Packer.toBlob(await buildFallbackDocument(entry)));
  const part = safeExportFilenamePart(entry.siteDisplay || entry.workOrderNumber || "intervention");
  const datePart = safeExportFilenamePart(formatDateFr(entry.requestDate));
  const name = `Intervention_${part}_${datePart}.docx`;
  downloadBlob(blob, name);
}
