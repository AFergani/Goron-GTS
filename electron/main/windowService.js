/**
 * Création et comportement de la fenêtre principale Electron (géométrie persistée, CSP prod, DevTools).
 * Barre de titre OS : `Goron-GTS vX.Y.Z` (version `package.json`, sans toucher à l'UI interne).
 * Gère le chargement Vite en dev ou `dist/index.html` en production, le menu contextuel et la fermeture
 * (croix → événement renderer `app:requestExitChoice` sauf quit explicite).
 *
 * Instancié dans `main.js` ; `createWindow()` appelé dans `app.whenReady`.
 */

const { resolveAppIconPath } = require("./resolveAppIconPath");

/**
 * Fabrique le service de fenêtre principale.
 *
 * @param {object} deps
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow
 * @param {typeof import('electron').Menu} deps.Menu - Menu contextuel clic droit.
 * @param {import('path')} deps.path
 * @param {boolean} deps.isDev - Charge `localhost:${DEV_PORT||5173}` et ouvre DevTools au démarrage si vrai.
 * @param {() => object} deps.readAppConfig - Lit `windowBounds` / `windowMaximized`.
 * @param {(config: object) => void} deps.writeAppConfig - Persiste géométrie sur move/resize/close.
 * @param {() => boolean} deps.getIsDevToolsAllowed - `true` en dev ou si switch admin DevTools actif.
 * @param {() => boolean} deps.getIsAppQuitting - Distingue fermeture réelle (IPC Quitter) de la croix.
 * @param {(win: import('electron').BrowserWindow) => void} deps.setMainWindow - Enregistre la référence globale `mainWindow`.
 * @param {string} deps.baseDirname - Répertoire `electron/` (`preload.js`, icône, dist).
 * @param {import('electron').App} deps.app - Version lue via `app.getVersion()` (package.json).
 * @returns {{ createWindow: () => import('electron').BrowserWindow }}
 */
function createWindowService(deps) {
  const {
    BrowserWindow,
    Menu,
    path,
    isDev,
    readAppConfig,
    writeAppConfig,
    getIsDevToolsAllowed,
    getIsAppQuitting,
    setMainWindow,
    baseDirname,
    app
  } = deps;

  /**
   * Libellé de la barre de titre Windows uniquement (`Goron-GTS vX.Y.Z`).
   * Ne s'applique pas à la sidebar, au login ni aux exports.
   *
   * @param {string} [version]
   * @returns {string}
   */
  function buildWindowTitle(version) {
    const normalized = String(version || "").trim() || "0.0.0";
    return `Goron-GTS v${normalized}`;
  }

  /**
   * Crée la fenêtre principale, branche les listeners et charge l'UI React.
   *
   * Effets de bord :
   * - Persistance `windowBounds` / `windowMaximized` dans `app-config.json` sur déplacement et redimensionnement.
   * - En production : en-tête CSP injecté sur les réponses de la session.
   * - Sur `close` sans `isAppQuitting` : `preventDefault` + IPC `app:requestExitChoice` vers le renderer.
   *
   * @returns {import('electron').BrowserWindow}
   */
  function createWindow() {
    const cfg = readAppConfig();
    const savedBounds = cfg.windowBounds && typeof cfg.windowBounds === "object" ? cfg.windowBounds : null;
    const windowIconPath = resolveAppIconPath(baseDirname);
    const windowTitle = buildWindowTitle(app && typeof app.getVersion === "function" ? app.getVersion() : "");
    const win = new BrowserWindow({
      title: windowTitle,
      width: Number(savedBounds?.width) > 0 ? Number(savedBounds.width) : 1200,
      height: Number(savedBounds?.height) > 0 ? Number(savedBounds.height) : 800,
      x: Number.isFinite(savedBounds?.x) ? Number(savedBounds.x) : undefined,
      y: Number.isFinite(savedBounds?.y) ? Number(savedBounds.y) : undefined,
      ...(windowIconPath ? { icon: windowIconPath } : {}),
      webPreferences: {
        preload: path.join(baseDirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true
      }
    });

    // Supprime la barre de menu native (File/Edit/View) dans la fenêtre principale.
    win.setMenuBarVisibility(false);
    win.setAutoHideMenuBar(true);
    // Empêche le `<title>` HTML de remplacer la barre de titre OS.
    win.on("page-title-updated", (event) => {
      event.preventDefault();
    });
    win.setTitle(windowTitle);

    if (isDev) {
      const devPort = process.env.DEV_PORT || "5173";
      win.loadURL(`http://localhost:${devPort}`);
      win.webContents.openDevTools({ mode: "detach" });
    } else {
      const cspPolicy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join("; ");
      win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = details.responseHeaders || {};
        callback({
          responseHeaders: {
            ...responseHeaders,
            "Content-Security-Policy": [cspPolicy]
          }
        });
      });
      win.loadFile(path.join(baseDirname, "..", "dist", "index.html"));
    }

    // Autorise l'ouverture des DevTools en production via Ctrl+Maj+I / F12.
    win.webContents.on("before-input-event", (event, input) => {
      const isToggleDevTools =
        input.type === "keyDown" &&
        ((input.control && input.shift && String(input.key).toUpperCase() === "I") || input.key === "F12");
      if (!isToggleDevTools) return;
      if (!getIsDevToolsAllowed || !getIsDevToolsAllowed()) return;
      event.preventDefault();
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
        return;
      }
      win.webContents.openDevTools({ mode: "detach" });
    });

    // Menu contextuel clic droit: suggestions orthographiques + inspection DevTools.
    win.webContents.on("context-menu", (_event, params) => {
      const template = [];
      const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [];
      if (params.misspelledWord && suggestions.length) {
        for (const suggestion of suggestions.slice(0, 6)) {
          template.push({
            label: suggestion,
            click: () => win.webContents.replaceMisspelling(suggestion)
          });
        }
        template.push({ type: "separator" });
      }
      if (params.misspelledWord && !suggestions.length) {
        template.push({ label: "Aucune suggestion", enabled: false });
        template.push({ type: "separator" });
      }

      template.push(
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
        { type: "separator" }
      );

      if (getIsDevToolsAllowed && getIsDevToolsAllowed()) {
        template.push(
          {
            label: "Inspecter l'élément",
            click: () => {
              if (!win.webContents.isDevToolsOpened()) {
                win.webContents.openDevTools({ mode: "detach" });
              }
              win.webContents.inspectElement(params.x, params.y);
            }
          },
          {
            label: "Ouvrir/Fermer DevTools",
            click: () => {
              if (win.webContents.isDevToolsOpened()) {
                win.webContents.closeDevTools();
                return;
              }
              win.webContents.openDevTools({ mode: "detach" });
            }
          }
        );
      }
      const contextMenu = Menu.buildFromTemplate(template);
      contextMenu.popup({ window: win });
    });

    if (cfg.windowMaximized) {
      win.maximize();
    }

    const persistWindowState = () => {
      const current = readAppConfig();
      const bounds = win.getBounds();
      writeAppConfig({
        ...current,
        windowBounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height
        },
        windowMaximized: win.isMaximized()
      });
    };

    win.on("move", persistWindowState);
    win.on("resize", persistWindowState);
    win.on("close", (event) => {
      // Sortie réelle (IPC Quitter) : laisser fermer la fenêtre.
      if (getIsAppQuitting && getIsAppQuitting()) {
        persistWindowState();
        return;
      }
      // Croix : même flux que le bouton Power — modale Minimiser / Quitter / Annuler dans le renderer.
      event.preventDefault();
      if (!win.webContents.isDestroyed()) {
        win.webContents.send("app:requestExitChoice");
      }
    });
    setMainWindow(win);
    return win;
  }

  return {
    createWindow
  };
}

module.exports = {
  createWindowService
};
