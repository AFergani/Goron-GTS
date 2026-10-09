/**
 * Export Word d'une fiche PV vidéo depuis le modèle par défaut `PV-Video-template.docx`.
 *
 * Le modèle embarqué est prioritaire tant qu'aucune copie n'est déposée dans data/templates.
 * Les photos remplissent `{%photo_camera}` et `{%capture_globale}`.
 */

import PizZip from "pizzip";
import { cameraLabelUpper, type PvVideoForm, type PvVideoImage } from "../model/pvVideoForm";
import { saveExportBlob } from "../../common/utils/saveExportBlob";
import { createDocxImageModule, type DocxTemplateImage } from "../../common/utils/docxImageModule";
import {
  loadDocumentTemplateBuffer,
  normalizeNewlines,
  renderDocxtemplaterBlob,
  safeDocxText,
  sanitizeXmlText
} from "../../common/utils/docxTemplateHelpers";

const PV_VIDEO_TEMPLATE_FILE = "PV-Video-template.docx";
const PV_VIDEO_TEMPLATE_URL = "/templates/PV-Video-template.docx";
/** 15 % de plus que les 480 px d’origine : environ 146 mm, seule au centre de la dernière page. */
const GLOBAL_IMAGE_MAX_WIDTH = 552;
/** Environ 87 × 49 mm : quatre caméras remplissent la page, la cinquième passe à la suivante. */
const CAMERA_IMAGE_MAX_WIDTH = 330;
const CAMERA_IMAGE_MAX_HEIGHT = 185;
/** Dernière ligne du tableau de connexion : libellé + nombre de lignes caméras. */
const CAMERA_COUNT_ROW =
  "<w:tr><w:trPr><w:trHeight w:val=\"806\"/><w:jc w:val=\"center\"/></w:trPr>" +
  "<w:tc><w:tcPr><w:tcW w:w=\"3020\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/></w:tcPr>" +
  "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr></w:p>" +
  "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr><w:r><w:t>Nombre de caméras</w:t></w:r></w:p>" +
  "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr></w:p></w:tc>" +
  "<w:tc><w:tcPr><w:tcW w:w=\"6040\" w:type=\"dxa\"/><w:vAlign w:val=\"center\"/></w:tcPr>" +
  "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr><w:r><w:t>{nombre_cameras}</w:t></w:r></w:p></w:tc></w:tr>";

type ExportInput = {
  siteName: string;
  siteCode: string;
  siteAddress: string;
  form: PvVideoForm;
  image: PvVideoImage | null;
};

/**
 * Décode le base64 en octets dont le buffer est un ArrayBuffer classique.
 *
 * @param base64 - Contenu de la photo, sans préfixe data-URL.
 */
function bytesFromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Prépare une photo pour le jeton image, limitée en largeur et en hauteur.
 *
 * @param image - Photo de la fiche, ou aucune.
 * @param maxWidth - Largeur maximale en pixels.
 * @param maxHeight - Hauteur maximale en pixels.
 * @returns Image dimensionnée, ou `null` s'il n'y a rien à insérer.
 */
async function toTemplateImage(
  image: PvVideoImage | null,
  maxWidth: number,
  maxHeight: number = maxWidth
): Promise<DocxTemplateImage | null> {
  if (!image?.base64) return null;
  const bytes = bytesFromBase64(image.base64);
  const extension: DocxTemplateImage["extension"] = image.mime === "image/png" ? "png" : "jpeg";
  try {
    const blob = new Blob([bytes.buffer], { type: image.mime });
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const sized = {
      bytes,
      widthPx: Math.max(1, Math.round(bitmap.width * scale)),
      heightPx: Math.max(1, Math.round(bitmap.height * scale)),
      extension
    };
    bitmap.close();
    return sized;
  } catch {
    return { bytes, widthPx: maxWidth, heightPx: Math.min(maxHeight, Math.round(maxWidth * 0.75)), extension };
  }
}

/**
 * Remplace la deuxième cellule si elle répète encore le numéro de caméra.
 *
 * Le modèle déposé met `{#cameras}{numero_camera}` dans les deux premières colonnes.
 * La colonne du milieu doit porter `{intitule_camera}` pour que la ligne se répète.
 *
 * @param buffer - Modèle Word chargé.
 * @returns Le même buffer, ou une copie corrigée.
 */
function repairCameraRowTemplate(buffer: ArrayBuffer): ArrayBuffer {
  const zip = new PizZip(buffer);
  const document = zip.file("word/document.xml");
  if (!document) return buffer;
  const xml = document.asText();
  if (xml.includes("intitule_camera")) return buffer;
  const paragraphPattern = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*numero_camera\}(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g;
  let seen = 0;
  const next = xml.replace(paragraphPattern, (paragraph) => {
    seen += 1;
    if (seen !== 2) return paragraph;
    const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const props = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    return `${open}${props ? props[0] : ""}<w:r><w:t xml:space="preserve">{intitule_camera}</w:t></w:r></w:p>`;
  });
  if (seen < 2 || next === xml) return buffer;
  zip.file("word/document.xml", next);
  const bytes = zip.generate({ type: "uint8array" }) as Uint8Array;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Ajoute la ligne « Nombre de caméras » au tableau de connexion si le modèle ne l'a pas.
 *
 * Le nombre vient des lignes du listing, via `{nombre_cameras}`.
 * Un modèle déjà à jour, ou déposé dans data/templates, n'est pas modifié deux fois.
 *
 * @param buffer - Modèle Word chargé.
 * @returns Le même buffer, ou une copie avec la ligne en fin de tableau.
 */
function ensureCameraCountRow(buffer: ArrayBuffer): ArrayBuffer {
  const zip = new PizZip(buffer);
  const document = zip.file("word/document.xml");
  if (!document) return buffer;
  const xml = document.asText();
  if (xml.includes("nombre_cameras")) return buffer;
  const markerAt = ["Date de raccordement", "date_raccordement"]
    .map((needle) => xml.indexOf(needle))
    .find((index) => index >= 0);
  if (markerAt == null || markerAt < 0) return buffer;
  const tableEnd = xml.indexOf("</w:tbl>", markerAt);
  if (tableEnd < 0) return buffer;
  zip.file("word/document.xml", xml.slice(0, tableEnd) + CAMERA_COUNT_ROW + xml.slice(tableEnd));
  const bytes = zip.generate({ type: "uint8array" }) as Uint8Array;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Premier message utile d'une erreur Docxtemplater.
 *
 * @param error - Rejet du rendu.
 */
function templateErrorMessage(error: unknown): string {
  const details = error as { properties?: { errors?: Array<{ properties?: { explanation?: string } }> } };
  const explanation = details.properties?.errors?.find((item) => item.properties?.explanation)?.properties?.explanation;
  if (explanation) return `Le modèle PV Vidéo n'a pas pu être rempli. ${explanation}`;
  return "Le modèle PV Vidéo n'a pas pu être rempli.";
}

/**
 * Libellé devant une saisie. Vide si la saisie est vide : l'export affichera alors un tiret.
 *
 * @param label - Libellé affiché dans le Word.
 * @param value - Texte saisi.
 */
function labeledValue(label: string, value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "";
  return `${label} : ${cleaned}`;
}

/**
 * Texte de la case « Méthode de connexion ».
 * Logiciel devant le nom du logiciel, VPN devant le nom du VPN lorsqu'il est renseigné.
 *
 * @param form - Fiche exportée.
 */
function connectionMethodExport(form: PvVideoForm): string {
  const parts = [labeledValue("Logiciel", form.connectionMethod)];
  if (form.vpnEnabled) {
    const vpn = labeledValue("VPN", form.vpnName);
    if (vpn) parts.push(vpn);
  }
  return parts.filter(Boolean).join(" — ");
}

/**
 * Texte de la case Information.
 * Photo seule : rien à côté de l'image. Texte seul : le texte. Les deux : les deux.
 * Ni l'un ni l'autre : un tiret.
 *
 * @param information - Saisie de la ligne.
 * @param hasImage - Une photo est prête pour cette ligne.
 */
function cameraInformationExport(information: string, hasImage: boolean): string {
  const cleaned = sanitizeXmlText(normalizeNewlines(cameraLabelUpper(information))).trim();
  if (cleaned) return cleaned;
  return hasImage ? "" : "—";
}

/**
 * Propose l'enregistrement du PV Word construit avec le modèle par défaut.
 *
 * @param input - Champs affichés, site du référentiel et photos.
 * @returns Résultat du dialogue d'enregistrement.
 */
export async function exportPvVideoWord(input: ExportInput) {
  const buffer = await loadDocumentTemplateBuffer({
    templateFileName: PV_VIDEO_TEMPLATE_FILE,
    webFallbackUrl: PV_VIDEO_TEMPLATE_URL
  });
  if (!buffer) {
    throw new Error("Le modèle PV Vidéo est introuvable.");
  }
  const template = ensureCameraCountRow(repairCameraRowTemplate(buffer));
  const siteLabel = input.siteCode ? `${input.siteName} (${input.siteCode})` : input.siteName;
  const cameras = await Promise.all(
    input.form.cameras.map(async (camera, index) => {
      const photo = await toTemplateImage(camera.image, CAMERA_IMAGE_MAX_WIDTH, CAMERA_IMAGE_MAX_HEIGHT);
      return {
        numero_camera: safeDocxText(String(index + 1)),
        intitule_camera: safeDocxText(cameraLabelUpper(camera.title)),
        information_camera: cameraInformationExport(camera.information, photo != null),
        photo_camera: photo
      };
    })
  );
  let blob: Blob;
  try {
    blob = renderDocxtemplaterBlob(
      template,
      {
        site: safeDocxText(siteLabel),
        site_code: safeDocxText(input.siteCode),
        site_name: safeDocxText(input.siteName),
        adresse_site: safeDocxText(input.siteAddress),
        date_raccordement: safeDocxText(input.form.connectionDate),
        responsable_tls: safeDocxText(input.form.tlsResponsibleName),
        technicien: safeDocxText(input.form.technicianContact),
        code_transmetteur: safeDocxText(input.form.transmitterCode),
        methode_connexion: safeDocxText(connectionMethodExport(input.form)),
        enregistreur: safeDocxText(input.form.recorderModel),
        adresse_ip: safeDocxText(input.form.recorderIp),
        port: safeDocxText(input.form.recorderPort),
        login: safeDocxText(labeledValue("Login", input.form.login)),
        mot_de_passe: safeDocxText(labeledValue("Mot de passe", input.form.password)),
        nombre_cameras: String(input.form.cameras.length),
        cameras,
        capture_globale: await toTemplateImage(input.image, GLOBAL_IMAGE_MAX_WIDTH)
      },
      [createDocxImageModule()]
    );
  } catch (error) {
    console.warn("[PV Vidéo][Word]", error);
    throw new Error(templateErrorMessage(error));
  }
  const safeSite = input.siteName.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "site";
  return saveExportBlob(blob, `PV video ${safeSite}.docx`);
}
