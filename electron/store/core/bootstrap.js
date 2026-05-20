const path = require("node:path");
const { readAdminMasterCode, readEncryptedAdminCode, ADMIN_ENC_FILE_NAME } = require("./adminAccess");

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
