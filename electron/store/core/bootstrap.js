/**
 * Initialisation transverse du `UserStore` : résolution du code d'accès administrateur (profil DEV)
 * avant ouverture de la base SQLite.
 *
 * Délègue la lecture des fichiers à `adminAccess.js` ; ne crée pas la connexion base.
 */

const path = require("node:path");
const { readAdminMasterCode, readEncryptedAdminCode, ADMIN_ENC_FILE_NAME } = require("./adminAccess");

/**
 * Détermine si l'accès administrateur local est actif et fournit le code maître associé.
 *
 * Ordre de priorité :
 * 1. Fichier chiffré `{userData}/gts-admin.enc` (DPAPI / `safeStorage`) ;
 * 2. Fichier legacy `data/acces_admin.env` (chemins selon `isPackaged`).
 *
 * @param {object} [options]
 * @param {boolean} [options.isPackaged=false] - Transmis à `readAdminMasterCode` (recherche élargie en prod packagée).
 * @returns {{
 *   devMasterCode: string|null,
 *   adminAccessSourcePath: string|null,
 *   adminAccessEnabled: boolean
 * }}
 *   `adminAccessEnabled: true` si un code utilisable est trouvé (chiffré ou .env avec clé reconnue).
 */
function resolveAdminAccess(options = {}) {
  // Priorité 1 : fichier chiffré DPAPI (safeStorage).
  let encFilePath = null;
  try {
    const { app } = require("electron");
    encFilePath = path.join(app.getPath("userData"), ADMIN_ENC_FILE_NAME);
  } catch {
    // hors Electron (tests)
  }
  const encryptedCode = encFilePath ? readEncryptedAdminCode(encFilePath) : null;
  if (encryptedCode) {
    return {
      devMasterCode: encryptedCode,
      adminAccessSourcePath: encFilePath,
      adminAccessEnabled: true
    };
  }

  // Priorité 2 : fichier .env en clair (rétrocompatibilité).
  const { code, sourcePath, exists } = readAdminMasterCode({
    isPackaged: Boolean(options.isPackaged)
  });
  return {
    devMasterCode: code,
    adminAccessSourcePath: sourcePath,
    adminAccessEnabled: exists && Boolean(code)
  };
}

module.exports = {
  resolveAdminAccess
};
