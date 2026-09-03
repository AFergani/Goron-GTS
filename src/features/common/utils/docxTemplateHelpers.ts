/**
 * Helpers partagés pour exports Word (Docxtemplater) : texte sûr XML, chargement modèle, rendu.
 */

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** Retire les caractères invalides en XML 1.0. */
export function sanitizeXmlText(input: string): string {
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

/** Normalise les retours à la ligne (\r\n / \r → \n). */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Texte prêt pour Docxtemplater / docx : newlines normalisées, XML assaini, tiret si vide.
 */
export function safeDocxText(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const cleaned = sanitizeXmlText(normalizeNewlines(raw)).trim();
  return cleaned || "—";
}

/**
 * Charge un modèle installé (IPC) puis, optionnellement, un fallback web (`/templates/...`).
 */
export async function loadDocumentTemplateBuffer(options: {
  templateFileName: string;
  webFallbackUrl?: string;
}): Promise<ArrayBuffer | null> {
  try {
    const template = await gtsApiClient.getDocumentTemplate(options.templateFileName);
    if (template.found && template.dataBase64) {
      return uint8ArrayToArrayBuffer(base64ToUint8Array(template.dataBase64));
    }
  } catch {
    // Continuer vers le fallback web si fourni.
  }

  if (!options.webFallbackUrl) return null;

  try {
    const response = await fetch(options.webFallbackUrl);
    if (!response.ok) {
      throw new Error(`Template HTTP ${response.status}`);
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/** Rend un Buffer modèle Docxtemplater en Blob .docx. */
export function renderDocxtemplaterBlob(buffer: ArrayBuffer, data: Record<string, unknown>): Blob {
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });
  doc.render(data);
  return doc.getZip().generate({
    type: "blob",
    mimeType: DOCX_MIME
  }) as Blob;
}
