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
import type { MainCouranteEntry } from "../model/mainCourante.types";
import logoGts from "../../../assets/logo-gts.jpg";
import { saveExportBlob, type SaveExportFileResult } from "../../common/utils/saveExportBlob";
import {
  loadDocumentTemplateBuffer,
  renderDocxtemplaterBlob,
  safeDocxText
} from "../../common/utils/docxTemplateHelpers";
import { ficheWordExportFilename } from "../../common/utils/exportFilename";
import { formatMainCouranteDate, statusLabelFr } from "./mainCouranteExportFormat";
import {
  formVariableDocxExtras,
  loadCheckboxFieldKeys,
  siteDocxFields,
  type SiteAddressRef
} from "../../common/utils/docxSharedTokens";

const MAIN_COURANTE_TEMPLATE_FILE = "main-courante-template.docx";
const MAIN_COURANTE_TEMPLATE_URL = "/templates/main-courante-template.docx";
let templateMissingWarningShown = false;

type LogoData = {
  data: Uint8Array;
  width: number;
  height: number;
};

async function renderFromTemplate(entry: MainCouranteEntry, sites?: SiteAddressRef[] | null): Promise<Blob | null> {
  try {
    const buffer = await loadDocumentTemplateBuffer({
      templateFileName: MAIN_COURANTE_TEMPLATE_FILE,
      webFallbackUrl: MAIN_COURANTE_TEMPLATE_URL
    });
    if (!buffer) {
      throw new Error("Template introuvable");
    }
    return renderDocxtemplaterBlob(buffer, {
      ...siteDocxFields(entry.siteDisplay, { siteId: entry.siteId, sites }),
      date_creation: safeDocxText(formatMainCouranteDate(entry.createdAt)),
      operateur: safeDocxText(entry.operatorName),
      responsable: safeDocxText(entry.managerName),
      type_anomalie: safeDocxText(entry.anomalyTypeLabel),
      statut: safeDocxText(statusLabelFr(entry.status)),
      numeroFiche: safeDocxText(entry.dailyCode),
      prise_en_compte: safeDocxText(entry.priseEnCompteAt ? formatMainCouranteDate(entry.priseEnCompteAt) : "—"),
      date_cloture: safeDocxText(entry.closedAt ? formatMainCouranteDate(entry.closedAt) : "—"),
      information_operateur: safeDocxText(entry.information),
      observation_responsable: safeDocxText(entry.managerObservation || "—"),
      ...formVariableDocxExtras(entry.exportExtraValues, await loadCheckboxFieldKeys())
    });
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
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(safeDocxText(value))]
  });
}

function multilineSection(title: string, body: string): Paragraph[] {
  const lines = safeDocxText(body)
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

async function buildEntryDocument(entry: MainCouranteEntry, sites?: SiteAddressRef[] | null): Promise<Document> {
  const address = siteDocxFields(entry.siteDisplay, { siteId: entry.siteId, sites }).adresse_site;
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
    fieldParagraph("Adresse site", address),
    fieldParagraph("Type d'anomalie", entry.anomalyTypeLabel),
    fieldParagraph("État", statusLabelFr(entry.status)),
    fieldParagraph("Prise en compte", entry.priseEnCompteAt ? formatMainCouranteDate(entry.priseEnCompteAt) : "—"),
    fieldParagraph("Clôturé le", entry.closedAt ? formatMainCouranteDate(entry.closedAt) : "—"),
    ...multilineSection("Observation", entry.information),
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
 * Génère un fichier .docx pour une entrée et ouvre le dialogue d’enregistrement.
 *
 * @param entry - Ligne de main courante.
 * @param options - Référentiel sites, pour le jeton `{adresse_site}`.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportMainCouranteEntryToWord(
  entry: MainCouranteEntry,
  options?: { sites?: SiteAddressRef[] | null }
): Promise<SaveExportFileResult> {
  const templateBlob = await renderFromTemplate(entry, options?.sites);
  const blob = templateBlob ?? (await Packer.toBlob(await buildEntryDocument(entry, options?.sites)));
  const name = ficheWordExportFilename("main-courante", entry.dailyCode, entry.siteDisplay);
  return saveExportBlob(blob, name);
}
