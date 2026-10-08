/**
 * Fichiers photo des PV vidéo, sous le dossier d'archivage partagé.
 *
 * La base ne garde qu'un chemin relatif. Lecture et écriture restent dans ce dossier.
 *
 * @module electron/store/domains/pvVideo/archiveFiles
 */

const fs = require("fs");
const path = require("path");

const MAX_IMAGE_BYTES = 400 * 1024;

const MIME_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg"
};

/**
 * Indique qu'un chemin résolu reste sous la racine d'archivage.
 *
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
function isInsideRoot(root, target) {
  const base = path.resolve(root);
  const abs = path.resolve(target);
  const rel = path.relative(base, abs);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Ancien segment de dossier, limité au code site. Sert encore à reconnaître les photos déjà écrites.
 *
 * @param {unknown} siteCode
 * @returns {string}
 */
function legacySiteFolderName(siteCode) {
  const clean = String(siteCode || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return clean || "site";
}

/**
 * Dossier lisible du site : « Nom (code) ». Le code reste entre parenthèses.
 *
 * @param {{ name?: unknown, code?: unknown }|null|undefined} site
 * @returns {string}
 */
function siteFolderName(site) {
  const code = String((site && site.code) || "").trim();
  const name = String((site && site.name) || "").trim();
  const label = name && code ? `${name} (${code})` : name || code;
  const clean = label
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120)
    .replace(/[. ]+$/g, "");
  return clean || "site";
}

/**
 * Décode une image collée ou choisie, et vérifie le type réel.
 *
 * @param {import("../../../userStore")} store
 * @param {{ mime?: unknown, base64?: unknown, originalName?: unknown }} image
 * @returns {{ mime: string, buffer: Buffer, originalName: string }}
 */
function decodeIncomingImage(store, image) {
  const mime = image && (image.mime === "image/png" || image.mime === "image/jpeg") ? image.mime : "";
  if (!mime) {
    store.fail("pvVideo:save", "La photo doit être un PNG ou un JPEG.", "PV_VIDEO_IMAGE_TYPE");
  }
  let b64 = String(image.base64 || "").trim();
  const marker = b64.indexOf(",");
  if (b64.startsWith("data:") && marker >= 0) b64 = b64.slice(marker + 1);
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    store.fail("pvVideo:save", "La photo est absente ou trop lourde pour être enregistrée.", "PV_VIDEO_IMAGE_SIZE");
  }
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if ((mime === "image/png" && !png) || (mime === "image/jpeg" && !jpeg)) {
    store.fail("pvVideo:save", "Le fichier choisi n'est pas une image PNG ou JPEG valide.", "PV_VIDEO_IMAGE_TYPE");
  }
  const originalName = String(image.originalName || "capture")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .slice(0, 120) || "capture";
  return { mime, buffer, originalName };
}

/**
 * Segment de nom de fichier : sans accent, espaces en underscores.
 *
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function fileSlug(value, fallback) {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 48);
  return clean || fallback;
}

/**
 * Prochain numéro `01`, `02`… pour un motif de fichier déjà présent.
 *
 * @param {string} dirAbs
 * @param {RegExp} pattern - Groupe 1 = numéro.
 * @returns {string}
 */
function nextPhotoIndex(dirAbs, pattern) {
  let max = 0;
  let names = [];
  try {
    names = fs.readdirSync(dirAbs);
  } catch {
    names = [];
  }
  for (const name of names) {
    const match = pattern.exec(name);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  }
  return String(max + 1).padStart(2, "0");
}

/**
 * Écrit une photo nommée et retourne le chemin relatif.
 * Caméra : `SITE-LIBELLE-01.jpg`. Vue globale : `SITE-01-camera.jpg`.
 * Le numéro augmente à chaque nouvelle saisie ; les fichiers précédents restent.
 *
 * @param {import("../../../userStore")} store
 * @param {string} root
 * @param {{ code?: unknown, name?: unknown }} site
 * @param {{ mime: string, buffer: Buffer }} image
 * @param {{ cameraLabel?: string }|null} kind - Libellé de caméra, ou null pour la vue globale.
 * @returns {string}
 */
function writeReportImage(store, root, site, image, kind) {
  const folder = String(root || "").trim();
  if (!folder) {
    store.fail(
      "pvVideo:save",
      "Choisissez d'abord le dossier partagé des photos (responsable).",
      "PV_VIDEO_ARCHIVE_REQUIRED"
    );
  }
  let stat;
  try {
    stat = fs.statSync(folder);
  } catch {
    store.fail("pvVideo:save", "Le dossier des photos est introuvable.", "PV_VIDEO_ARCHIVE_MISSING");
  }
  if (!stat.isDirectory()) {
    store.fail("pvVideo:save", "Le dossier des photos est introuvable.", "PV_VIDEO_ARCHIVE_MISSING");
  }
  const siteSlug = fileSlug(site && site.name, fileSlug(site && site.code, "SITE"));
  const ext = MIME_EXT[image.mime];
  const dirRel = `pv-video/${siteFolderName(site)}`;
  const dirAbs = path.resolve(folder, ...dirRel.split("/"));
  fs.mkdirSync(dirAbs, { recursive: true });
  const isCamera = kind != null;
  const labelSlug = fileSlug(kind && kind.cameraLabel, "CAMERA");
  const fileName = isCamera
    ? `${siteSlug}-${labelSlug}-${nextPhotoIndex(dirAbs, new RegExp(`^${siteSlug}-${labelSlug}-(\\d+)\\.(jpg|png)$`, "i"))}${ext}`
    : `${siteSlug}-${nextPhotoIndex(dirAbs, new RegExp(`^${siteSlug}-(\\d+)-camera\\.(jpg|png)$`, "i"))}-camera${ext}`;
  const rel = `${dirRel}/${fileName}`;
  const abs = path.resolve(folder, ...rel.split("/"));
  if (!isInsideRoot(folder, abs)) {
    store.fail("pvVideo:save", "Chemin de photo refusé.", "PV_VIDEO_IMAGE_PATH");
  }
  fs.writeFileSync(abs, image.buffer);
  return rel;
}

/**
 * Lit une photo déjà enregistrée. `null` si le fichier n'est plus là.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {string|null} Base64, ou null.
 */
function readReportImage(root, relpath) {
  const folder = String(root || "").trim();
  const rel = String(relpath || "").trim();
  if (!folder || !rel || rel.includes("..")) return null;
  const abs = path.resolve(folder, ...rel.split("/"));
  if (!isInsideRoot(folder, abs)) return null;
  try {
    return fs.readFileSync(abs).toString("base64");
  } catch {
    return null;
  }
}

/**
 * Supprime une photo précédente si elle est encore sous la racine.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {void}
 */
function deleteReportImage(root, relpath) {
  const folder = String(root || "").trim();
  const rel = String(relpath || "").trim();
  if (!folder || !rel || rel.includes("..")) return;
  const abs = path.resolve(folder, ...rel.split("/"));
  if (!isInsideRoot(folder, abs)) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    // Fichier déjà absent : la base fera foi après coup.
  }
}

const MAX_EXPORT_BACKUP_BYTES = 40 * 1024 * 1024;

/**
 * Copie le Word déjà enregistré dans le dossier du site, comme copie de secours.
 *
 * @param {import("../../../userStore")} store
 * @param {string} root - Dossier d'archivage partagé.
 * @param {{ code?: unknown, name?: unknown }} site
 * @param {string} sourcePath - Fichier .docx choisi par l'opérateur.
 * @returns {{ backedUp: boolean, reason: string }}
 */
function backupExportFile(store, root, site, sourcePath) {
  const folder = String(root || "").trim();
  if (!folder) return { backedUp: false, reason: "unconfigured" };
  const source = path.resolve(String(sourcePath || ""));
  if (!path.isAbsolute(source) || path.extname(source).toLowerCase() !== ".docx") {
    store.fail("pvVideo:exportBackup", "Le rapport à copier n'est pas un fichier Word.", "PV_VIDEO_EXPORT_BACKUP");
  }
  let stat;
  try {
    stat = fs.statSync(source);
  } catch {
    store.fail("pvVideo:exportBackup", "Le rapport Word est introuvable.", "PV_VIDEO_EXPORT_BACKUP");
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_EXPORT_BACKUP_BYTES) {
    store.fail("pvVideo:exportBackup", "Le rapport Word ne peut pas être copié.", "PV_VIDEO_EXPORT_BACKUP");
  }
  let rootStat;
  try {
    rootStat = fs.statSync(folder);
  } catch {
    return { backedUp: false, reason: "missing" };
  }
  if (!rootStat.isDirectory()) return { backedUp: false, reason: "missing" };
  const dirRel = `pv-video/${siteFolderName(site)}`;
  const dirAbs = path.resolve(folder, ...dirRel.split("/"));
  fs.mkdirSync(dirAbs, { recursive: true });
  const baseName = path.basename(source).replace(/[\\/:*?"<>|]+/g, " ").trim() || "PV video.docx";
  const dest = path.resolve(dirAbs, baseName);
  if (!isInsideRoot(folder, dest)) {
    store.fail("pvVideo:exportBackup", "Chemin de copie refusé.", "PV_VIDEO_EXPORT_BACKUP");
  }
  const sameFile = process.platform === "win32"
    ? source.toLowerCase() === dest.toLowerCase()
    : source === dest;
  if (sameFile) return { backedUp: true, reason: "" };
  try {
    fs.copyFileSync(source, dest);
  } catch {
    return { backedUp: false, reason: "write" };
  }
  return { backedUp: true, reason: "" };
}

module.exports = {
  decodeIncomingImage,
  writeReportImage,
  readReportImage,
  deleteReportImage,
  backupExportFile,
  siteFolderName,
  legacySiteFolderName
};
