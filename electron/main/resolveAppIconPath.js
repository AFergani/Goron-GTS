/**
 * Résout le chemin de l'icône fenêtre / tray (`.ico` ou `.png` dans `electron/`).
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {string} iconDirname - Répertoire `electron/` (`__dirname` de main).
 * @returns {string|null} Chemin absolu ou `null` si aucun fichier trouvé.
 */
function resolveAppIconPath(iconDirname) {
  const candidates = ["app-icon.ico", "app-icon.png"];
  for (const name of candidates) {
    const candidate = path.join(iconDirname, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

module.exports = { resolveAppIconPath };
