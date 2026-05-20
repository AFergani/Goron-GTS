function createTrayService(deps) {
  const { path, app, Tray, Menu, iconDirname, getWriterRuntime, getMainWindow, setIsAppQuitting } = deps;
  let appTray = null;

  function shouldEnableTrayBackgroundMode() {
    const writerRuntime = getWriterRuntime();
    return writerRuntime.enabled && (writerRuntime.role === "master" || writerRuntime.role === "backup");
  }

  function ensureAppTray() {
    if (appTray) return appTray;
    const trayIconPath = path.join(iconDirname, "app-icon.ico");
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
