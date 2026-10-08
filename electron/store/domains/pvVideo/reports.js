/**
 * Fiche PV vidéo : une ligne par site du référentiel.
 *
 * Login et mot de passe sont chiffrés en base et renvoyés en clair aux profils
 * autorisés (écran et export). La photo reste un fichier du dossier d'archivage.
 *
 * @module electron/store/domains/pvVideo/reports
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { encryptField, decryptField } = require("../../core/fieldCipher");
const { requireDataPersistence } = require("../data/persistence");
const { normalizePageAccess } = require("../users/userMapping");
const {
  decodeIncomingImage,
  writeReportImage,
  readReportImage,
  deleteReportImage,
  siteFolderName,
  legacySiteFolderName,
  backupExportFile
} = require("./archiveFiles");

const ARCHIVE_ROW_ID = "default";
const MAX_CAMERAS = 80;
const MAX_TEXT = 500;

/**
 * Refuse l'accès si le profil n'a pas la page PV Vidéo.
 *
 * @param {import("../../../userStore")} store
 * @param {string} requesterRole
 * @param {string|null|undefined} requesterManagerProfile
 */
function assertPvVideoAccess(store, requesterRole, requesterManagerProfile) {
  store.ensureDataReaderRole(requesterRole);
  const access = normalizePageAccess(null, requesterRole, requesterManagerProfile);
  if (!access.pvVideo) {
    store.fail("pvVideo:forbidden", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN");
  }
}

/**
 * Le choix du dossier partagé est réservé aux responsables et à l'admin.
 *
 * @param {import("../../../userStore")} store
 * @param {string} requesterRole
 */
function assertCanSetArchive(store, requesterRole) {
  if (requesterRole !== "DEV" && requesterRole !== "RESPONSABLE") {
    store.fail("pvVideo:archive", "Seul un responsable peut choisir le dossier des photos.", "AUTH_FORBIDDEN");
  }
}

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function clip(value, max = MAX_TEXT) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Normalise les champs saisis. Les secrets restent en clair le temps du chiffrement.
 *
 * @param {import("../../../userStore")} store
 * @param {object} form
 * @returns {object}
 */
function normalizeForm(store, form) {
  if (!form || typeof form !== "object" || Array.isArray(form)) {
    store.fail("pvVideo:save", "Fiche PV invalide.", "PV_VIDEO_PAYLOAD_INVALID");
  }
  const connectionDate = clip(form.connectionDate, 10);
  if (connectionDate && !/^\d{4}-\d{2}-\d{2}$/.test(connectionDate)) {
    store.fail("pvVideo:save", "La date de raccordement est invalide.", "PV_VIDEO_DATE_INVALID");
  }
  const camerasIn = Array.isArray(form.cameras) ? form.cameras : [];
  if (camerasIn.length > MAX_CAMERAS) {
    store.fail("pvVideo:save", "La liste des caméras est trop longue.", "PV_VIDEO_CAMERAS_LIMIT");
  }
  const cameras = camerasIn.map((row, index) => {
    const incoming = row && row.image && typeof row.image === "object" ? row.image : null;
    const storedRelpath = clip(incoming && incoming.storedRelpath, 240);
    const fresh = incoming && incoming.base64 && !storedRelpath ? incoming : null;
    return {
      number: String(index + 1),
      title: clip(row && row.title, 200).toLocaleUpperCase("fr-FR"),
      information: clip(row && row.information, 500).toLocaleUpperCase("fr-FR"),
      image: fresh,
      imageRelpath: fresh ? "" : storedRelpath
    };
  });
  return {
    connectionDate,
    tlsResponsibleName: clip(form.tlsResponsibleName),
    technicianContact: clip(form.technicianContact),
    transmitterCode: clip(form.transmitterCode, 80),
    connectionMethod: clip(form.connectionMethod),
    recorderModel: clip(form.recorderModel),
    recorderIp: clip(form.recorderIp, 80),
    recorderPort: clip(form.recorderPort, 20),
    login: clip(form.login, 200),
    password: String(form.password ?? "").slice(0, 200),
    cameras
  };
}

/**
 * Résumé d'audit sans login, mot de passe, ni identifiant technique.
 *
 * @param {{ code?: unknown, name?: unknown }} site
 * @param {object} form
 * @param {boolean} hasImage
 * @returns {object}
 */
function toAuditSnapshot(site, form, hasImage) {
  return {
    siteCode: String(site.code || ""),
    siteName: String(site.name || ""),
    connectionDate: form.connectionDate,
    tlsResponsibleName: form.tlsResponsibleName,
    technicianContact: form.technicianContact,
    transmitterCode: form.transmitterCode,
    connectionMethod: form.connectionMethod,
    recorderModel: form.recorderModel,
    recorderIp: form.recorderIp,
    recorderPort: form.recorderPort,
    hasLogin: Boolean(form.login),
    hasPassword: Boolean(form.password),
    cameraCount: form.cameras.length,
    cameraImageCount: form.cameras.filter((camera) => camera.image || camera.imageRelpath).length,
    hasImage
  };
}

/**
 * @param {import("../../../userStore")} store
 * @param {object} row
 * @returns {object}
 */
function formFromRow(store, row) {
  let cameras = [];
  try {
    const parsed = JSON.parse(String(row.cameras_json || "[]"));
    cameras = Array.isArray(parsed) ? parsed : [];
  } catch {
    cameras = [];
  }
  let login = "";
  let password = "";
  try {
    login = decryptField(row.login_cipher);
    password = decryptField(row.password_cipher);
  } catch {
    store.fail(
      "pvVideo:get",
      "Les identifiants de connexion sont illisibles. Vérifiez le mot de passe technique de la base.",
      "PV_VIDEO_DECRYPT_FAILED"
    );
  }
  return {
    connectionDate: String(row.connection_date || ""),
    tlsResponsibleName: String(row.tls_responsible_name || ""),
    technicianContact: String(row.technician_contact || ""),
    transmitterCode: String(row.transmitter_code || ""),
    connectionMethod: String(row.connection_method || ""),
    recorderModel: String(row.recorder_model || ""),
    recorderIp: String(row.recorder_ip || ""),
    recorderPort: String(row.recorder_port || ""),
    login,
    password,
    cameras
  };
}

/**
 * @param {object} db
 * @returns {Promise<string>}
 */
async function readArchiveFolder(db) {
  const row = await db.get(`SELECT folder_path FROM pv_video_archive WHERE id = ?`, [ARCHIVE_ROW_ID]);
  return row ? String(row.folder_path || "").trim() : "";
}

/**
 * Relie chaque caméra à sa photo sur disque. Le chemin n'est pas un libellé d'écran.
 *
 * @param {object[]} cameras
 * @param {string} archiveFolder
 * @returns {object[]}
 */
function hydrateCameraImages(cameras, archiveFolder) {
  return cameras.map((camera) => {
    const rel = String(camera.imageRelpath || "");
    const mime = camera.imageMime === "image/png" || camera.imageMime === "image/jpeg" ? camera.imageMime : "";
    const base64 = mime && rel ? readReportImage(archiveFolder, rel) : null;
    return {
      number: String(camera.number || ""),
      title: String(camera.title || ""),
      information: String(camera.information || ""),
      image: base64
        ? {
            base64,
            mime,
            originalName: String(camera.imageOriginalName || "capture.jpg"),
            storedRelpath: rel
          }
        : null
    };
  });
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
 * Relit la fiche d'un site, ou seulement l'état du dossier si aucun site n'est choisi.
 *
 * @param {import("../../../userStore")} store
 * @param {{ requesterRole: string, requesterManagerProfile?: string|null, siteId?: string }} payload
 * @returns {Promise<object>}
 */
async function getPvVideoReport(store, { requesterRole, requesterManagerProfile, siteId }) {
  assertPvVideoAccess(store, requesterRole, requesterManagerProfile);
  const db = requireDataPersistence(store, "pvVideo:get");
  const archiveFolder = await readArchiveFolder(db);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) {
    return { updatedAt: null, archiveConfigured: Boolean(archiveFolder), form: null, image: null };
  }
  const row = await db.get(`SELECT * FROM pv_video_reports WHERE site_id = ?`, [cleanSiteId]);
  if (!row) {
    return { updatedAt: null, archiveConfigured: Boolean(archiveFolder), form: null, image: null };
  }
  const form = formFromRow(store, row);
  form.cameras = hydrateCameraImages(form.cameras, archiveFolder);
  const mime = String(row.image_mime || "");
  const base64 = readReportImage(archiveFolder, row.image_relpath);
  const image = base64 && (mime === "image/png" || mime === "image/jpeg")
    ? { base64, mime, originalName: String(row.image_original_name || "photo") }
    : null;
  return {
    updatedAt: String(row.updated_at || ""),
    archiveConfigured: Boolean(archiveFolder),
    form,
    image
  };
}

/**
 * Crée ou remplace la fiche du site. Les identifiants partent chiffrés.
 *
 * @param {import("../../../userStore")} store
 * @param {object} payload
 * @returns {Promise<{ updatedAt: string }>}
 */
async function savePvVideoReport(store, payload) {
  const { requesterRole, requesterUsername, requesterManagerProfile, siteId, expectedUpdatedAt } = payload;
  assertPvVideoAccess(store, requesterRole, requesterManagerProfile);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) {
    store.fail("pvVideo:save", "Choisissez un site avant d'enregistrer.", "PV_VIDEO_SITE_REQUIRED");
  }
  const form = normalizeForm(store, payload.form);
  const imageChanged = Boolean(payload.imageChanged);
  const expected = expectedUpdatedAt ? String(expectedUpdatedAt) : null;
  const db = requireDataPersistence(store, "pvVideo:save");
  const archiveFolder = await readArchiveFolder(db);
  let nextImage = null;
  if (imageChanged && payload.image) {
    const decoded = decodeIncomingImage(store, payload.image);
    nextImage = { ...decoded };
  }

  const now = new Date().toISOString();
  let writtenRel = "";
  let previousRel = "";
  /** @type {string[]} */
  const writtenCameraRels = [];
  const outcome = await db.transaction(async (tx) => {
    const site = await tx.get(`SELECT id, code, name FROM data_sites WHERE id = ?`, [cleanSiteId]);
    if (!site) {
      store.fail("pvVideo:save", "Choisissez un site du référentiel.", "PV_VIDEO_SITE_REQUIRED");
    }
    const existing = await tx.get(`SELECT * FROM pv_video_reports WHERE site_id = ? FOR UPDATE`, [cleanSiteId]);
    previousRel = existing ? String(existing.image_relpath || "") : "";
    let previousCameras = [];
    if (existing) {
      try {
        const parsed = JSON.parse(String(existing.cameras_json || "[]"));
        previousCameras = Array.isArray(parsed) ? parsed : [];
      } catch {
        previousCameras = [];
      }
    }
    const storedCameras = form.cameras.map((camera) => {
      if (camera.image) {
        const decoded = decodeIncomingImage(store, camera.image);
        const rel = writeReportImage(store, archiveFolder, site, decoded, { cameraLabel: camera.title });
        writtenCameraRels.push(rel);
        return {
          number: camera.number,
          title: camera.title,
          information: camera.information,
          imageRelpath: rel,
          imageMime: decoded.mime,
          imageOriginalName: decoded.originalName
        };
      }
      const keep = isSitePhotoRel(site, camera.imageRelpath) ? camera.imageRelpath : "";
      const previous = previousCameras.find((row) => String(row.imageRelpath || "") === keep);
      return {
        number: camera.number,
        title: camera.title,
        information: camera.information,
        imageRelpath: previous ? keep : "",
        imageMime: previous ? String(previous.imageMime || "") : "",
        imageOriginalName: previous ? String(previous.imageOriginalName || "") : ""
      };
    });
    let imageRel = previousRel;
    let imageMime = existing ? String(existing.image_mime || "") : "";
    let imageName = existing ? String(existing.image_original_name || "") : "";
    if (imageChanged) {
      if (nextImage) {
        writtenRel = writeReportImage(store, archiveFolder, site, nextImage, null);
        imageRel = writtenRel;
        imageMime = nextImage.mime;
        imageName = nextImage.originalName;
      } else {
        imageRel = "";
        imageMime = "";
        imageName = "";
      }
    }
    const hasImage = Boolean(imageRel);
    const after = toAuditSnapshot(site, form, hasImage);
    const cipherLogin = encryptField(form.login);
    const cipherPassword = encryptField(form.password);
    const camerasJson = JSON.stringify(storedCameras);
    const values = [
      form.connectionDate,
      form.tlsResponsibleName,
      form.technicianContact,
      form.transmitterCode,
      form.connectionMethod,
      form.recorderModel,
      form.recorderIp,
      form.recorderPort,
      cipherLogin,
      cipherPassword,
      camerasJson,
      imageRel,
      imageMime,
      imageName,
      now,
      actorName(requesterUsername)
    ];
    if (!existing) {
      if (expected) {
        store.fail(
          "pvVideo:save",
          "Cette fiche n'est plus disponible. Sélectionnez à nouveau le site.",
          "PV_VIDEO_CONFLICT"
        );
      }
      const id = generateEntityId();
      await tx.run(
        `INSERT INTO pv_video_reports (
           id, site_id, connection_date, tls_responsible_name, technician_contact, transmitter_code,
           connection_method, recorder_model, recorder_ip, recorder_port, login_cipher, password_cipher,
           cameras_json, image_relpath, image_mime, image_original_name, created_at, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, cleanSiteId, ...values.slice(0, -2), now, now, values[values.length - 1]]
      );
      return {
        created: true,
        id,
        before: null,
        after,
        previousCameraRels: [],
        keptCameraRels: storedCameras.map((camera) => camera.imageRelpath).filter(Boolean)
      };
    }
    if (expected && String(existing.updated_at || "") !== expected) {
      store.fail(
        "pvVideo:save",
        "Cette fiche a été enregistrée sur un autre poste. Sélectionnez à nouveau le site pour la recharger.",
        "PV_VIDEO_CONFLICT"
      );
    }
    await tx.run(
      `UPDATE pv_video_reports SET
         connection_date = ?, tls_responsible_name = ?, technician_contact = ?, transmitter_code = ?,
         connection_method = ?, recorder_model = ?, recorder_ip = ?, recorder_port = ?,
         login_cipher = ?, password_cipher = ?, cameras_json = ?, image_relpath = ?, image_mime = ?,
         image_original_name = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
      [...values, existing.id]
    );
    let before = null;
    try {
      before = toAuditSnapshot(site, formFromRow(store, existing), Boolean(existing.image_relpath));
    } catch {
      before = toAuditSnapshot(site, { ...form, login: "", password: "", cameras: [] }, Boolean(existing.image_relpath));
    }
    return {
      created: false,
      id: existing.id,
      before,
      after,
      previousCameraRels: previousCameras.map((camera) => String(camera.imageRelpath || "")).filter(Boolean),
      keptCameraRels: storedCameras.map((camera) => camera.imageRelpath).filter(Boolean)
    };
  }).catch((error) => {
    if (writtenRel && writtenRel !== previousRel) deleteReportImage(archiveFolder, writtenRel);
    for (const rel of writtenCameraRels) deleteReportImage(archiveFolder, rel);
    throw error;
  });

  if (outcome.created) {
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "PV_VIDEO_CREATE",
      details: outcome.after
    });
    await store.recordEntityChange({
      entityType: "pv_video_reports",
      entityId: outcome.id,
      changedBy: actorName(requesterUsername),
      snapshot: outcome.after
    });
  } else {
    const historyBefore = await store.getEntityChangeHistory("pv_video_reports", outcome.id, 3);
    store.logAudit({
      actorUsername: actorName(requesterUsername),
      action: "PV_VIDEO_UPDATE",
      details: { before: outcome.before, after: outcome.after, historyBefore }
    });
    await store.recordEntityChange({
      entityType: "pv_video_reports",
      entityId: outcome.id,
      changedBy: actorName(requesterUsername),
      snapshot: outcome.after
    });
  }
  return { updatedAt: now };
}

/**
 * Enregistre le dossier partagé des photos, choisi par un responsable.
 *
 * @param {import("../../../userStore")} store
 * @param {{ requesterRole: string, requesterUsername: string, requesterManagerProfile?: string|null }} payload
 * @returns {Promise<{ canceled: boolean, archiveConfigured: boolean }>}
 */
async function setPvVideoArchiveFolder(store, payload) {
  const { requesterRole, requesterUsername, requesterManagerProfile } = payload;
  assertPvVideoAccess(store, requesterRole, requesterManagerProfile);
  assertCanSetArchive(store, requesterRole);
  const { dialog, BrowserWindow } = require("electron");
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Dossier partagé des photos de PV vidéo",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) {
    const current = await readArchiveFolder(requireDataPersistence(store, "pvVideo:archive"));
    return { canceled: true, archiveConfigured: Boolean(current) };
  }
  const folderPath = result.filePaths[0];
  const db = requireDataPersistence(store, "pvVideo:archive");
  const now = new Date().toISOString();
  const actor = actorName(requesterUsername);
  const existing = await db.get(`SELECT folder_path FROM pv_video_archive WHERE id = ?`, [ARCHIVE_ROW_ID]);
  if (!existing) {
    await db.run(
      `INSERT INTO pv_video_archive (id, folder_path, updated_at, updated_by) VALUES (?, ?, ?, ?)`,
      [ARCHIVE_ROW_ID, folderPath, now, actor]
    );
  } else {
    await db.run(
      `UPDATE pv_video_archive SET folder_path = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
      [folderPath, now, actor, ARCHIVE_ROW_ID]
    );
  }
  store.logAudit({
    actorUsername: actor,
    action: "PV_VIDEO_ARCHIVE_FOLDER_SET",
    details: {
      before: { folderPath: existing ? String(existing.folder_path || "") : "" },
      after: { folderPath }
    }
  });
  return { canceled: false, archiveConfigured: true };
}

/**
 * Dépose une copie du Word exporté dans le dossier des photos du site.
 *
 * @param {import("../../../userStore")} store
 * @param {{ requesterRole: string, requesterManagerProfile?: string|null, siteId?: string, sourcePath?: string }} payload
 * @returns {Promise<{ backedUp: boolean, reason: string }>}
 */
async function archivePvVideoExport(store, payload) {
  const { requesterRole, requesterManagerProfile, siteId, sourcePath } = payload;
  assertPvVideoAccess(store, requesterRole, requesterManagerProfile);
  const cleanSiteId = String(siteId || "").trim();
  if (!cleanSiteId) {
    store.fail("pvVideo:exportBackup", "Choisissez un site avant d'exporter.", "PV_VIDEO_SITE_REQUIRED");
  }
  const db = requireDataPersistence(store, "pvVideo:exportBackup");
  const archiveFolder = await readArchiveFolder(db);
  if (!archiveFolder) return { backedUp: false, reason: "unconfigured" };
  const site = await db.get(`SELECT code, name FROM data_sites WHERE id = ?`, [cleanSiteId]);
  if (!site) {
    store.fail("pvVideo:exportBackup", "Choisissez un site du référentiel.", "PV_VIDEO_SITE_REQUIRED");
  }
  return backupExportFile(store, archiveFolder, site, sourcePath);
}

module.exports = { getPvVideoReport, savePvVideoReport, setPvVideoArchiveFolder, archivePvVideoExport };
