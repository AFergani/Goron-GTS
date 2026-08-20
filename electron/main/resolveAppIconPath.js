/**
 * Résout le chemin de l'icône de fenêtre (`.ico` ou `.png` dans `electron/`).
 *
 * Utilisé par `windowService.js`.
 *
 * @module electron/main/resolveAppIconPath
 */

const fs = require("fs");
const path = require("path");

/**
 * Retourne le premier fichier icône trouvé dans le dossier Electron.
 *
 * @param {string} iconDirname - Répertoire `electron/` (`__dirname` de `main.js`).
 * @returns {string|null} Chemin absolu, ou `null` si aucun fichier n'existe.
 */
function resolveAppIconPath(iconDirname) {
  const dir = String(iconDirname || "").trim();
  if (!dir) return null;
  for (const name of ["app-icon.ico", "app-icon.png"]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

module.exports = { resolveAppIconPath };
