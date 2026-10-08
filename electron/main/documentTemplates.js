/**
 * Gestion des modèles Word (.docx) : lecture pour exports, inventaire, installation et modèles scopés.
 * Cherche les modèles personnalisés sous `{userData}/templates`, puis les modèles embarqués.
 *
 * Instancié dans `main.js` ; exposé au renderer via `ipcSystemHandlers.js` et `gtsApiClient`
 * (Paramètres → modèles ; exports main courante, intervention, rondes, PV vidéo).
 *
 * @module electron/main/documentTemplates
 */

/**
 * Fabrique le service de modèles documentaires.
 *
 * @param {object} deps - Dépendances injectées par `main.js`.
 * @param {import('fs')} deps.fs - Lecture, copie et listing des fichiers `.docx`.
 * @param {import('path')} deps.path - Résolution sécurisée des chemins (`basename` anti traversal).
 * @param {import('electron').Dialog} deps.dialog - Sélecteur de fichier pour install / upsert scopé.
 * @param {string} deps.appDirname - Répertoire du bundle Electron (`__dirname` de main).
 * @param {string} deps.processCwd - Répertoire de travail (candidat `dist/templates` en dev).
 * @param {() => string[]} deps.getDataRootCandidates - Racines `data/` du poste.
 * @param {() => void} deps.ensureStore - Vérifie que `UserStore` est initialisé.
 * @param {() => import('../userStore')} deps.getUserStore - Store pour audit et assignations.
 * @returns {{
 *   getDocumentTemplate: (templateName: string) => object,
 *   listDocumentTemplatesPayload: () => object,
   *   installDocumentTemplateCopy: (payload: object) => Promise<object>,
   *   upsertScopedDocumentTemplate: (payload: object) => Promise<object>,
   *   deleteCustomDocumentTemplate: (payload: object) => Promise<object>,
   *   resolveWritableTemplatesDirectory: () => string
 * }}
 */
function createDocumentTemplatesService(deps) {
  const {
    fs,
    path,
    dialog,
    appDirname,
    processCwd,
    getDataRootCandidates,
    ensureStore,
    getUserStore
  } = deps;

  const DOCX_OPEN_FILTERS = [
    { name: "Document Word", extensions: ["docx"] },
    { name: "Tous les fichiers", extensions: ["*"] }
  ];

  const BUILTIN_TEMPLATE_FILE_NAMES = new Set([
    "main-courante-template.docx",
    "intervention-template.docx",
    "ronde-template.docx",
    "PV-Video-template.docx",
    "pv-video-template.docx"
  ]);

  /**
   * Résout le premier chemin existant pour un nom de fichier modèle (données puis bundle).
   *
   * @param {string} templateName - Nom de fichier (sanitisé via `basename`).
   * @returns {string|null} Chemin absolu ou `null`.
   */
  function findFirstExistingTemplatePath(templateName) {
    const safeName = path.basename(String(templateName || "").trim());
    if (!safeName) return null;
    const dataCandidates = getDataRootCandidates().map((dataRoot) => path.join(dataRoot, "templates", safeName));
    const appBundledCandidates = [
      path.join(appDirname, "..", "dist", "templates", safeName),
      path.join(processCwd, "dist", "templates", safeName),
      path.join(appDirname, "..", "public", "templates", safeName),
      path.join(processCwd, "public", "templates", safeName)
    ];
    for (const filePath of [...dataCandidates, ...appBundledCandidates]) {
      try {
        if (fs.existsSync(filePath)) return filePath;
      } catch {
        /* suivant */
      }
    }
    return null;
  }

  /**
   * Charge un modèle Word en base64 pour injection côté renderer (export docx).
   *
   * @param {string} templateName - Ex. `main-courante-template.docx`.
   * @returns {{ found: boolean, dataBase64: string|null, sourcePath: string|null }}
   */
  function getDocumentTemplate(templateName) {
    const safeName = path.basename(String(templateName || "").trim());
    if (!safeName) {
      return { found: false, dataBase64: null, sourcePath: null };
    }
    const resolved = findFirstExistingTemplatePath(safeName);
    if (!resolved) {
      return { found: false, dataBase64: null, sourcePath: null };
    }
    try {
      const buffer = fs.readFileSync(resolved);
      return {
        found: true,
        dataBase64: buffer.toString("base64"),
        sourcePath: resolved
      };
    } catch {
      return { found: false, dataBase64: null, sourcePath: null };
    }
  }

  /**
   * Transforme un libellé métier en segment de nom de fichier (ASCII, underscores, max 80 car.).
   *
   * @param {string} label
   * @returns {string} Slug ; `profil` si vide après normalisation.
   */
  function sanitizeTemplateSlug(label) {
    const raw = String(label || "").trim();
    if (!raw) return "";
    try {
      const asciiLike = raw.normalize("NFD").replace(/\p{M}/gu, "");
      const slug = asciiLike
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      return slug || "profil";
    } catch {
      const fallback = raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      return fallback || "profil";
    }
  }

  /**
   * Construit un nom de fichier modèle lié à un flux et une portée : `{flux}_{scope}_{slug}.docx`.
   *
   * @param {string} flowKind
   * @param {string} scopeKind
   * @param {string} scopeLabel
   * @returns {string}
   */
  function scopedTemplateFileName(flowKind, scopeKind, scopeLabel) {
    const flow = String(flowKind || "").trim().toLowerCase() || "flux";
    const scope = String(scopeKind || "").trim().toLowerCase() || "scope";
    const slug = sanitizeTemplateSlug(scopeLabel || "modele");
    return `${flow}_${scope}_${slug}.docx`;
  }

  /**
   * Identifiant d'aide Word déduit du nom de fichier.
   *
   * @param {string} fileName
   * @returns {string}
   */
  function helpIdFromTemplateFileName(fileName) {
    const name = String(fileName || "").trim().toLowerCase();
    if (name === "intervention-template.docx" || name.startsWith("intervention_")) return "intervention";
    if (name === "main-courante-template.docx") return "main-courante";
    if (name === "ronde-template.docx") return "ronde";
    if (name === "pv-video-template.docx") return "pv-video";
    if (name.startsWith("ronde_planifiee_")) return "ronde-planifiee";
    if (name.startsWith("ronde_exceptionnelle_")) return "ronde-exceptionnelle";
    return "custom-docx";
  }

  /**
   * Titre liste pour un `.docx` hors modèles embarqués.
   *
   * @param {string} helpId
   * @returns {string}
   */
  function customTemplateTitle(helpId) {
    const labels = {
      intervention: "Intervention",
      ronde: "Ronde",
      "ronde-planifiee": "Ronde contractuelle",
      "ronde-exceptionnelle": "Ronde exceptionnelle",
      "main-courante": "Main courante",
      "pv-video": "PV Vidéo"
    };
    const label = labels[helpId];
    if (label) return `Modèle personnalisé — ${label}`;
    return "Modèle personnalisé";
  }

  /**
    * Retourne (et crée si besoin) le dossier `{userData}/templates` writable du poste.
   *
   * @returns {string}
   * @throws {Error} Si aucune racine données n'est disponible.
   */
  function resolveWritableTemplatesDirectory() {
    const dataRoot = getDataRootCandidates()[0];
    if (!dataRoot) {
      throw new Error("Aucun dossier de données disponible pour les modèles documentaires.");
    }
    const dir = path.join(dataRoot, "templates");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Vérifie qu'un nom de fichier .docx n'est pas un modèle embarqué.
   *
   * @param {string} fileName
   * @returns {string} Nom sanitizé
   */
  function assertDeletableCustomTemplateName(fileName) {
    const safeName = path.basename(String(fileName || "").trim());
    if (!safeName.toLowerCase().endsWith(".docx")) {
      throw new Error("Le nom cible doit se terminer par .docx.");
    }
    if (BUILTIN_TEMPLATE_FILE_NAMES.has(safeName) || BUILTIN_TEMPLATE_FILE_NAMES.has(safeName.toLowerCase())) {
      throw new Error("Les modèles par défaut ne peuvent pas être supprimés.");
    }
    return safeName;
  }

  /**
   * Supprime un .docx personnalisé uniquement s'il est dans le dossier d'écriture du poste.
   *
   * @param {string} safeName
   * @returns {string} Chemin supprimé
   */
  function unlinkCustomTemplateInWritableDir(safeName) {
    const templatesDir = path.resolve(resolveWritableTemplatesDirectory());
    const dest = path.resolve(templatesDir, safeName);
    const prefix = templatesDir.endsWith(path.sep) ? templatesDir : `${templatesDir}${path.sep}`;
    if (dest !== templatesDir && !dest.startsWith(prefix)) {
      throw new Error("Chemin de modèle invalide.");
    }
    if (!fs.existsSync(dest)) {
      throw new Error("Fichier modèle introuvable dans le dossier des modèles.");
    }
    fs.unlinkSync(dest);
    return dest;
  }

  /**
   * Retire les attributions encore liées à un fichier (si la table existe).
   *
   * @param {object} payload
   * @param {string} safeName
   */
  async function deleteAssignmentsForTemplateFile(payload, safeName) {
    const userStore = getUserStore();
    if (!userStore) return;
    try {
      const rows = await userStore.listTemplateAssignments({ requesterRole: payload.requesterRole });
      for (const row of rows || []) {
        if (String(row.templateFileName || "") !== safeName) continue;
        await userStore.deleteTemplateAssignment({
          requesterRole: payload.requesterRole,
          requesterUsername: payload.requesterUsername,
          id: row.id,
          reason: "Fichier modèle personnalisé supprimé"
        });
      }
    } catch {
      /* table absente après reset, ou lecture impossible */
    }
  }

  /**
   * Ouvre le sélecteur de fichier `.docx`.
   *
   * @param {string} title
   * @returns {Promise<string|null>} Chemin source, ou `null` si annulé.
   */
  async function pickDocxSourceFile(title) {
    const result = await dialog.showOpenDialog({
      title,
      properties: ["openFile"],
      filters: DOCX_OPEN_FILTERS
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const src = result.filePaths[0];
    if (path.extname(src).toLowerCase() !== ".docx") {
      throw new Error("Le fichier doit être au format .docx.");
    }
    return src;
  }

  /**
   * Liste les modèles intégrés et personnalisés (Paramètres → Modèles documentaires).
   *
   * @returns {{ templates: Array<object>, writableTemplatesDir: string|null }}
   */
  function listDocumentTemplatesPayload() {
    const builtins = [
      { kind: "builtin", templateKey: "main-courante", title: "Main courante — export Word", fileName: "main-courante-template.docx", helpId: "main-courante" },
      { kind: "builtin", templateKey: "intervention", title: "Intervention — export Word", fileName: "intervention-template.docx", helpId: "intervention" },
      { kind: "builtin", templateKey: "ronde", title: "Ronde contractuelle — modèle par défaut (.docx)", fileName: "ronde-template.docx", helpId: "ronde" },
      { kind: "builtin", templateKey: "pv-video", title: "PV Vidéo — modèle par défaut", fileName: "PV-Video-template.docx", helpId: "pv-video" }
    ];
    let writableDir = null;
    try {
      writableDir = resolveWritableTemplatesDirectory();
    } catch {
      writableDir = null;
    }
    const seen = new Set();
    const templates = [];
    for (const b of builtins) {
      seen.add(b.fileName);
      const resolvedPath = findFirstExistingTemplatePath(b.fileName);
      const writableCopy = writableDir ? path.join(writableDir, b.fileName) : null;
      const overridden = Boolean(writableCopy && fs.existsSync(writableCopy));
      templates.push({
        ...b,
        resolvedPath,
        exists: Boolean(resolvedPath),
        overridden,
        targetInstallPath: writableCopy
      });
    }
    for (const root of getDataRootCandidates()) {
      const dir = path.join(root, "templates");
      try {
        if (!fs.existsSync(dir)) continue;
        const names = fs.readdirSync(dir);
        for (const f of names) {
          if (!String(f).toLowerCase().endsWith(".docx")) continue;
          if (/^~\$/i.test(String(f))) continue;
          if (seen.has(f)) continue;
          seen.add(f);
          const full = path.join(dir, f);
          const helpId = helpIdFromTemplateFileName(f);
          templates.push({
            kind: "custom",
            templateKey: `custom:${f}`,
            title: customTemplateTitle(helpId),
            fileName: f,
            helpId,
            resolvedPath: full,
            exists: true,
            targetInstallPath: writableDir ? path.join(writableDir, f) : full
          });
        }
      } catch {
        /* ignore */
      }
    }
    return { templates, writableTemplatesDir: writableDir };
  }

  /**
   * Copie un fichier `.docx` choisi par l'utilisateur vers le dossier templates writable.
   *
   * RBAC : `ensureDataManagerRole`. Audit : `DATA_DOCUMENT_TEMPLATE_INSTALL`.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.requesterUsername
   * @param {string} payload.targetFileName
   * @returns {Promise<{ canceled: boolean, success: boolean, fileName?: string, resolvedPath?: string, templatesRelativePath?: string }>}
   */
  async function installDocumentTemplateCopy(payload) {
    ensureStore();
    const userStore = getUserStore();
    const { requesterRole, requesterUsername, targetFileName } = payload;
    userStore.ensureDataManagerRole(requesterRole);
    const safeName = path.basename(String(targetFileName || "").trim());
    if (!safeName.toLowerCase().endsWith(".docx")) {
      throw new Error("Le nom cible doit se terminer par .docx.");
    }
    const src = await pickDocxSourceFile("Choisir un fichier modèle Word (.docx)");
    if (!src) {
      return { canceled: true, success: false };
    }
    const templatesDir = resolveWritableTemplatesDirectory();
    const dest = path.join(templatesDir, safeName);
    fs.copyFileSync(src, dest);
    userStore.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_DOCUMENT_TEMPLATE_INSTALL",
      details: { fileName: safeName, destPath: dest }
    });
    const resolvedPath = findFirstExistingTemplatePath(safeName);
    return {
      canceled: false,
      success: true,
      fileName: safeName,
      resolvedPath,
      templatesRelativePath: path.join("templates", safeName)
    };
  }

  /**
   * Enregistre un modèle Word scopé et crée l'assignation en base.
   *
   * RBAC : `ensureDataManagerRole`. Persiste via `userStore.upsertTemplateAssignment`.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.requesterUsername
   * @param {string} payload.flowKind
   * @param {string} payload.scopeKind
   * @param {string} payload.scopeValue
   * @param {string} payload.scopeLabel
   * @returns {Promise<{ canceled: boolean, success: boolean, fileName?: string, assignment?: object, templatesRelativePath?: string }>}
   */
  async function upsertScopedDocumentTemplate(payload) {
    ensureStore();
    const userStore = getUserStore();
    const { requesterRole, requesterUsername, flowKind, scopeKind, scopeValue, scopeLabel } = payload || {};
    userStore.ensureDataManagerRole(requesterRole);
    const normalizedLabel = String(scopeLabel || "").trim();
    if (!normalizedLabel) {
      throw new Error("Libellé de portée obligatoire.");
    }
    const src = await pickDocxSourceFile("Choisir un modèle Word (.docx)");
    if (!src) {
      return { canceled: true, success: false };
    }
    const templatesDir = resolveWritableTemplatesDirectory();
    const fileName = scopedTemplateFileName(flowKind, scopeKind, normalizedLabel);
    const dest = path.join(templatesDir, fileName);
    fs.copyFileSync(src, dest);
    const assignment = await userStore.upsertTemplateAssignment({
      requesterRole,
      requesterUsername,
      flowKind,
      scopeKind,
      scopeValue,
      scopeLabel: normalizedLabel,
      templateFileName: fileName
    });
    return {
      canceled: false,
      success: true,
      fileName,
      assignment,
      templatesRelativePath: path.join("templates", fileName)
    };
  }

  /**
   * Supprime un modèle Word personnalisé du dossier d'écriture (pas les trames par défaut).
   * Retire aussi les attributions qui pointent encore vers ce fichier.
   *
   * RBAC : `ensureDataManagerRole`. Audit : `DATA_DOCUMENT_TEMPLATE_DELETE`.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.requesterUsername
   * @param {string} payload.targetFileName
   * @returns {Promise<{ success: true, fileName: string }>}
   */
  async function deleteCustomDocumentTemplate(payload) {
    ensureStore();
    const userStore = getUserStore();
    const { requesterRole, requesterUsername, targetFileName } = payload || {};
    userStore.ensureDataManagerRole(requesterRole);
    const safeName = assertDeletableCustomTemplateName(targetFileName);
    const destPath = unlinkCustomTemplateInWritableDir(safeName);
    await deleteAssignmentsForTemplateFile({ requesterRole, requesterUsername }, safeName);
    userStore.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_DOCUMENT_TEMPLATE_DELETE",
      details: { fileName: safeName, destPath }
    });
    return { success: true, fileName: safeName };
  }

  /**
   * Retire la copie locale d'un modèle embarqué remplacé. Le fichier du pack reste en place.
   *
   * RBAC : `ensureDataManagerRole`. Audit : `DATA_DOCUMENT_TEMPLATE_RESTORE`.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.requesterUsername
   * @param {string} payload.targetFileName
   * @returns {Promise<{ success: true, fileName: string, resolvedPath: string|null }>}
   */
  async function restoreBuiltinDocumentTemplate(payload) {
    ensureStore();
    const userStore = getUserStore();
    const { requesterRole, requesterUsername, targetFileName } = payload || {};
    userStore.ensureDataManagerRole(requesterRole);
    const safeName = path.basename(String(targetFileName || "").trim());
    if (!BUILTIN_TEMPLATE_FILE_NAMES.has(safeName)) {
      throw new Error("Seul un modèle par défaut remplacé peut être rétabli.");
    }
    const destPath = unlinkCustomTemplateInWritableDir(safeName);
    userStore.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_DOCUMENT_TEMPLATE_RESTORE",
      details: { fileName: safeName, destPath }
    });
    return {
      success: true,
      fileName: safeName,
      resolvedPath: findFirstExistingTemplatePath(safeName)
    };
  }

  /**
   * Si plus aucune attribution n'utilise ce fichier, le retire du dossier writable.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.targetFileName
   */
  async function deleteCustomTemplateFileIfUnreferenced(payload) {
    const safeName = assertDeletableCustomTemplateName(payload?.targetFileName);
    const userStore = getUserStore();
    if (userStore) {
      try {
        const rows = await userStore.listTemplateAssignments({ requesterRole: payload.requesterRole });
        const stillUsed = (rows || []).some((row) => String(row.templateFileName || "") === safeName);
        if (stillUsed) return { success: true, deleted: false };
      } catch {
        return { success: true, deleted: false };
      }
    }
    try {
      unlinkCustomTemplateInWritableDir(safeName);
      return { success: true, deleted: true };
    } catch {
      return { success: true, deleted: false };
    }
  }

  return {
    getDocumentTemplate,
    listDocumentTemplatesPayload,
    installDocumentTemplateCopy,
    upsertScopedDocumentTemplate,
    deleteCustomDocumentTemplate,
    restoreBuiltinDocumentTemplate,
    deleteCustomTemplateFileIfUnreferenced,
    resolveWritableTemplatesDirectory
  };
}

module.exports = {
  createDocumentTemplatesService
};
