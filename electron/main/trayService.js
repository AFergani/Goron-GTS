/**
 * Icône de zone de notification (tray) pour les postes writer Master ou Backup.
 * Permet de masquer la fenêtre principale tout en gardant l'application active (minimize → hide + tray).
 *
 * Instancié dans `main.js` ; utilisé par `windowService.js`, `writerRuntime.js` (refresh après bascule rôle)
 * et `ipcSystemHandlers.js` (`system:minimizeApp`).
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
 * @param {() => object} deps.getWriterRuntime - Rôle writer courant (`master` | `backup` | `client`).
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow - Fenêtre principale à afficher/masquer.
 * @param {(value: boolean) => void} deps.setIsAppQuitting - Flag pour quitter proprement (évite minimize→tray au shutdown).
 * @returns {{
 *   shouldEnableTrayBackgroundMode: () => boolean,
 *   ensureAppTray: () => import('electron').Tray,
 *   refreshTrayMenu: () => void,
 *   setupTrayIfNeeded: () => void
 * }}
 */
function createTrayService(deps) {
  const { path, app, Tray, Menu, iconDirname, getWriterRuntime, getMainWindow, setIsAppQuitting } = deps;
  let appTray = null;

  /**
   * Indique si le mode « application en arrière-plan via tray » doit être actif.
   *
   * Uniquement lorsque le writer est activé et que le poste est Master ou Backup (pas les clients).
   *
   * @returns {boolean}
   */
  function shouldEnableTrayBackgroundMode() {
    const writerRuntime = getWriterRuntime();
    return writerRuntime.enabled && (writerRuntime.role === "master" || writerRuntime.role === "backup");
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
   * Met à jour l'infobulle et le menu contextuel selon le rôle writer (Master / Backup / Client).
   *
   * Entrées : « Ouvrir Goron GTS », « Quitter » (pose `isAppQuitting` avant `app.quit()`).
   *
   * @returns {void} No-op si le tray n'a pas encore été créé.
   */
  function refreshTrayMenu() {
    if (!appTray) return;
    const writerRuntime = getWriterRuntime();
    const roleLabel = writerRuntime.role === "master" ? "Master" : writerRuntime.role === "backup" ? "Backup" : "Client";
    appTray.setToolTip(`Goron GTS - Writer ${roleLabel}`);
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
   * Si le mode n'est plus requis (ex. client writer), détruit l'icône tray existante.
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
