/**
 * Fichiers photo des PV vidéo, sous le dossier d'archivage partagé.
 *
 * La base ne garde qu'un chemin relatif. À l'enregistrement, le fichier porte le nom
 * de la caméra actuelle et remplace l'ancien du même nom.
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
 * Segment de site utilisé dans le nom de fichier.
 *
 * @param {{ code?: unknown, name?: unknown }|null|undefined} site
 * @returns {string}
 */
function siteSlug(site) {
  return fileSlug(site && site.name, fileSlug(site && site.code, "SITE"));
}

/**
 * Clé de libellé caméra, identique au segment du nom de fichier.
 *
 * @param {string} cameraLabel
 * @returns {string}
 */
function cameraLabelKey(cameraLabel) {
  return fileSlug(cameraLabel, "CAMERA");
}

/**
 * Chemin relatif d'une photo de caméra : `SITE-LIBELLE-01.jpg`.
 * L'index distingue deux lignes qui portent le même libellé.
 *
 * @param {{ code?: unknown, name?: unknown }} site
 * @param {string} cameraLabel
 * @param {number} index - Rang du libellé dans la fiche, à partir de 1.
 * @param {string} mime
 * @returns {string}
 */
function cameraPhotoRel(site, cameraLabel, index, mime) {
  const ext = MIME_EXT[mime] || "";
  if (!ext) return "";
  const rank = String(Math.max(1, index)).padStart(2, "0");
  const fileName = `${siteSlug(site)}-${cameraLabelKey(cameraLabel)}-${rank}${ext}`;
  return `pv-video/${siteFolderName(site)}/${fileName}`;
}

/**
 * Chemin relatif de la vue globale : un seul fichier `SITE-01-camera.jpg`.
 *
 * @param {{ code?: unknown, name?: unknown }} site
 * @param {string} mime
 * @returns {string}
 */
function globalPhotoRel(site, mime) {
  const ext = MIME_EXT[mime] || "";
  if (!ext) return "";
  return `pv-video/${siteFolderName(site)}/${siteSlug(site)}-01-camera${ext}`;
}

/**
 * Chemin absolu d'un fichier sous la racine d'archivage, ou null si le chemin est refusé.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {string|null}
 */
function resolveArchiveFile(root, relpath) {
  const folder = String(root || "").trim();
  const rel = String(relpath || "").trim();
  if (!folder || !rel || rel.includes("..")) return null;
  const abs = path.resolve(folder, ...rel.split("/"));
  if (!isInsideRoot(folder, abs)) return null;
  return abs;
}

/**
 * Lit les octets d'une photo. `null` si le fichier est absent.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {Buffer|null}
 */
function readReportImageBuffer(root, relpath) {
  const abs = resolveArchiveFile(root, relpath);
  if (!abs) return null;
  try {
    return fs.readFileSync(abs);
  } catch {
    return null;
  }
}

/**
 * Écrase une photo à un chemin déjà choisi. Le dossier du site est créé si besoin.
 *
 * @param {import("../../../userStore")} store
 * @param {string} root
 * @param {string} relpath
 * @param {Buffer} buffer
 * @returns {void}
 */
function writeReportImageAt(store, root, relpath, buffer) {
  const folder = String(root || "").trim();
  const rel = String(relpath || "").trim();
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
  const abs = resolveArchiveFile(folder, rel);
  if (!abs) {
    store.fail("pvVideo:save", "Chemin de photo refusé.", "PV_VIDEO_IMAGE_PATH");
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
}

/**
 * Remet les fichiers comme avant un enregistrement interrompu.
 *
 * @param {string} root
 * @param {{ rel: string, previous: Buffer|null }[]} backups - `previous` null si le fichier n'existait pas.
 * @returns {void}
 */
function restoreReportImages(root, backups) {
  const folder = String(root || "").trim();
  if (!folder) return;
  for (const item of backups) {
    const abs = resolveArchiveFile(folder, item && item.rel);
    if (!abs) continue;
    if (item.previous) {
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, item.previous);
      } catch {
        // Le repli a échoué : la base n'a pas été mise à jour, le fichier peut être à reprendre.
      }
      continue;
    }
    try {
      fs.unlinkSync(abs);
    } catch {
      // Déjà absent.
    }
  }
}

/**
 * Lit une photo déjà enregistrée. `null` si le fichier n'est plus là.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {string|null} Base64, ou null.
 */
function readReportImage(root, relpath) {
  const buffer = readReportImageBuffer(root, relpath);
  return buffer ? buffer.toString("base64") : null;
}

/**
 * Supprime une photo précédente si elle est encore sous la racine.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {void}
 */
function deleteReportImage(root, relpath) {
  const abs = resolveArchiveFile(root, relpath);
  if (!abs) return;
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

/**
 * Indique qu'une photo relative existe encore sous la racine d'archivage.
 *
 * @param {string} root
 * @param {string} relpath
 * @returns {boolean}
 */
function reportImageExists(root, relpath) {
  const abs = resolveArchiveFile(root, relpath);
  if (!abs) return false;
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Indique qu'un chemin de photo appartient au dossier du site, y compris l'ancien dossier par code seul.
 *
 * @param {{ name?: unknown, code?: unknown }} site
 * @param {string} relpath
 * @returns {boolean}
 */
function isSitePhotoRel(site, relpath) {
  if (!relpath || String(relpath).includes("..")) return false;
  const prefixes = [
    `pv-video/${siteFolderName(site)}/`,
    `pv-video/${legacySiteFolderName(site && site.code)}/`
  ];
  return prefixes.some((prefix) => String(relpath).startsWith(prefix));
}

/**
 * Octets d'une photo de caméra déjà en fiche, ou null si le fichier n'est plus là.
 *
 * @param {string} archiveFolder
 * @param {{ name?: unknown, code?: unknown }} site
 * @param {{ imageRelpath?: string, imageMime?: string, imageOriginalName?: string }} camera
 * @returns {{ mime: string, buffer: Buffer, originalName: string }|null}
 */
function storedCameraImage(archiveFolder, site, camera) {
  const rel = String(camera.imageRelpath || "");
  if (!isSitePhotoRel(site, rel) || !reportImageExists(archiveFolder, rel)) return null;
  const buffer = readReportImageBuffer(archiveFolder, rel);
  const mime = camera.imageMime === "image/png" || camera.imageMime === "image/jpeg" ? camera.imageMime : "";
  if (!buffer || !mime) return null;
  return {
    mime,
    buffer,
    originalName: String(camera.imageOriginalName || "capture.jpg")
  };
}

/**
 * Écrit une photo en gardant l'ancien contenu pour pouvoir revenir en arrière.
 *
 * @param {import("../../../userStore")} store
 * @param {string} archiveFolder
 * @param {string} rel
 * @param {Buffer} buffer
 * @param {{ rel: string, previous: Buffer|null }[]} backups
 * @returns {void}
 */
function placePhoto(store, archiveFolder, rel, buffer, backups) {
  backups.push({ rel, previous: readReportImageBuffer(archiveFolder, rel) });
  writeReportImageAt(store, archiveFolder, rel, buffer);
}

/**
 * Aligne les fichiers sur la fiche : chaque photo porte le nom de sa caméra actuelle.
 * Deux lignes au même libellé prennent 01 puis 02. L'ancien fichier du même nom est écrasé.
 * Les octets sont lus avant toute écriture, pour qu'un échange ne perde pas une image.
 *
 * @param {import("../../../userStore")} store
 * @param {string} archiveFolder
 * @param {{ name?: unknown, code?: unknown }} site
 * @param {object[]} cameras
 * @param {{ clear: boolean, next: { mime: string, buffer: Buffer, originalName: string }|null, keptRel: string, keptMime: string, keptName: string }} globalImage
 * @returns {{ cameras: object[], imageRel: string, imageMime: string, imageName: string, backups: { rel: string, previous: Buffer|null }[] }}
 */
function placeFichePhotos(store, archiveFolder, site, cameras, globalImage) {
  /** @type {{ rel: string, previous: Buffer|null }[]} */
  const backups = [];
  const labelCount = new Map();
  const planned = cameras.map((camera) => {
    const fresh = camera.image ? decodeIncomingImage(store, camera.image) : null;
    const source = fresh || storedCameraImage(archiveFolder, site, camera);
    if (!source) {
      return { camera, source: null, rel: "", fresh: false };
    }
    const labelKey = cameraLabelKey(camera.title);
    const rank = (labelCount.get(labelKey) || 0) + 1;
    labelCount.set(labelKey, rank);
    const rel = cameraPhotoRel(site, camera.title, rank, source.mime);
    if (!rel) {
      store.fail("pvVideo:save", "La photo doit être un PNG ou un JPEG.", "PV_VIDEO_IMAGE_TYPE");
    }
    return { camera, source, rel, fresh: Boolean(fresh) };
  });
  let pendingGlobal = null;
  if (!globalImage.clear && globalImage.next) {
    pendingGlobal = {
      rel: globalPhotoRel(site, globalImage.next.mime),
      mime: globalImage.next.mime,
      name: globalImage.next.originalName,
      buffer: globalImage.next.buffer
    };
  } else if (!globalImage.clear && globalImage.keptRel && reportImageExists(archiveFolder, globalImage.keptRel)) {
    const mime = globalImage.keptMime === "image/png" || globalImage.keptMime === "image/jpeg"
      ? globalImage.keptMime
      : "image/jpeg";
    const canonical = globalPhotoRel(site, mime);
    const sameFile = canonical === globalImage.keptRel;
    const moved = sameFile ? null : readReportImageBuffer(archiveFolder, globalImage.keptRel);
    pendingGlobal = {
      rel: moved && canonical ? canonical : globalImage.keptRel,
      mime,
      name: globalImage.keptName || "capture.jpg",
      buffer: moved
    };
  }
  const storedCameras = planned.map((item) => {
    if (!item.source) {
      return {
        number: item.camera.number,
        title: item.camera.title,
        information: item.camera.information,
        imageRelpath: "",
        imageMime: "",
        imageOriginalName: ""
      };
    }
    const sameFile = !item.fresh && item.rel === String(item.camera.imageRelpath || "");
    if (!sameFile) placePhoto(store, archiveFolder, item.rel, item.source.buffer, backups);
    return {
      number: item.camera.number,
      title: item.camera.title,
      information: item.camera.information,
      imageRelpath: item.rel,
      imageMime: item.source.mime,
      imageOriginalName: item.source.originalName
    };
  });
  let imageRel = "";
  let imageMime = "";
  let imageName = "";
  if (pendingGlobal && pendingGlobal.rel) {
    if (pendingGlobal.buffer) placePhoto(store, archiveFolder, pendingGlobal.rel, pendingGlobal.buffer, backups);
    imageRel = pendingGlobal.rel;
    imageMime = pendingGlobal.mime;
    imageName = pendingGlobal.name;
  }
  return { cameras: storedCameras, imageRel, imageMime, imageName, backups };
}

/**
 * Chemins de photos encore cités par la fiche précédente.
 *
 * @param {object|undefined} existing
 * @returns {string[]}
 */
function previousPhotoRels(existing) {
  if (!existing) return [];
  const rels = [];
  const globalRel = String(existing.image_relpath || "");
  if (globalRel) rels.push(globalRel);
  try {
    const parsed = JSON.parse(String(existing.cameras_json || "[]"));
    if (Array.isArray(parsed)) {
      for (const camera of parsed) {
        const rel = String(camera && camera.imageRelpath || "");
        if (rel) rels.push(rel);
      }
    }
  } catch {
    // JSON illisible : seuls les nouveaux fichiers seront écrits.
  }
  return rels;
}

module.exports = {
  decodeIncomingImage,
  restoreReportImages,
  placeFichePhotos,
  previousPhotoRels,
  readReportImage,
  deleteReportImage,
  isSitePhotoRel,
  backupExportFile,
  isInsideRoot,
  siteFolderName
};
