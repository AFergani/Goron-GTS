/**
 * Instantanés JSON d'une fiche PV, dans le dossier des photos du site.
 *
 * Chaque enregistrement ajoute un fichier daté. Les photos ne sont pas recopiées :
 * le JSON ne garde que leurs chemins relatifs. Login et mot de passe restent chiffrés.
 *
 * @module electron/store/domains/pvVideo/snapshots
 */

const fs = require("fs");
const path = require("path");
const { decryptField } = require("../../core/fieldCipher");
const { requireDataPersistence } = require("../data/persistence");
const { isInsideRoot, readReportImage, siteFolderName } = require("./archiveFiles");

/**
 * Accès aux helpers de fiche, chargé à l'appel pour éviter un cycle au démarrage.
 *
 * @returns {object}
 */
function reportHelpers() {
  return require("./reports");
}

const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const FILE_PATTERN = /^v(\d+)-(\d{8}T\d{6}Z)\.json$/i;

/**
 * Dossier `snapshots` du site, sous la racine d'archivage.
 *
 * @param {string} root
 * @param {{ name?: unknown, code?: unknown }} site
 * @returns {string|null} Chemin absolu, ou null si la racine est inutilisable.
 */
function snapshotDirectory(root, site) {
  const folder = String(root || "").trim();
  if (!folder) return null;
  const abs = path.resolve(folder, "pv-video", siteFolderName(site), "snapshots");
  if (!isInsideRoot(folder, abs)) return null;
  return abs;
}

/**
 * Horodatage de fichier, sans caractères interdits par Windows.
 *
 * @param {string} iso
 * @returns {string}
 */
function fileStamp(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!match) return "date";
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`;
}

/**
 * Plus grand numéro de version déjà présent dans le dossier.
 *
 * @param {string} dirAbs
 * @returns {number}
 */
function highestVersion(dirAbs) {
  let names = [];
  try {
    names = fs.readdirSync(dirAbs);
  } catch {
    return 0;
  }
  let max = 0;
  for (const name of names) {
    const match = FILE_PATTERN.exec(name);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  }
  return max;
}

/**
 * Écrit l'instantané de la fiche qui vient d'être enregistrée.
 *
 * @param {string} root - Dossier d'archivage partagé.
 * @param {{ name?: unknown, code?: unknown }} site
 * @param {object} snapshot - Champs métier et secrets déjà chiffrés.
 * @returns {boolean} Faux si le dossier est absent ou l'écriture échoue.
 */
function writeReportSnapshot(root, site, snapshot) {
  const dirAbs = snapshotDirectory(root, site);
  if (!dirAbs) return false;
  try {
    fs.mkdirSync(dirAbs, { recursive: true });
  } catch {
    return false;
  }
  const savedAt = String(snapshot.savedAt || "");
  const version = highestVersion(dirAbs) + 1;
  const fileName = `v${String(version).padStart(3, "0")}-${fileStamp(savedAt)}.json`;
  const target = path.resolve(dirAbs, fileName);
  if (!isInsideRoot(root, target)) return false;
  const body = {
    version,
    savedAt,
    savedBy: String(snapshot.savedBy || ""),
    connectionDate: String(snapshot.connectionDate || ""),
    tlsResponsibleName: String(snapshot.tlsResponsibleName || ""),
    technicianContact: String(snapshot.technicianContact || ""),
    transmitterCode: String(snapshot.transmitterCode || ""),
    connectionMethod: String(snapshot.connectionMethod || ""),
    vpnEnabled: snapshot.vpnEnabled === true || snapshot.vpnEnabled === 1,
    vpnName: String(snapshot.vpnName || ""),
    recorderModel: String(snapshot.recorderModel || ""),
    recorderIp: String(snapshot.recorderIp || ""),
    recorderPort: String(snapshot.recorderPort || ""),
    loginCipher: String(snapshot.loginCipher || ""),
    passwordCipher: String(snapshot.passwordCipher || ""),
    cameras: Array.isArray(snapshot.cameras) ? snapshot.cameras : [],
    imageRelpath: String(snapshot.imageRelpath || ""),
    imageMime: String(snapshot.imageMime || ""),
    imageOriginalName: String(snapshot.imageOriginalName || "")
  };
  try {
    fs.writeFileSync(target, JSON.stringify(body, null, 2), "utf8");
  } catch {
    return false;
  }
  return true;
}

/**
 * Lit un JSON d'instantané s'il reste dans le dossier du site.
 *
 * @param {string} dirAbs
 * @param {string} fileName
 * @returns {object|null}
 */
function readSnapshotFile(dirAbs, fileName) {
  if (!FILE_PATTERN.test(fileName)) return null;
  const abs = path.resolve(dirAbs, fileName);
  if (!isInsideRoot(dirAbs, abs)) return null;
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SNAPSHOT_BYTES) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Liste les versions du site, de la plus récente à la plus ancienne.
 *
 * @param {string} root
 * @param {{ name?: unknown, code?: unknown }} site
 * @returns {{ version: number, savedAt: string, savedBy: string }[]}
 */
function listReportSnapshots(root, site) {
  const dirAbs = snapshotDirectory(root, site);
  if (!dirAbs) return [];
  let names = [];
  try {
    names = fs.readdirSync(dirAbs);
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    const parsed = readSnapshotFile(dirAbs, name);
    if (!parsed) continue;
    const version = Number(parsed.version);
    const savedAt = String(parsed.savedAt || "");
    if (!Number.isInteger(version) || version < 1 || !savedAt) continue;
    rows.push({ version, savedAt, savedBy: String(parsed.savedBy || "") });
  }
  rows.sort((left, right) => right.version - left.version || right.savedAt.localeCompare(left.savedAt));
  return rows;
}

/**
 * Retrouve l'instantané demandé par sa date d'enregistrement.
 *
 * @param {string} root
 * @param {{ name?: unknown, code?: unknown }} site
 * @param {string} savedAt
 * @returns {object|null}
 */
function findReportSnapshot(root, site, savedAt) {
  const wanted = String(savedAt || "").trim();
  if (!wanted) return null;
  const dirAbs = snapshotDirectory(root, site);
  if (!dirAbs) return null;
  let names = [];
  try {
    names = fs.readdirSync(dirAbs);
  } catch {
    return null;
  }
  for (const name of names) {
    const parsed = readSnapshotFile(dirAbs, name);
    if (parsed && String(parsed.savedAt || "") === wanted) return parsed;
  }
  return null;
}

/**
 * Reconstruit une fiche depuis un instantané, secrets déchiffrés pour l'écran.
 *
 * @param {import("../../../userStore")} store
 * @param {object} snapshot
 * @returns {object}
 */
function formFromSnapshot(store, snapshot) {
  let login = "";
  let password = "";
  try {
    login = decryptField(snapshot.loginCipher);
    password = decryptField(snapshot.passwordCipher);
  } catch {
    store.fail(
      "pvVideo:snapshot",
      "Les identifiants de cette version sont illisibles. Vérifiez le mot de passe technique de la base.",
      "PV_VIDEO_DECRYPT_FAILED"
    );
  }
  const cameras = Array.isArray(snapshot.cameras) ? snapshot.cameras : [];
  return {
    connectionDate: String(snapshot.connectionDate || ""),
    tlsResponsibleName: String(snapshot.tlsResponsibleName || ""),
    technicianContact: String(snapshot.technicianContact || ""),
    transmitterCode: String(snapshot.transmitterCode || ""),
    connectionMethod: String(snapshot.connectionMethod || ""),
    vpnEnabled: snapshot.vpnEnabled === true || snapshot.vpnEnabled === 1,
    vpnName: String(snapshot.vpnName || ""),
    recorderModel: String(snapshot.recorderModel || ""),
    recorderIp: String(snapshot.recorderIp || ""),
    recorderPort: String(snapshot.recorderPort || ""),
    login,
    password,
    cameras
  };
}

/**
 * Liste les versions JSON du site, sans chemins de fichiers.
 *
 * @param {import("../../../userStore")} store
 * @param {{ requesterRole: string, requesterManagerProfile?: string|null, siteId?: string }} payload
 * @returns {Promise<{ snapshots: { version: number, savedAt: string, savedBy: string }[] }>}
 */
async function listPvVideoSnapshots(store, payload) {
  const { requesterRole, requesterManagerProfile, siteId } = payload;
  const { readArchiveFolder, assertPvVideoAccess } = reportHelpers();
  assertPvVideoAccess(store, requesterRole, requesterManagerProfile);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) return { snapshots: [] };
  const db = requireDataPersistence(store, "pvVideo:snapshots");
  const archiveFolder = await readArchiveFolder(db);
  if (!archiveFolder) return { snapshots: [] };
  const site = await db.get(`SELECT code, name FROM data_sites WHERE id = ?`, [cleanSiteId]);
  if (!site) return { snapshots: [] };
  return { snapshots: listReportSnapshots(archiveFolder, site) };
}

/**
 * Charge une version dans la forme attendue par l'écran. N'écrit pas en base.
 *
 * @param {import("../../../userStore")} store
 * @param {{ requesterRole: string, requesterManagerProfile?: string|null, siteId?: string, savedAt?: string }} payload
 * @returns {Promise<{ version: number, savedAt: string, form: object, image: object|null }>}
 */
async function loadPvVideoSnapshot(store, payload) {
  const { requesterRole, requesterManagerProfile, siteId, savedAt } = payload;
  const { readArchiveFolder, hydrateCameraImages, isSitePhotoRel, assertPvVideoAccess } = reportHelpers();
  assertPvVideoAccess(store, requesterRole, requesterManagerProfile);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) {
    store.fail("pvVideo:snapshot", "Choisissez un site avant de recharger une version.", "PV_VIDEO_SITE_REQUIRED");
  }
  const db = requireDataPersistence(store, "pvVideo:snapshot");
  const archiveFolder = await readArchiveFolder(db);
  if (!archiveFolder) {
    store.fail("pvVideo:snapshot", "Le dossier des photos n'est pas défini.", "PV_VIDEO_ARCHIVE_REQUIRED");
  }
  const site = await db.get(`SELECT code, name FROM data_sites WHERE id = ?`, [cleanSiteId]);
  if (!site) {
    store.fail("pvVideo:snapshot", "Choisissez un site du référentiel.", "PV_VIDEO_SITE_REQUIRED");
  }
  const snapshot = findReportSnapshot(archiveFolder, site, savedAt);
  if (!snapshot) {
    store.fail("pvVideo:snapshot", "Cette version est introuvable dans le dossier des photos.", "PV_VIDEO_SNAPSHOT_MISSING");
  }
  const form = formFromSnapshot(store, snapshot);
  form.cameras = hydrateCameraImages(
    form.cameras.map((camera) => (
      isSitePhotoRel(site, camera.imageRelpath) ? camera : { ...camera, imageRelpath: "" }
    )),
    archiveFolder
  );
  const mime = snapshot.imageMime === "image/png" || snapshot.imageMime === "image/jpeg" ? snapshot.imageMime : "";
  const rel = isSitePhotoRel(site, snapshot.imageRelpath) ? String(snapshot.imageRelpath) : "";
  const base64 = mime && rel ? readReportImage(archiveFolder, rel) : null;
  const image = base64
    ? {
        base64,
        mime,
        originalName: String(snapshot.imageOriginalName || "capture.jpg"),
        storedRelpath: rel
      }
    : null;
  return {
    version: Number(snapshot.version) || 0,
    savedAt: String(snapshot.savedAt || ""),
    form,
    image
  };
}

module.exports = {
  writeReportSnapshot,
  listReportSnapshots,
  findReportSnapshot,
  listPvVideoSnapshots,
  loadPvVideoSnapshot
};
