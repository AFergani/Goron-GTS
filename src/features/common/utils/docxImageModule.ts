/**
 * Module Docxtemplater pour les jetons image `{%nom}`.
 *
 * Le jeton est remplacé par un dessin Word. Une valeur vide retire le jeton
 * sans casser le paragraphe. Utilisé par l'export PV Vidéo.
 */

import type PizZip from "pizzip";

/** Image déjà dimensionnée, prête à être déposée dans le .docx. */
export type DocxTemplateImage = {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  extension: "jpeg" | "png";
};

type ImagePart = {
  module?: string;
  value?: string;
};

type RenderOptions = {
  filePath?: string;
  scopeManager?: {
    getValue: (tag: string, meta: { part: ImagePart }) => unknown;
  };
};

type ContentTypesDom = {
  getElementsByTagName: (name: string) => ArrayLike<{ getAttribute: (name: string) => string | null }>;
  documentElement: { appendChild: (node: unknown) => void };
  createElement: (name: string) => { setAttribute: (name: string, value: string) => void };
};

const IMAGE_MODULE = "docx-image";
const EMU_PER_PX = 9525;

/**
 * Chemin du fichier de relations associé à une partie Word.
 *
 * @param filePath - Ex. `word/document.xml`.
 * @returns Ex. `word/_rels/document.xml.rels`.
 */
function relsPathFor(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  const dir = slash >= 0 ? filePath.slice(0, slash) : "";
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  return `${dir}/_rels/${base}.rels`;
}

/**
 * Dessin inline. Ferme le `<w:t>` courant pour rester du XML Word valide.
 *
 * @param relationId - Identifiant `rId` de l'image.
 * @param widthPx - Largeur affichée.
 * @param heightPx - Hauteur affichée.
 * @param docPrId - Identifiant unique du dessin dans le document.
 */
function inlineDrawingXml(relationId: string, widthPx: number, heightPx: number, docPrId: number): string {
  const cx = Math.max(1, widthPx) * EMU_PER_PX;
  const cy = Math.max(1, heightPx) * EMU_PER_PX;
  const name = `Image${docPrId}`;
  return (
    `</w:t></w:r><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relationId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t xml:space="preserve">`
  );
}

/**
 * Module neuf à passer à chaque rendu. Docxtemplater refuse de réutiliser une instance déjà attachée.
 *
 * @returns Module `{%jeton}` branché sur le zip du document en cours.
 */
export function createDocxImageModule() {
  let nextDocPrId = 100;
  return {
    name: "DocxImageModule",
    zip: null as PizZip | null,
    xmlDocuments: null as Record<string, ContentTypesDom> | null,
    matchers() {
      return [["%", IMAGE_MODULE]];
    },
    /**
     * @param part - Jeton en cours de rendu.
     * @param options - Portée Docxtemplater et fichier Word courant.
     * @returns XML du dessin, chaîne vide s'il n'y a pas d'image, ou `null` si le jeton n'est pas une image.
     */
    render(part: ImagePart, options: RenderOptions) {
      if (part.module !== IMAGE_MODULE) return null;
      const tag = String(part.value || "");
      let value: unknown = null;
      try {
        value = options.scopeManager?.getValue(tag, { part }) ?? null;
      } catch {
        return { value: "" };
      }
      if (!value || typeof value !== "object") return { value: "" };
      const image = value as Partial<DocxTemplateImage>;
      if (!image.bytes?.length || !image.widthPx || !image.heightPx) return { value: "" };
      const zip = this.zip;
      const filePath = String(options.filePath || "word/document.xml");
      if (!zip) return { value: "" };
      const relationId = addImageRelationship(zip, filePath, image.bytes, image.extension === "png" ? "png" : "jpeg");
      if (image.extension === "png") ensurePngContentType(this.xmlDocuments);
      nextDocPrId += 1;
      return { value: inlineDrawingXml(relationId, image.widthPx, image.heightPx, nextDocPrId) };
    }
  };
}

/**
 * Ajoute le fichier média et la relation, puis retourne le `rId`.
 *
 * @param zip - Archive du .docx en cours de rendu.
 * @param filePath - Partie Word qui porte le jeton.
 * @param bytes - Contenu de l'image.
 * @param extension - `jpeg` ou `png`.
 */
function addImageRelationship(zip: PizZip, filePath: string, bytes: Uint8Array, extension: "jpeg" | "png"): string {
  const relsPath = relsPathFor(filePath);
  const relsFile = zip.file(relsPath);
  const current = relsFile ? relsFile.asText() : "";
  const used = [...current.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const relationId = `rId${Math.max(0, ...used) + 1}`;
  const mediaName = `${relationId}.${extension}`;
  const mediaPath = filePath.startsWith("word/") ? `word/media/${mediaName}` : `media/${mediaName}`;
  zip.file(mediaPath, bytes);
  const relationship =
    `<Relationship Id="${relationId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="media/${mediaName}"/>`;
  const next = current.includes("</Relationships>")
    ? current.replace("</Relationships>", `${relationship}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship}</Relationships>`;
  zip.file(relsPath, next);
  return relationId;
}

/**
 * Déclare le type PNG si le modèle ne contient encore que du JPEG.
 *
 * @param xmlDocuments - DOM suivis par Docxtemplater, réécrits à la fin du rendu.
 */
function ensurePngContentType(xmlDocuments: Record<string, ContentTypesDom> | null) {
  const contentTypes = xmlDocuments?.["[Content_Types].xml"];
  if (!contentTypes) return;
  const defaults = contentTypes.getElementsByTagName("Default");
  for (let index = 0; index < defaults.length; index += 1) {
    if (defaults[index]?.getAttribute("Extension") === "png") return;
  }
  const node = contentTypes.createElement("Default");
  node.setAttribute("Extension", "png");
  node.setAttribute("ContentType", "image/png");
  contentTypes.documentElement.appendChild(node);
}
