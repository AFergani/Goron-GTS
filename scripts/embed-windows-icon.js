/**
 * Hook electron-builder `afterPack` : intègre l'icône dans l'exe applicatif
 * AVANT la création des bundles portable / NSIS.
 *
 * Ne jamais patcher les installateurs NSIS après coup : cela casse leur CRC intégré.
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const iconPath = path.join(rootDir, "electron", "app-icon.ico");

/**
 * @param {import("app-builder-lib").AfterPackContext} context
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Icone Windows introuvable: ${iconPath}`);
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    throw new Error(`Executable applicatif introuvable pour l'icone: ${exePath}`);
  }

  const { rcedit } = await import("rcedit");
  console.log(`▶ Icone barre des taches (avant packaging): ${exeName}`);
  await rcedit(exePath, { icon: iconPath });
};
