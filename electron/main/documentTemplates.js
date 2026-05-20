function createDocumentTemplatesService(deps) {
  const {
    fs,
    path,
    dialog,
    appDirname,
    processCwd,
    getDataRootCandidates,
    resolveDbPath,
    getDbStorageLayoutFromPath,
    ensureStore,
    getUserStore
  } = deps;

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

  function sanitizeTemplateSlug(label) {
    return sanitizeProfileLabelForWordTemplateFilename(label || "template");
  }

  function scopedTemplateFileName(flowKind, scopeKind, scopeLabel) {
    const flow = String(flowKind || "").trim().toLowerCase() || "flux";
    const scope = String(scopeKind || "").trim().toLowerCase() || "scope";
    const slug = sanitizeTemplateSlug(scopeLabel || "modele");
    return `${flow}_${scope}_${slug}.docx`;
  }

  function resolveWritableTemplatesDirectory() {
    const dbPath = resolveDbPath();
    if (!dbPath) {
      throw new Error("Base de données non configurée.");
    }
    const layout = getDbStorageLayoutFromPath(dbPath);
    const dir = path.join(layout.dataRoot, "templates");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function listDocumentTemplatesPayload() {
    const builtins = [
      { kind: "builtin", templateKey: "fransor-recap", title: "Fransor — récap mensuel (.docx)", fileName: "fransor-recap-template.docx", helpId: "fransor-recap" },
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
          templates.push({
            kind: "custom",
            templateKey: `custom:${f}`,
            title: `Modèle personnalisé (${f})`,
            fileName: f,
            helpId: "custom-docx",
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
    const assignment = userStore.upsertTemplateAssignment({
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
