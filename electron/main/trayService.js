/**
 * Icône de zone de notification (tray) — optionnelle, désactivée en V1 PostgreSQL.
 *
 * Le mode « rester en arrière-plan » (Master/Backup writer) n'existe plus :
 * `shouldEnableTrayBackgroundMode` renvoie toujours `false`.
 *
 * Instancié dans `main.js` ; utilisé par `windowService.js` et `ipcSystemHandlers.js` (`system:minimizeApp`).
 */

const { resolveAppIconPath } = require("./resolveAppIconPath");

/**
 * Fabrique le service tray Electron.
 *
 * @param {object} deps
 * @param {import('path')} deps.path - Résolution du chemin `app-icon.ico`.
 * @param {import('electron').App} deps.app - `quit()` depuis le menu contextuel.
 * @param {typeof import('electron').Tray} deps.Tray - Constructeur icône tray.
 * @param {typeof import('electron').Menu} deps.Menu - Menu contextuel tray.
 * @param {string} deps.iconDirname - Répertoire des assets (`__dirname` de main).
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow - Fenêtre principale à afficher/masquer.
 * @param {(value: boolean) => void} deps.setIsAppQuitting - Flag pour quitter proprement.
 * @returns {{
 *   shouldEnableTrayBackgroundMode: () => boolean,
 *   ensureAppTray: () => import('electron').Tray,
 *   refreshTrayMenu: () => void,
 *   setupTrayIfNeeded: () => void
 * }}
 */
function createTrayService(deps) {
  const { path, app, Tray, Menu, iconDirname, getMainWindow, setIsAppQuitting } = deps;
  let appTray = null;

  /**
   * Mode tray arrière-plan : désactivé (plus de writer Master/Backup).
   *
   * @returns {boolean}
   */
  function shouldEnableTrayBackgroundMode() {
    return false;
  }

  /**
   * Crée l'instance `Tray` une seule fois (icône `app-icon.ico`, double-clic pour rouvrir la fenêtre).
   *
   * @returns {import('electron').Tray}
   */
  function ensureAppTray() {
    if (appTray) return appTray;
    const trayIconPath = resolveAppIconPath(iconDirname);
    if (!trayIconPath) {
      throw new Error("Icône tray introuvable : placez app-icon.ico ou app-icon.png dans electron/.");
    }
    appTray = new Tray(trayIconPath);
    appTray.on("double-click", () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    });
    return appTray;
  }

  /**
   * Met à jour l'infobulle et le menu contextuel.
   *
   * @returns {void}
   */
  function refreshTrayMenu() {
    if (!appTray) return;
    appTray.setToolTip("Goron GTS");
    const menu = Menu.buildFromTemplate([
      {
        label: "Ouvrir Goron GTS",
        click: () => {
          const mainWindow = getMainWindow();
          if (!mainWindow) return;
          mainWindow.show();
          mainWindow.focus();
        }
      },
      {
        label: "Quitter",
        click: () => {
          setIsAppQuitting(true);
          app.quit();
        }
      }
    ]);
    appTray.setContextMenu(menu);
  }

  /**
   * Active ou désactive le tray selon `shouldEnableTrayBackgroundMode`.
   *
   * @returns {void}
   */
  function setupTrayIfNeeded() {
    if (!shouldEnableTrayBackgroundMode()) {
      if (appTray) {
        appTray.destroy();
        appTray = null;
      }
      return;
    }
    ensureAppTray();
    refreshTrayMenu();
  }

  return {
    shouldEnableTrayBackgroundMode,
    ensureAppTray,
    refreshTrayMenu,
    setupTrayIfNeeded
  };
}

module.exports = {
  createTrayService
};
