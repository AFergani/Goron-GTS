/**
 * Prépare une image collée ou choisie : JPEG réduit, transportable vers le processus principal.
 *
 * Un JPEG déjà assez léger et assez petit est conservé tel quel. Les captures
 * de flux vidéo sans marqueur de fin reçoivent ce marqueur avant d'être gardées.
 */

import type { PvVideoImage } from "./pvVideoForm";

type PrepareLimits = {
  maxEdge: number;
  maxBytes: number;
};

type ImageMime = "image/png" | "image/jpeg";

/** Capture globale de la fiche. */
export const GLOBAL_IMAGE_LIMITS: PrepareLimits = { maxEdge: 1400, maxBytes: 280 * 1024 };

/** Photo d'une ligne de caméra, plus légère que la capture globale. */
export const CAMERA_IMAGE_LIMITS: PrepareLimits = { maxEdge: 720, maxBytes: 70 * 1024 };

/**
 * Ajoute le marqueur de fin manquant sur un JPEG de flux vidéo.
 *
 * @param bytes - Contenu du fichier.
 * @returns Les mêmes octets, ou une copie terminée par FF D9.
 */
function ensureJpegEnd(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  for (let index = bytes.length - 1; index > 1; index -= 1) {
    if (bytes[index - 1] === 0xff && bytes[index] === 0xd9) return bytes;
  }
  const fixed = new Uint8Array(bytes.length + 2);
  fixed.set(bytes);
  fixed[bytes.length] = 0xff;
  fixed[bytes.length + 1] = 0xd9;
  return fixed;
}

/**
 * Plus grand côté d'un JPEG, lu dans l'en-tête, sans décoder l'image.
 *
 * @param bytes - JPEG, éventuellement réparé.
 * @returns Côté le plus long en pixels, ou `null` si l'en-tête est absent.
 */
function jpegLongestEdge(bytes: Uint8Array): number | null {
  let index = 2;
  while (index + 8 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    if (marker === 0x00 || marker === 0xda) return null;
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[index + 5] << 8) | bytes[index + 6];
      const width = (bytes[index + 7] << 8) | bytes[index + 8];
      return Math.max(width, height);
    }
    if (length < 2) return null;
    index += 2 + length;
  }
  return null;
}

/**
 * Encode des octets en base64, sans préfixe data-URL.
 *
 * @param bytes - Contenu à transporter.
 */
function bytesToBase64(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy]);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const marker = raw.indexOf(",");
      const base64 = marker >= 0 ? raw.slice(marker + 1) : "";
      if (!base64) reject(new Error("Impossible de lire cette image."));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Impossible de lire cette image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Réduit un fichier image en JPEG, ou le garde tel quel s'il est déjà assez léger.
 *
 * @param file - Fichier collé ou choisi.
 * @param limits - Taille max du bord et du fichier.
 * @returns Image prête à afficher et à enregistrer.
 */
export async function preparePvImageFile(file: File, limits: PrepareLimits): Promise<PvVideoImage> {
  const mime: ImageMime | "" =
    file.type === "image/png" || file.type === "image/jpeg"
      ? file.type
      : /\.png$/i.test(file.name)
        ? "image/png"
        : /\.jpe?g$/i.test(file.name)
          ? "image/jpeg"
          : "";
  if (!mime) throw new Error("Choisissez une image PNG ou JPEG.");
  const raw = new Uint8Array(await file.arrayBuffer());
  const bytes = mime === "image/jpeg" ? ensureJpegEnd(raw) : raw;
  const edge = mime === "image/jpeg" ? jpegLongestEdge(bytes) : null;
  const sizeOk = bytes.byteLength <= limits.maxBytes;
  const edgeOk = mime === "image/png" || (edge != null && edge <= limits.maxEdge);
  if (sizeOk && edgeOk) {
    return {
      base64: await bytesToBase64(bytes),
      mime,
      originalName: mime === "image/png" ? "capture.png" : "capture.jpg"
    };
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const scale = Math.min(1, limits.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Impossible de lire cette image.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let quality = 0.82;
  let blob: Blob | null = null;
  while (quality >= 0.4) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= limits.maxBytes) break;
    quality -= 0.15;
  }
  if (!blob || blob.size > limits.maxBytes) {
    throw new Error("Cette capture reste trop lourde. Recadrez-la avant de la coller.");
  }
  return {
    base64: await bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    mime: "image/jpeg",
    originalName: "capture.jpg"
  };
}
