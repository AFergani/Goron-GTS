/**
 * Export Word d’une entrée main courante (`main-courante-template.docx`).
 *
 * Docxtemplater + repli docx avec logo ; dates et statuts en français.
 */

import {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun
} from "docx";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { MainCouranteEntry } from "../model/mainCourante.types";
import logoGts from "../../../assets/logo-gts.jpg";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import {
  exportTimestampForFilename,
  formatMainCouranteDate,
  safeExportFilenamePart,
  statusLabelFr
} from "./mainCouranteExportFormat";
import { downloadBlob } from "../../common/utils/downloadBlob";

const MAIN_COURANTE_TEMPLATE_URL = "/templates/main-courante-template.docx";
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

async function loadTemplateBuffer(): Promise<ArrayBuffer | null> {
  try {
    const template = await gtsApiClient.getDocumentTemplate("main-courante-template.docx");
    if (template.found && template.dataBase64) {
      return toArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
  } catch {
    // Continue with web fallback.
  }

  try {
    const response = await fetch(MAIN_COURANTE_TEMPLATE_URL);
    if (!response.ok) {
      throw new Error(`Template HTTP ${response.status}`);
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

type LogoData = {
  data: Uint8Array;
  width: number;
  height: number;
};

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

function safeText(value: string | null | undefined): string {
  const raw = value ?? "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleaned = sanitizeXmlText(normalized);
  return cleaned.trim() || "—";
}

async function renderFromTemplate(entry: MainCouranteEntry): Promise<Blob | null> {
  try {
    const buffer = await loadTemplateBuffer();
    if (!buffer) {
      throw new Error("Template introuvable");
    }
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });
    doc.render({
      date_creation: safeText(formatMainCouranteDate(entry.createdAt)),
      operateur: safeText(entry.operatorName),
      responsable: safeText(entry.managerName),
      site: safeText(entry.siteDisplay),
      type_anomalie: safeText(entry.anomalyTypeLabel),
      etat: safeText(statusLabelFr(entry.status)),
      prise_en_compte: safeText(entry.priseEnCompteAt ? formatMainCouranteDate(entry.priseEnCompteAt) : "—"),
      date_cloture: safeText(entry.closedAt ? formatMainCouranteDate(entry.closedAt) : "—"),
      information_operateur: safeText(entry.information),
      observation_responsable: safeText(entry.managerObservation || "—")
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
      console.warn(
        "[MainCourante][Word] Template absent/invalide (/templates/main-courante-template.docx). Export DOCX en mode secours."
      );
    }
    return null;
  }
}

async function loadLogoJpegData(): Promise<LogoData | null> {
  try {
    const response = await fetch(logoGts);
    if (!response.ok) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    const sourceWidth = 757;
    const sourceHeight = 648;
    const targetWidth = 170;
    const ratio = sourceHeight / sourceWidth;
    const targetHeight = Math.max(28, Math.round(targetWidth * ratio));
    return { data, width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
}

function fieldParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 110 },
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(safeText(value))]
  });
}

function multilineSection(title: string, body: string): Paragraph[] {
  const lines = safeText(body)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return [
    new Paragraph({
      spacing: { before: 220, after: 120 },
      children: [new TextRun({ text: title, bold: true })]
    }),
    ...lines.map(
      (line) =>
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun(line)]
        })
    )
  ];
}

async function buildEntryDocument(entry: MainCouranteEntry): Promise<Document> {
  const logoData = await loadLogoJpegData();
  const children: Paragraph[] = [
    ...(logoData
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new ImageRun({
                data: logoData.data,
                type: "jpg",
                transformation: { width: logoData.width, height: logoData.height }
              })
            ]
          })
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [new TextRun({ text: "Main courante - Fiche d'entrée", bold: true, size: 30 })]
    }),
    fieldParagraph("Date de création", formatMainCouranteDate(entry.createdAt)),
    fieldParagraph("Opérateur", entry.operatorName),
    fieldParagraph("Responsable", entry.managerName || "—"),
    fieldParagraph("Site", entry.siteDisplay || "—"),
    fieldParagraph("Type d'anomalie", entry.anomalyTypeLabel),
    fieldParagraph("État", statusLabelFr(entry.status)),
    fieldParagraph("Prise en compte", entry.priseEnCompteAt ? formatMainCouranteDate(entry.priseEnCompteAt) : "—"),
    fieldParagraph("Clôturé le", entry.closedAt ? formatMainCouranteDate(entry.closedAt) : "—"),
    ...multilineSection("Information (opérateur)", entry.information),
    ...multilineSection("Observation responsable", entry.managerObservation || "—")
  ];

  return new Document({
    creator: "Goron GTS",
    title: "Main courante — Fiche d’entrée",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      }
    ]
  });
}

/**
 * Génère un fichier .docx pour une entrée et déclenche le téléchargement.
 */
export async function exportMainCouranteEntryToWord(entry: MainCouranteEntry): Promise<void> {
  const templateBlob = await renderFromTemplate(entry);
  const blob = templateBlob ?? (await Packer.toBlob(await buildEntryDocument(entry)));
  const part = safeExportFilenamePart(entry.siteDisplay || entry.anomalyTypeLabel || "main-courante");
  const name = `main-courante_${part}_${exportTimestampForFilename()}.docx`;
  downloadBlob(blob, name);
}
