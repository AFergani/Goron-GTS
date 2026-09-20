/**
 * Enregistrement local des exports Word/Excel et ouverture par l’application système.
 *
 * Instancié dans `main.js` ; exposé via IPC `system:saveExportFile` / `system:openExportFile`.
 * Mémorise le dernier dossier d’enregistrement sur le poste (`gts-export-prefs.json` dans userData).
 * Les chemins par fiche restent côté renderer (localStorage), car ils sont propres au poste.
 *
 * @module electron/main/exportFileService
 */

const PREFS_FILE_NAME = "gts-export-prefs.json";
const MAX_EXPORT_BYTES = 40 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".docx", ".xlsx"]);

/**
 * Fabrique le service d’export fichiers du processus principal.
 *
 * @param {object} deps
 * @param {import('fs')} deps.fs
 * @param {import('path')} deps.path
 * @param {import('electron').Dialog} deps.dialog
 * @param {import('electron').Shell} deps.shell
 * @param {import('electron').App} deps.app
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @returns {{
 *   saveExportFile: (payload: object) => Promise<{ canceled: boolean, filePath: string|null }>,
 *   openExportFile: (payload: object) => Promise<{ success: boolean, error: string|null }>
 * }}
 */
function createExportFileService(deps) {
  const { fs, path, dialog, shell, app, getMainWindow } = deps;
  const prefsPath = path.join(app.getPath("userData"), PREFS_FILE_NAME);

  /**
   * @returns {string} Dossier du dernier enregistrement, ou Documents.
   */
  function readLastExportDir() {
    try {
      if (!fs.existsSync(prefsPath)) return app.getPath("documents");
      const raw = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
      const dir = raw && typeof raw.lastExportDir === "string" ? raw.lastExportDir.trim() : "";
      if (dir && fs.existsSync(dir)) return dir;
    } catch {
      /* repli Documents */
    }
    return app.getPath("documents");
  }

  /**
   * @param {string} dir
   * @returns {void}
   */
  function writeLastExportDir(dir) {
    try {
      fs.writeFileSync(prefsPath, JSON.stringify({ lastExportDir: dir }, null, 2), "utf-8");
    } catch {
      /* non bloquant : le prochain dialogue reprendra Documents */
    }
  }

  /**
   * @param {unknown} rawName
   * @returns {string}
   */
  function sanitizeDefaultFileName(rawName) {
    const base = path.basename(String(rawName || "").trim());
    return base || "export";
  }

  /**
   * Accepte Uint8Array, ArrayBuffer, Buffer Node ou objet `{ type: 'Buffer', data }` (clone IPC).
   *
   * @param {unknown} raw
   * @returns {Buffer}
   */
  function bufferFromPayloadBytes(raw) {
    if (!raw) {
      throw new Error("Données d'export invalides.");
    }
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    if (ArrayBuffer.isView(raw)) {
      return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (typeof raw === "object" && raw.type === "Buffer" && Array.isArray(raw.data)) {
      return Buffer.from(raw.data);
    }
    throw new Error("Données d'export invalides.");
  }

  /**
   * Transforme une erreur d’écriture disque (fichier ouvert, verrou Windows) en message lisible.
   *
   * @param {unknown} error
   * @returns {never}
   */
  function throwFriendlyWriteError(error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    if (
      code === "EBUSY" ||
      /resource busy or locked/i.test(message) ||
      /being used by another process/i.test(message)
    ) {
      throw new Error("Fichier déjà ouvert. Fermez-le dans Word ou Excel, puis réessayez.");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        "Impossible d'enregistrer : accès refusé. Fermez le fichier s'il est ouvert, ou choisissez un autre emplacement."
      );
    }
    throw error;
  }

  /**
   * Ouvre « Enregistrer sous », écrit le fichier et mémorise le dossier.
   *
   * @param {object} payload
   * @param {string} [payload.defaultFileName]
   * @param {"docx"|"xlsx"} [payload.kind]
   * @param {unknown} payload.bytes
   * @returns {Promise<{ canceled: boolean, filePath: string|null }>}
   */
  async function saveExportFile(payload) {
    const kind = payload?.kind === "xlsx" ? "xlsx" : "docx";
    const buffer = bufferFromPayloadBytes(payload?.bytes);
    if (buffer.length === 0) {
      throw new Error("Le fichier d'export est vide.");
    }
    if (buffer.length > MAX_EXPORT_BYTES) {
      throw new Error("Fichier d'export trop volumineux.");
    }

    let defaultFileName = sanitizeDefaultFileName(payload?.defaultFileName);
    const expectedExt = `.${kind}`;
    if (path.extname(defaultFileName).toLowerCase() !== expectedExt) {
      defaultFileName = `${defaultFileName}${expectedExt}`;
    }

    const parent = getMainWindow() || undefined;
    const result = await dialog.showSaveDialog(parent, {
      title: kind === "xlsx" ? "Enregistrer l'export Excel" : "Enregistrer l'export Word",
      defaultPath: path.join(readLastExportDir(), defaultFileName),
      filters:
        kind === "xlsx"
          ? [{ name: "Classeur Excel", extensions: ["xlsx"] }]
          : [{ name: "Document Word", extensions: ["docx"] }]
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }

    let target = result.filePath;
    if (path.extname(target).toLowerCase() !== expectedExt) {
      target = `${target}${expectedExt}`;
    }

    try {
      fs.writeFileSync(target, buffer);
    } catch (error) {
      throwFriendlyWriteError(error);
    }
    writeLastExportDir(path.dirname(target));
    return { canceled: false, filePath: target };
  }

  /**
   * Ouvre un export Word/Excel déjà enregistré avec l’application associée.
   *
   * @param {object} payload
   * @param {string} [payload.filePath]
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  async function openExportFile(payload) {
    const filePath = String(payload?.filePath || "").trim();
    if (!filePath || !path.isAbsolute(filePath)) {
      return { success: false, error: "Chemin de fichier invalide." };
    }
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { success: false, error: "Seuls les fichiers Word et Excel exportés peuvent être ouverts ici." };
    }
    if (!fs.existsSync(resolved)) {
      return {
        success: false,
        error: "Fichier introuvable. Il a peut-être été déplacé ou supprimé. Réexportez le rapport."
      };
    }
    let isFile = false;
    try {
      isFile = fs.statSync(resolved).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      return { success: false, error: "Le chemin ne correspond pas à un fichier." };
    }
    const error = await shell.openPath(resolved);
    if (error) {
      return { success: false, error: error };
    }
    return { success: true, error: null };
  }

  return {
    saveExportFile,
    openExportFile
  };
}

module.exports = {
  createExportFileService
};
