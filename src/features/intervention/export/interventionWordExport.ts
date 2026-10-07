/**
 * Export Word d’une fiche intervention (modèle `intervention-template.docx`).
 *
 * Docxtemplater + repli docx programmatique ; champs variables et `exportExtraValues`.
 */

import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { type InterventionEntry } from "../model/intervention.types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { saveExportBlob, type SaveExportFileResult } from "../../common/utils/saveExportBlob";
import {
  loadDocumentTemplateBuffer,
  renderDocxtemplaterBlob,
  safeDocxText
} from "../../common/utils/docxTemplateHelpers";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { formatInterventionDateTime, formatInterventionWorkOrderNumber } from "./interventionExportFormat";
import {
  formVariableDocxExtras,
  loadCheckboxFieldKeys,
  siteDocxFields,
  type SiteAddressRef
} from "../../common/utils/docxSharedTokens";
import { ficheWordExportFilename } from "../../common/utils/exportFilename";

const INTERVENTION_TEMPLATE_NAME = "intervention-template.docx";
const INTERVENTION_TEMPLATE_URL = "/templates/intervention-template.docx";
let templateMissingWarningShown = false;

async function renderFromTemplate(entry: InterventionEntry, sites?: SiteAddressRef[] | null): Promise<Blob | null> {
  try {
    const resolved = await gtsApiClient.resolveTemplateFileForContext({
      requesterRole: "OPERATEUR",
      flowKind: "INTERVENTION",
      siteId: entry.siteId || null
    });
    const templateName = resolved.templateFileName || INTERVENTION_TEMPLATE_NAME;
    const buffer = await loadDocumentTemplateBuffer({
      templateFileName: templateName,
      webFallbackUrl: INTERVENTION_TEMPLATE_URL
    });
    if (!buffer) throw new Error("Template introuvable");
    const extras = formVariableDocxExtras(entry.exportExtraValues, await loadCheckboxFieldKeys());
    const delayLabel = entry.delayMinutes == null ? "—" : `${entry.delayMinutes} Minutes`;
    return renderDocxtemplaterBlob(buffer, {
      ...siteDocxFields(entry.siteDisplay, { siteId: entry.siteId, sites }),
      date_demande: safeDocxText(formatDateShortFr(entry.requestDate) || "—"),
      heure_demande: safeDocxText(entry.requestTime),
      motif: safeDocxText(entry.requestReason),
      prestataire: safeDocxText(entry.intervenantName),
      heure_arrivee: safeDocxText(
        entry.arrivalTime ? formatInterventionDateTime(entry.arrivalDate || entry.requestDate, entry.arrivalTime) : ""
      ),
      heure_depart: safeDocxText(
        entry.departureTime
          ? formatInterventionDateTime(entry.departureDate || entry.arrivalDate || entry.requestDate, entry.departureTime)
          : ""
      ),
      delai_minutes: safeDocxText(delayLabel),
      numero_bon: safeDocxText(formatInterventionWorkOrderNumber(entry)),
      compte_rendu: safeDocxText(entry.report),
      numeroFiche: safeDocxText(entry.dailyCode),
      ...extras
    });
  } catch {
    if (!templateMissingWarningShown) {
      templateMissingWarningShown = true;
      console.warn("[Intervention][Word] Template absent/invalide (/templates/intervention-template.docx). Export DOCX en mode secours.");
    }
    return null;
  }
}

async function buildFallbackDocument(entry: InterventionEntry, sites?: SiteAddressRef[] | null): Promise<Document> {
  const address = siteDocxFields(entry.siteDisplay, { siteId: entry.siteId, sites }).adresse_site;
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
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Date de l'intervention : ${safeDocxText(formatDateShortFr(entry.requestDate) || entry.requestDate)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de l'appel : ${safeDocxText(entry.requestTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Site : ${safeDocxText(entry.siteDisplay)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Adresse site : ${address}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Motif de l'intervention : ${safeDocxText(entry.requestReason)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Arrivée : ${safeDocxText(entry.arrivalTime ? formatInterventionDateTime(entry.arrivalDate || entry.requestDate, entry.arrivalTime) : "")}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Départ : ${safeDocxText(entry.departureTime ? formatInterventionDateTime(entry.departureDate || entry.arrivalDate || entry.requestDate, entry.departureTime) : "")}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Délai d'arrivée : ${safeDocxText(entry.delayMinutes)} min`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Numéro du bon : ${safeDocxText(formatInterventionWorkOrderNumber(entry))}`)] }),
          new Paragraph({ spacing: { before: 220, after: 80 }, children: [new TextRun({ text: "Observation :", bold: true })] }),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun(safeDocxText(entry.report))] })
        ]
      }
    ]
  });
}

/**
 * Enregistre la fiche Word pour une intervention.
 *
 * @param entry - Fiche intervention.
 * @param options - Référentiel sites, pour le jeton `{adresse_site}`.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportInterventionEntryToWord(
  entry: InterventionEntry,
  options?: { sites?: SiteAddressRef[] | null }
): Promise<SaveExportFileResult> {
  const templateBlob = await renderFromTemplate(entry, options?.sites);
  const blob = templateBlob ?? (await Packer.toBlob(await buildFallbackDocument(entry, options?.sites)));
  const name = ficheWordExportFilename("Intervention", entry.dailyCode, entry.siteDisplay);
  return saveExportBlob(blob, name);
}
