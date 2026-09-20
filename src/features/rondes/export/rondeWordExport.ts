/**
 * Export Word fiche ronde (modèle par défaut ou par profil planifié).
 *
 * Jetons Docxtemplater, champs clôture, repli docx ; partagé avec Paramètres (modèles).
 */

import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { saveExportBlob, type SaveExportFileResult } from "../../common/utils/saveExportBlob";
import {
  loadDocumentTemplateBuffer,
  renderDocxtemplaterBlob,
  safeDocxText
} from "../../common/utils/docxTemplateHelpers";
import { ficheWordExportFilename } from "../../common/utils/exportFilename";
import { formVariableDocxExtras, siteDocxFields } from "../../common/utils/docxSharedTokens";
import { formatDateShortFr, formatIsoDatesInTextToFrench } from "../../common/utils/formatDateShortFr";
import type { HolidayRef } from "../../../types";
import { formatRondeConsigne, formatRondeResumeDemande } from "../utils/formatRondeResumeDemande";
import { rondePassageKindWordLabel } from "../utils/rondePassageKindLabel";
import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { plannedProfileWordTemplateFileName } from "./profileTemplateFilename";
import { formatRondeClosureDateFr } from "./rondeExportFormat";

let templateMissingWarningShown = false;

/** Fichier installable depuis Paramètres → Données → Gestion des modèles ; utilisé si aucun modèle spécifique au profil. */
export const DEFAULT_RONDE_WORD_TEMPLATE_FILE = "ronde-template.docx";
type RondeTemplateFlowKind = "RONDE_PLANIFIEE" | "RONDE_EXCEPTIONNELLE";

type RondeWordRenderContext = {
  profiles?: RondePlannedProfileRef[] | null;
  holidayDateIsos?: string[];
};

/** Données Docxtemplater : jetons ronde contractuelle + champs fiche + clés champs de clôture. */
function buildTemplateData(
  entry: RondeEntry,
  _profileLabel: string,
  ctx?: RondeWordRenderContext
): Record<string, string> {
  const siteFields = siteDocxFields(entry.siteDisplay);
  const dateJour = formatDateShortFr(entry.requestDate);
  const resumeOpts = {
    profiles: ctx?.profiles,
    holidayDateIsos: ctx?.holidayDateIsos
  };
  const resumeDemande = formatRondeResumeDemande(entry, resumeOpts);
  const consigne = formatRondeConsigne(entry, resumeOpts);

  const base: Record<string, string> = {
    ...siteFields,
    numeroFiche: safeDocxText(entry.dailyCode),
    prestataire: safeDocxText(entry.intervenantName),
    motif: safeDocxText(entry.motifTypeLabel),
    date_demande: safeDocxText(dateJour),
    heure_arrivee: safeDocxText(entry.arrivalTime),
    heure_depart: safeDocxText(entry.departureTime),
    duree_minutes:
      entry.durationMinutes == null ? "—" : safeDocxText(`${entry.durationMinutes} min`),
    numero_bon: safeDocxText(entry.workOrderNumber),
    compte_rendu: safeDocxText(entry.report),
    type_passage: safeDocxText(rondePassageKindWordLabel(entry)),
    consigne: safeDocxText(consigne),
    resume_demande: safeDocxText(resumeDemande),
    date_cloture: safeDocxText(formatRondeClosureDateFr(entry, ctx?.profiles) || "—")
  };

  const merged: Record<string, string> = {
    ...base,
    ...formVariableDocxExtras(entry.closureCustomValues)
  };
  for (const [key, value] of Object.entries(merged)) {
    merged[key] = formatIsoDatesInTextToFrench(value);
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
  ctx?: RondeWordRenderContext
): Promise<Blob | null> {
  try {
    return renderDocxtemplaterBlob(buffer, buildTemplateData(entry, profileLabel, ctx));
  } catch {
    return null;
  }
}

async function renderFromProfileTemplate(
  entry: RondeEntry,
  profileLabel: string,
  ctx?: RondeWordRenderContext
): Promise<Blob | null> {
  try {
    const buffer = await loadProfileTemplateBuffer(profileLabel);
    if (!buffer) return null;
    const blob = await renderDocxFromBuffer(entry, profileLabel, buffer, ctx);
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
  ctx?: RondeWordRenderContext
): Promise<Blob | null> {
  try {
    const buffer = await loadScopedRondeTemplateBuffer(entry, "RONDE_PLANIFIEE");
    if (!buffer) return null;
    return renderDocxFromBuffer(entry, profileLabel, buffer, ctx);
  } catch {
    return null;
  }
}

async function renderFromScopedExceptionalRondeTemplate(
  entry: RondeEntry,
  profileLabel: string,
  ctx?: RondeWordRenderContext
): Promise<Blob | null> {
  try {
    const buffer = await loadScopedRondeTemplateBuffer(entry, "RONDE_EXCEPTIONNELLE");
    if (!buffer) return null;
    return renderDocxFromBuffer(entry, profileLabel, buffer, ctx);
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
  ctx?: RondeWordRenderContext
): Promise<Blob | null> {
  const buffer = await loadDefaultRondeTemplateBuffer();
  if (!buffer) return null;
  return renderDocxFromBuffer(entry, profileLabel, buffer, ctx);
}

async function buildFallbackDocument(
  entry: RondeEntry,
  profileLabel: string,
  ctx?: RondeWordRenderContext
): Promise<Document> {
  const data = buildTemplateData(entry, profileLabel, ctx);
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

/**
 * Enregistre la fiche Word d’une ronde.
 *
 * @param entry - Fiche ronde.
 * @param options - Libellé de profil, programmations et jours fériés (récapitulatif Word).
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportRondeEntryToWord(
  entry: RondeEntry,
  options?: {
    profileLabel?: string;
    profiles?: RondePlannedProfileRef[] | null;
    holidays?: HolidayRef[] | null;
  }
): Promise<SaveExportFileResult> {
  const ctx: RondeWordRenderContext = {
    profiles: options?.profiles,
    holidayDateIsos: (options?.holidays || []).map((item) => item.dateIso)
  };
  const label = resolveProfileLabel(entry, ctx.profiles, options?.profileLabel);
  const isPlannedFlow = isPlannedFlowEntry(entry);
  const templateBlob =
    (isPlannedFlow
      ? await renderFromScopedPlannedRondeTemplate(entry, label || "—", ctx)
      : await renderFromScopedExceptionalRondeTemplate(entry, label || "—", ctx)) ??
    (isPlannedFlow && label ? await renderFromProfileTemplate(entry, label, ctx) : null) ??
    (await renderFromDefaultRondeTemplate(entry, label || "—", ctx));
  const blob =
    templateBlob ?? (await Packer.toBlob(await buildFallbackDocument(entry, label || "—", ctx)));
  const name = ficheWordExportFilename("Ronde", entry.dailyCode, entry.siteDisplay);
  return saveExportBlob(blob, name);
}
