/**
 * Prépare une image collée ou choisie : JPEG réduit, transportable vers le processus principal.
 */

import type { PvVideoImage } from "./pvVideoForm";

type PrepareLimits = {
  maxEdge: number;
  maxBytes: number;
};

/** Capture globale de la fiche. */
export const GLOBAL_IMAGE_LIMITS: PrepareLimits = { maxEdge: 1400, maxBytes: 280 * 1024 };

/** Photo d'une ligne de caméra, plus légère que la capture globale. */
export const CAMERA_IMAGE_LIMITS: PrepareLimits = { maxEdge: 720, maxBytes: 70 * 1024 };

/**
 * Réduit un fichier image en JPEG.
 *
 * @param file - Fichier collé ou choisi.
 * @param limits - Taille max du bord et du fichier.
 * @returns Image prête à afficher et à enregistrer.
 */
export async function preparePvImageFile(file: File, limits: PrepareLimits): Promise<PvVideoImage> {
  const mime = file.type === "image/png" || file.type === "image/jpeg" ? file.type : "";
  if (!mime) throw new Error("Choisissez une image PNG ou JPEG.");
  const bitmap = await createImageBitmap(file);
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
  const ready = blob;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const marker = raw.indexOf(",");
      resolve(marker >= 0 ? raw.slice(marker + 1) : "");
    };
    reader.onerror = () => reject(new Error("Impossible de lire cette image."));
    reader.readAsDataURL(ready);
  });
  if (!base64) throw new Error("Impossible de lire cette image.");
  return { base64, mime: "image/jpeg", originalName: "capture.jpg" };
}
