/**
 * Gestion des modèles Word (.docx) : lecture pour exports, inventaire, installation et modèles scopés.
 * Cherche d'abord sous `{dataRoot}/templates`, puis les modèles embarqués `dist/templates`.
 *
 * Instancié dans `main.js` ; exposé au renderer via `ipcSystemHandlers.js` et `gtsApiClient`
 * (Paramètres données, exports main courante / intervention / rondes / gardiennage / Fransor).
 * Plus de dépendance à un fichier base SQLite : les racines `data/` viennent de `getDataRootCandidates`.
 */

/**
 * Fabrique le service de modèles documentaires.
 *
 * @param {object} deps - Dépendances injectées par `main.js`.
 * @param {import('fs')} deps.fs - Lecture, copie et listing des fichiers `.docx`.
 * @param {import('path')} deps.path - Résolution sécurisée des chemins (`basename` anti traversal).
 * @param {import('electron').Dialog} deps.dialog - Sélecteur de fichier pour install / upsert scopé.
 * @param {string} deps.appDirname - Répertoire du bundle Electron (`__dirname` de main).
 * @param {string} deps.processCwd - Répertoire de travail courant (candidat `dist/templates` en dev).
 * @param {() => string[]} deps.getDataRootCandidates - Racines données Goron (cwd / portable / userData).
 * @param {() => void} deps.ensureStore - Vérifie que `UserStore` est initialisé (écritures / RBAC).
 * @param {() => import('../userStore')} deps.getUserStore - Store pour audit et assignations de modèles.
 * @returns {{
 *   getDocumentTemplate: (templateName: string) => object,
 *   listDocumentTemplatesPayload: () => object,
 *   installDocumentTemplateCopy: (payload: object) => Promise<object>,
 *   upsertScopedDocumentTemplate: (payload: object) => Promise<object>,
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
      path.join(processCwd, "dist", "templates", safeName)
    ];
    const allCandidates = [...dataCandidates, ...appBundledCandidates];
    for (const filePath of allCandidates) {
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
   * @param {string} label - Libellé portée (site, profil, etc.).
   * @returns {string} Slug ; `profil` si vide après normalisation.
   */
  function sanitizeProfileLabelForWordTemplateFilename(label) {
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
   * Alias de sanitization pour les noms de modèles scopés (`scopedTemplateFileName`).
   *
   * @param {string} label
   * @returns {string}
   */
  function sanitizeTemplateSlug(label) {
    return sanitizeProfileLabelForWordTemplateFilename(label || "template");
  }

  /**
   * Construit un nom de fichier modèle lié à un flux et une portée : `{flux}_{scope}_{slug}.docx`.
   *
   * @param {string} flowKind - Ex. type de flux export.
   * @param {string} scopeKind - Ex. `site`, `profil`.
   * @param {string} scopeLabel - Libellé affiché (sanitisé en slug).
   * @returns {string}
   */
  function scopedTemplateFileName(flowKind, scopeKind, scopeLabel) {
    const flow = String(flowKind || "").trim().toLowerCase() || "flux";
    const scope = String(scopeKind || "").trim().toLowerCase() || "scope";
    const slug = sanitizeTemplateSlug(scopeLabel || "modele");
    return `${flow}_${scope}_${slug}.docx`;
  }

  /**
   * Identifiant d’aide Word déduit du nom de fichier (modèle par défaut ou attribution scopée).
   * Un modèle personnalisé d’intervention / gardiennage / ronde réutilise l’aide du flux par défaut.
   *
   * @param {string} fileName - Nom du fichier `.docx`.
   * @returns {string} Clé d’aide (`intervention`, `gardiennage`, `ronde`, alias ronde, ou `custom-docx`).
   */
  function helpIdFromTemplateFileName(fileName) {
    const name = String(fileName || "").trim().toLowerCase();
    if (name === "intervention-template.docx" || name.startsWith("intervention_")) return "intervention";
    if (name === "gardiennage-template.docx" || name.startsWith("gardiennage_")) return "gardiennage";
    if (name === "main-courante-template.docx") return "main-courante";
    if (name === "ronde-template.docx") return "ronde";
    if (name.startsWith("ronde_planifiee_")) return "ronde-planifiee";
    if (name.startsWith("ronde_exceptionnelle_")) return "ronde-exceptionnelle";
    return "custom-docx";
  }

  /**
   * Titre liste pour un `.docx` hors modèles embarqués.
   *
   * @param {string} fileName - Nom du fichier.
   * @param {string} helpId - Identifiant d’aide déduit.
   * @returns {string} Libellé affiché (flux + nom de fichier).
   */
  function customTemplateTitle(fileName, helpId) {
    const labels = {
      intervention: "Intervention",
      gardiennage: "Gardiennage",
      ronde: "Ronde",
      "ronde-planifiee": "Ronde contractuelle",
      "ronde-exceptionnelle": "Ronde exceptionnelle",
      "main-courante": "Main courante"
    };
    const label = labels[helpId];
    if (label) return `Modèle personnalisé — ${label} (${fileName})`;
    return `Modèle personnalisé (${fileName})`;
  }

  /**
   * Retourne (et crée si besoin) le dossier `{dataRoot}/templates` writable du poste.
   * Utilise la première racine de `getDataRootCandidates` (plus de fichier `.db`).
   *
   * @returns {string} Chemin absolu du répertoire templates.
   * @throws {Error} Si aucune racine données n'est disponible.
   */
  function resolveWritableTemplatesDirectory() {
    const roots = getDataRootCandidates();
    const dataRoot = roots[0];
    if (!dataRoot) {
      throw new Error("Aucun dossier de données disponible pour les modèles documentaires.");
    }
    const dir = path.join(dataRoot, "templates");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Liste les modèles intégrés et personnalisés pour l'écran Paramètres → Modèles documentaires.
   *
   * Inclut pour chaque entrée : existence sur disque, chemin résolu, chemin d'installation cible.
   * Les `.docx` temporaires Word (`~$...`) sont ignorés.
   *
   * @returns {{
   *   templates: Array<object>,
   *   writableTemplatesDir: string|null
   * }}
   */
  function listDocumentTemplatesPayload() {
    const builtins = [
      { kind: "builtin", templateKey: "main-courante", title: "Main courante — export Word", fileName: "main-courante-template.docx", helpId: "main-courante" },
      { kind: "builtin", templateKey: "intervention", title: "Intervention — export Word", fileName: "intervention-template.docx", helpId: "intervention" },
      { kind: "builtin", templateKey: "ronde", title: "Ronde contractuelle — modèle par défaut (.docx)", fileName: "ronde-template.docx", helpId: "ronde" },
      { kind: "builtin", templateKey: "gardiennage", title: "Gardiennage — export Word", fileName: "gardiennage-template.docx", helpId: "gardiennage" }
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
      templates.push({
        ...b,
        resolvedPath,
        exists: Boolean(resolvedPath),
        targetInstallPath: writableDir ? path.join(writableDir, b.fileName) : null
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
            title: customTemplateTitle(f, helpId),
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
   * Copie un fichier `.docx` choisi par l'utilisateur vers le dossier templates writable (remplacement par nom).
   *
   * RBAC : `ensureDataReaderRole`. Audit : `DATA_DOCUMENT_TEMPLATE_INSTALL`.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.requesterUsername
   * @param {string} payload.targetFileName - Nom cible sous `templates/` (doit finir par `.docx`).
   * @returns {Promise<{ canceled: boolean, success: boolean, fileName?: string, resolvedPath?: string, templatesRelativePath?: string }>}
   */
  async function installDocumentTemplateCopy(payload) {
    ensureStore();
    const userStore = getUserStore();
    const { requesterRole, requesterUsername, targetFileName } = payload;
    userStore.ensureDataReaderRole(requesterRole);
    const safeName = path.basename(String(targetFileName || "").trim());
    if (!safeName.toLowerCase().endsWith(".docx")) {
      throw new Error("Le nom cible doit se terminer par .docx.");
    }
    const result = await dialog.showOpenDialog({
      title: "Choisir un fichier modèle Word (.docx)",
      properties: ["openFile"],
      filters: [
        { name: "Document Word", extensions: ["docx"] },
        { name: "Tous les fichiers", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, success: false };
    }
    const src = result.filePaths[0];
    if (path.extname(src).toLowerCase() !== ".docx") {
      throw new Error("Le fichier doit être au format .docx.");
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
      templatesRelativePath: path.join("data", "templates", safeName)
    };
  }

  /**
   * Enregistre un modèle Word scopé (nom dérivé du flux/portée) et crée l'assignation en base.
   *
   * RBAC : `ensureDataManagerRole`. Persiste via `userStore.upsertTemplateAssignment`.
   *
   * @param {object} payload
   * @param {string} payload.requesterRole
   * @param {string} payload.requesterUsername
   * @param {string} payload.flowKind
   * @param {string} payload.scopeKind
   * @param {string} payload.scopeValue - Identifiant technique de portée (stocké en BDD, non affiché UI export).
   * @param {string} payload.scopeLabel - Libellé métier obligatoire pour le nom de fichier.
   * @returns {Promise<{ canceled: boolean, success: boolean, fileName?: string, assignment?: object, templatesRelativePath?: string }>}
   * @throws {Error} Libellé vide ou fichier non `.docx`.
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
    const result = await dialog.showOpenDialog({
      title: "Choisir un modèle Word (.docx)",
      properties: ["openFile"],
      filters: [
        { name: "Document Word", extensions: ["docx"] },
        { name: "Tous les fichiers", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, success: false };
    }
    const src = result.filePaths[0];
    if (path.extname(src).toLowerCase() !== ".docx") {
      throw new Error("Le fichier doit être au format .docx.");
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
      templatesRelativePath: path.join("data", "templates", fileName)
    };
  }

  return {
    getDocumentTemplate,
    listDocumentTemplatesPayload,
    installDocumentTemplateCopy,
    upsertScopedDocumentTemplate,
    resolveWritableTemplatesDirectory
  };
}

module.exports = {
  createDocumentTemplatesService
};
