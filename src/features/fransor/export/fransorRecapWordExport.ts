/**
 * Export Word du récapitulatif mensuel Fransor (modèle `fransor-recap-template.docx`).
 *
 * Charge le modèle via l’API (Paramètres → Données → modèles), injecte totaux, boucle
 * `{#recap_rows}` et jetons plats `resp_<slug>_ouvertures|fermetures|nom` par responsable.
 * Téléchargement local `.docx` — pas d’UUID ni identifiants techniques dans le fichier.
 */

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { FransorMonthlyRecap } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { downloadBlob } from "../../mainCourante/export/downloadBlob";
import { safeExportFilenamePart } from "../../mainCourante/export/mainCouranteExportFormat";
import { fransorResponsableWordSlug } from "../utils/fransorResponsableWordSlug";

const FRANSOR_RECAP_TEMPLATE_FILE = "fransor-recap-template.docx";

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

/** Payload Docxtemplater : totaux globaux, lignes tableau et jetons par responsable */
export function buildFransorRecapWordData(
  monthIso: string,
  monthLabelFr: string,
  recap: FransorMonthlyRecap[]
): Record<string, unknown> {
  const totalOuvertures = recap.reduce((sum, row) => sum + row.ouvertures, 0);
  const totalFermetures = recap.reduce((sum, row) => sum + row.fermetures, 0);
  const totalActions = recap.reduce((sum, row) => sum + row.totalActions, 0);

  const data: Record<string, unknown> = {
    month_iso: monthIso,
    month_label_fr: monthLabelFr,
    CountOuverture: String(totalOuvertures),
    CountFermeture: String(totalFermetures),
    total_actions: String(totalActions),
    recap_rows: recap.map((row) => {
      const slug = fransorResponsableWordSlug(row.responsableName);
      return {
        responsable_nom: row.responsableName,
        slug,
        ouvertures: String(row.ouvertures),
        fermetures: String(row.fermetures),
        total_actions: String(row.totalActions)
      };
    })
  };

  for (const row of recap) {
    const slug = fransorResponsableWordSlug(row.responsableName);
    data[`resp_${slug}_ouvertures`] = String(row.ouvertures);
    data[`resp_${slug}_fermetures`] = String(row.fermetures);
    data[`resp_${slug}_nom`] = row.responsableName;
  }

  return data;
}

/** Génère et télécharge `Fransor_recap_<mois>.docx` */
export async function exportFransorMonthlyRecapToWord(
  monthIso: string,
  monthLabelFr: string,
  recap: FransorMonthlyRecap[]
): Promise<void> {
  const template = await gtsApiClient.getDocumentTemplate(FRANSOR_RECAP_TEMPLATE_FILE);
  if (!template.found || !template.dataBase64) {
    throw new Error(
      "Modèle Word introuvable : enregistrez « fransor-recap-template.docx » dans data/templates (Paramètres → Données → Gestion des modèles → bouton Remplacer)."
    );
  }

  const zip = new PizZip(toArrayBuffer(base64ToUint8Array(template.dataBase64)));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });
  doc.render(buildFransorRecapWordData(monthIso, monthLabelFr, recap));
  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }) as Blob;

  const partMonth = safeExportFilenamePart(monthIso);
  downloadBlob(blob, `Fransor_recap_${partMonth}.docx`);
}
