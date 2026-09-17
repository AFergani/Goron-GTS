/**
 * Export Word d’une fiche intervention (modèle `intervention-template.docx`).
 *
 * Docxtemplater + repli docx programmatique ; champs variables et `exportExtraValues`.
 */

import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import {
  INTERVENTION_NO_WORK_ORDER_LABEL,
  type InterventionEntry
} from "../model/intervention.types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { saveExportBlob, type SaveExportFileResult } from "../../common/utils/saveExportBlob";
import {
  loadDocumentTemplateBuffer,
  renderDocxtemplaterBlob,
  safeDocxText
} from "../../common/utils/docxTemplateHelpers";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { safeExportFilenamePart } from "../../common/utils/exportFilename";
import { statusLabelFr } from "./interventionExportFormat";

const INTERVENTION_TEMPLATE_NAME = "intervention-template.docx";
const INTERVENTION_TEMPLATE_URL = "/templates/intervention-template.docx";
let templateMissingWarningShown = false;

async function renderFromTemplate(entry: InterventionEntry): Promise<Blob | null> {
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
    const extras: Record<string, string> = {};
    const rawExtras = entry.exportExtraValues && typeof entry.exportExtraValues === "object" ? entry.exportExtraValues : {};
    for (const [k, v] of Object.entries(rawExtras)) {
      if (!k) continue;
      extras[k] = safeDocxText(v);
    }
    return renderDocxtemplaterBlob(buffer, {
      dateDemande: safeDocxText(formatDateShortFr(entry.requestDate) || "—"),
      dateDemandeIso: safeDocxText(entry.requestDate),
      heureDemande: safeDocxText(entry.requestTime),
      site: safeDocxText(entry.siteDisplay),
      motif: safeDocxText(entry.requestReason),
      prestataire: safeDocxText(entry.intervenantName),
      heureArrivee: safeDocxText(entry.arrivalTime),
      heureDepart: safeDocxText(entry.departureTime),
      delaiMinutes: safeDocxText(entry.delayMinutes == null ? "—" : `${entry.delayMinutes} Minutes`),
      delaiMinutesLabel: safeDocxText(entry.delayMinutes == null ? "—" : `${entry.delayMinutes} Minutes`),
      numeroBonIntervention: safeDocxText(entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL),
      compteRendu: safeDocxText(entry.report),
      statut: safeDocxText(statusLabelFr(entry.status)),
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
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Date de l'intervention : ${safeDocxText(formatDateShortFr(entry.requestDate) || entry.requestDate)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de l'appel : ${safeDocxText(entry.requestTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Site : ${safeDocxText(entry.siteDisplay)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Motif de l'intervention : ${safeDocxText(entry.requestReason)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure d'arrivée : ${safeDocxText(entry.arrivalTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Heure de départ : ${safeDocxText(entry.departureTime)}`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Délai d'arrivée : ${safeDocxText(entry.delayMinutes)} min`)] }),
          new Paragraph({ spacing: { after: 110 }, children: [new TextRun(`Numéro du bon : ${safeDocxText(entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL)}`)] }),
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
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportInterventionEntryToWord(entry: InterventionEntry): Promise<SaveExportFileResult> {
  const templateBlob = await renderFromTemplate(entry);
  const blob = templateBlob ?? (await Packer.toBlob(await buildFallbackDocument(entry)));
  const part = safeExportFilenamePart(entry.siteDisplay || entry.workOrderNumber || "intervention");
  const datePart = safeExportFilenamePart(formatDateShortFr(entry.requestDate) || "date");
  const name = `Intervention_${part}_${datePart}.docx`;
  return saveExportBlob(blob, name);
}
