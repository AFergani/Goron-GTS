/**
 * Création et comportement de la fenêtre principale Electron (géométrie persistée, CSP prod, DevTools, tray).
 * Gère le chargement Vite en dev ou `dist/index.html` en production, le menu contextuel et la fermeture
 * (croix → événement renderer `app:requestExitChoice` sauf quit explicite).
 *
 * Instancié dans `main.js` ; `createWindow()` appelé dans `app.whenReady`.
 */

/**
 * Fabrique le service de fenêtre principale.
 *
 * @param {object} deps
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow
 * @param {typeof import('electron').Menu} deps.Menu - Menu contextuel clic droit.
 * @param {import('path')} deps.path
 * @param {boolean} deps.isDev - Charge `localhost:5173` et ouvre DevTools au démarrage si vrai.
 * @param {() => object} deps.readAppConfig - Lit `windowBounds` / `windowMaximized`.
 * @param {(config: object) => void} deps.writeAppConfig - Persiste géométrie sur move/resize/close.
 * @param {() => void} deps.setupTrayIfNeeded - Initialise le tray après création fenêtre (`trayService`).
 * @param {() => boolean} deps.getIsDevToolsAllowed - `true` en dev ou si switch admin DevTools actif.
 * @param {() => boolean} deps.getIsAppQuitting - Distingue fermeture réelle (tray Quitter) de la croix.
 * @param {(win: import('electron').BrowserWindow) => void} deps.setMainWindow - Enregistre la référence globale `mainWindow`.
 * @param {string} deps.baseDirname - Répertoire `electron/` (`preload.js`, icône, dist).
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
    setupTrayIfNeeded,
    getIsDevToolsAllowed,
    getIsAppQuitting,
    setMainWindow,
    baseDirname
  } = deps;

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
    const windowIconPath = path.join(baseDirname, "app-icon.ico");
    const win = new BrowserWindow({
      width: Number(savedBounds?.width) > 0 ? Number(savedBounds.width) : 1200,
      height: Number(savedBounds?.height) > 0 ? Number(savedBounds.height) : 800,
      x: Number.isFinite(savedBounds?.x) ? Number(savedBounds.x) : undefined,
      y: Number.isFinite(savedBounds?.y) ? Number(savedBounds.y) : undefined,
      icon: windowIconPath,
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

    if (isDev) {
      win.loadURL("http://localhost:5173");
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
      // Sortie réelle (IPC Quitter / tray) : laisser fermer la fenêtre.
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
    setupTrayIfNeeded();
    return win;
  }

  return {
    createWindow
  };
}

module.exports = {
  createWindowService
};
