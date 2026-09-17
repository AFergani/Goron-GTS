#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");

const args = process.argv.slice(2);
const wantsNoBump = args.includes("--no-bump");
const wantsReinstallDeps = args.includes("--reinstall-deps");

const bumpArg = args.find((arg) => ["major", "minor", "patch"].includes(arg));
const bumpType = wantsNoBump ? null : bumpArg || "patch";

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function writePackageJson(content) {
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

function writePackageLockVersion(newVersion) {
  if (!fs.existsSync(packageLockPath)) return;

  const lock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
  lock.version = newVersion;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = newVersion;
  }
  fs.writeFileSync(packageLockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

function incrementSemver(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Version invalide "${version}". Format attendu: X.Y.Z`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Indique si l’erreur vient d’un fichier / dossier encore ouvert sous Windows.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isFsLockError(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY" || code === "EACCES";
}

/**
 * Pause synchrone (retries Windows).
 *
 * @param {number} ms
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Supprime un chemin avec plusieurs tentatives (exe lancé, Explorateur, fichier ouvert).
 *
 * @param {string} target - Dossier ou fichier.
 * @returns {boolean} `true` si le chemin n’existe plus.
 */
function removePathWithRetries(target) {
  if (!fs.existsSync(target)) return true;
  const attempts = [0, 300, 800, 2000];
  let lastError = null;
  for (const delay of attempts) {
    if (delay) sleepSync(delay);
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
      return true;
    } catch (error) {
      lastError = error;
      if (!isFsLockError(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  return false;
}

/**
 * Vide un dossier de release : suppression complète, sinon contenu enfant par enfant.
 *
 * @param {string} target - Dossier à recréer vide.
 * @param {string} label - Nom affiché dans les logs / erreurs.
 */
function ensureEmptyDirectory(target, label) {
  const displayName = label || path.basename(target);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    return;
  }
  try {
    removePathWithRetries(target);
    fs.mkdirSync(target, { recursive: true });
    return;
  } catch (error) {
    if (!isFsLockError(error)) throw error;
  }

  const leftover = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    try {
      removePathWithRetries(child);
    } catch (error) {
      if (isFsLockError(error)) leftover.push(entry.name);
      else throw error;
    }
  }
  if (leftover.length) {
    throw new Error(
      [
        `Impossible de vider "${displayName}" (permission refusée).`,
        `Éléments encore verrouillés : ${leftover.join(", ")}`,
        "Fermez Goron GTS s'il tourne depuis ce dossier, fermez l'Explorateur Windows dessus,",
        "fermez les fichiers ouverts dans Cursor, puis relancez la commande."
      ].join("\n")
    );
  }
  fs.mkdirSync(target, { recursive: true });
}

/**
 * Crée un dossier vide. Si le chemin préféré est verrouillé, suffixe un horodatage.
 *
 * @param {string} preferredPath
 * @returns {string} Chemin réellement créé.
 */
function createFreshDirectory(preferredPath) {
  if (fs.existsSync(preferredPath)) {
    try {
      removePathWithRetries(preferredPath);
    } catch (error) {
      if (!isFsLockError(error)) throw error;
      const fallback = `${preferredPath}-${Date.now()}`;
      fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    }
  }
  fs.mkdirSync(preferredPath, { recursive: true });
  return preferredPath;
}

/**
 * Arrête Goron GTS qui a encore des DLL chargées depuis le pack
 * (l’Explorateur peut être fermé : l’appli suffit à verrouiller `folder`).
 * Ne touche pas à `electron.exe` du `npm run dev`.
 *
 * @param {string} releaseDir - Ancien dossier de release.
 */
function stopAppsLockingReleaseDir(releaseDir) {
  if (process.platform !== "win32") return;
  if (!fs.existsSync(releaseDir)) return;
  const ps = [
    "$root = $env:GTS_RELEASE_LOCK_DIR",
    "if (-not $root) { return }",
    "Get-Process | ForEach-Object {",
    "  $p = $_",
    "  if ($p.ProcessName -notlike '*Goron*') { return }",
    "  try {",
    "    $hit = $p.Modules | Where-Object { $_.FileName -and $_.FileName.StartsWith($root, $true, $null) } | Select-Object -First 1",
    "    if ($hit) {",
    "      Write-Output ('STOP ' + $p.Id + ' ' + $p.ProcessName)",
    "      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue",
    "    }",
    "  } catch {}",
    "}"
  ].join(" ");
  try {
    const out = execSync("powershell.exe -NoProfile -ExecutionPolicy Bypass -Command " + JSON.stringify(ps), {
      encoding: "utf8",
      env: { ...process.env, GTS_RELEASE_LOCK_DIR: releaseDir },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const text = String(out || "").trim();
    if (text) {
      console.log("🔓 Goron GTS était encore chargé depuis l'ancien pack (DLL verrouillées). Arrêt :");
      console.log(text);
      sleepSync(1500);
    }
  } catch {
    /* pas de droits sur les modules : on tentera quand même le rename */
  }
}

/**
 * Essaie de remplacer le pack canonique par le staging. Si l’ancien est verrouillé,
 * le staging reste le dossier livrable.
 *
 * @param {string} stagingDir
 * @param {string} canonicalDir
 * @returns {string} Dossier à communiquer à l’utilisateur.
 */
function promoteStagedRelease(stagingDir, canonicalDir) {
  if (path.resolve(stagingDir) === path.resolve(canonicalDir)) return canonicalDir;

  stopAppsLockingReleaseDir(canonicalDir);

  if (fs.existsSync(canonicalDir)) {
    let parked = `${canonicalDir}.ancien`;
    if (fs.existsSync(parked)) parked = `${parked}-${Date.now()}`;
    try {
      removePathWithRetries(canonicalDir);
    } catch (error) {
      if (!isFsLockError(error)) throw error;
      try {
        fs.renameSync(canonicalDir, parked);
        console.log(`📦 Ancien pack déplacé: ${path.basename(parked)}`);
      } catch (renameError) {
        if (!isFsLockError(renameError)) throw renameError;
        console.log(`⚠️ Pack précédent verrouillé conservé: ${path.basename(canonicalDir)}`);
        console.log("   Cause fréquente : Goron GTS encore ouvert (même sans Explorateur).");
        console.log(`   Nouveau pack (à utiliser): ${path.basename(stagingDir)}`);
        return stagingDir;
      }
    }
  }

  try {
    fs.renameSync(stagingDir, canonicalDir);
    return canonicalDir;
  } catch (error) {
    if (!isFsLockError(error)) throw error;
    console.log(`⚠️ Impossible de renommer le staging. Pack à utiliser: ${path.basename(stagingDir)}`);
    return stagingDir;
  }
}

function cleanArtifacts() {
  const folders = ["dist", "release-build"];
  for (const folder of folders) {
    const target = path.join(rootDir, folder);
    if (fs.existsSync(target)) {
      try {
        removePathWithRetries(target);
        console.log(`🧹 Dossier supprimé: ${folder}`);
      } catch (error) {
        if (isFsLockError(error)) {
          console.log(`⚠️ Dossier verrouillé, nettoyage ignoré: ${folder}`);
          continue;
        }
        throw error;
      }
    }
  }
}

function bumpVersionIfNeeded() {
  const pkg = readPackageJson();
  const oldVersion = pkg.version;

  if (!bumpType) {
    console.log(`🔒 Version conservée: ${oldVersion}`);
    return oldVersion;
  }

  const newVersion = incrementSemver(oldVersion, bumpType);
  pkg.version = newVersion;
  writePackageJson(pkg);
  writePackageLockVersion(newVersion);
  console.log(`🔢 Version mise à jour: ${oldVersion} -> ${newVersion}`);
  return newVersion;
}

function run(command, label) {
  console.log(`\n▶ ${label}`);
  execSync(command, { cwd: rootDir, stdio: "inherit" });
}

function assertMainCouranteTemplateExists(relativePath, contextLabel) {
  const templatePath = path.join(rootDir, ...relativePath.split("/"));
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      [
        `Template Word manquant (${contextLabel}): ${relativePath}`,
        "Ajoutez le modele avant de lancer la release pour eviter un export Main courante en mode degrade."
      ].join("\n")
    );
  }
  console.log(`✅ Template Word detecte (${contextLabel}): ${relativePath}`);
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function pickPortableExe(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Dossier de build portable introuvable: ${sourceDir}`);
  }
  const candidates = fs
    .readdirSync(sourceDir)
    .filter((name) => /^Goron GTS .*\.exe$/i.test(name) && !/setup/i.test(name))
    .sort((a, b) => b.localeCompare(a));
  if (!candidates.length) {
    throw new Error("Aucun executable portable trouvé dans release-portable.");
  }
  return path.join(sourceDir, candidates[0]);
}

function pickInstallerExe(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Dossier de build installer introuvable: ${sourceDir}`);
  }
  const candidates = fs
    .readdirSync(sourceDir)
    .filter((name) => /setup.*\.exe$/i.test(name))
    .sort((a, b) => b.localeCompare(a));
  if (!candidates.length) {
    throw new Error("Aucun installateur trouvé dans release-build.");
  }
  return path.join(sourceDir, candidates[0]);
}

function pickUnpackedExe(sourceDir) {
  const executablePath = path.join(sourceDir, "win-unpacked", "Goron GTS.exe");
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Version dossier (win-unpacked) introuvable: ${executablePath}`);
  }
  return executablePath;
}

function preparePortableReleaseBundle(version, sourceExePath, releaseRootDir) {
  const targetDir = path.join(releaseRootDir, "portable");
  const dataDir = path.join(targetDir, "data");
  const templatesDir = path.join(dataDir, "templates");
  const targetExe = path.join(targetDir, `Goron GTS ${version}.exe`);

  if (!fs.existsSync(sourceExePath)) {
    throw new Error(`Executable portable introuvable: ${sourceExePath}`);
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  ensureEmptyDirectory(targetDir, "portable");
  fs.copyFileSync(sourceExePath, targetExe);

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  copyDirectoryRecursive(path.join(rootDir, "dist", "templates"), templatesDir);

  const deployReadmePath = path.join(targetDir, "LISEZ-MOI-DEPLOIEMENT.txt");
  fs.writeFileSync(
    deployReadmePath,
    [
      "Goron GTS — Déploiement portable (sans installateur)",
      "Version " + version,
      "",
      "=== Architecture ===",
      "- Chaque poste exécute Goron GTS et se connecte à un serveur PostgreSQL",
      "  (PC H24 ou VM) sur le LAN. Plus de fichier base .db partagé, plus de writer SMB.",
      "- Les opérateurs se connectent avec leur profil Goron-GTS (nom affiché / mot de passe).",
      "- Un compte technique PostgreSQL unique est configuré une fois par poste (écran",
      "  « Initialisation GTS » au premier lancement, puis Paramètres pour un admin).",
      "",
      "=== Contenu du dossier portable ===",
      "  Goron GTS " + version + ".exe",
      "  LISEZ-MOI-DEPLOIEMENT.txt   (ce fichier)",
      "  data/",
      "    templates/               modèles Word (.docx)",
      "    logs/                    (réservé)",
      "",
      "=== Premier lancement (chaque poste) ===",
      "1. Copier ce dossier en local sur le PC (éviter l'exécution depuis un partage SMB).",
      "2. S'assurer que le serveur PostgreSQL est joignable (port 5432, pare-feu OK).",
      "3. Lancer l'exécutable.",
      "4. Si aucune config PG n'est connue : écran « Initialisation GTS »",
      "   — saisir hôte (ex. 192.168.x.x ou 127.0.0.1), port, base, utilisateur, mot de passe",
      "   — Tester la connexion, puis Enregistrer.",
      "5. Se connecter avec un compte Goron-GTS (Admin / profil métier).",
      "",
      "=== Poste serveur PostgreSQL (rappel) ===",
      "- Service PostgreSQL démarré automatiquement (ou Docker labo).",
      "- Compte technique (ex. goron_gts_app) + base (ex. goron_gts).",
      "- Pare-feu : TCP 5432 ouvert vers les postes station uniquement.",
      "",
      "=== Panne / badge ===",
      "- Badge « Base inaccessible » dans l'appli si PostgreSQL est down.",
      "- Pas d'écriture possible tant que le serveur est injoignable (comportement voulu).",
      "- Journal local des pertes/reprises PG (par poste) :",
      "  %APPDATA%\\goron-gts\\gts-pg-events.log",
      "",
      "=== Notes techniques ===",
      "- Cet exécutable portable se décompresse temporairement à l'exécution (normal).",
      "- Aucun raccourci n'est généré automatiquement ; créez-en un si besoin.",
      "- Les modèles Word personnalisés : dossier data/templates/ à côté de l'exe",
      "  (ou selon la racine data du poste)."
    ].join("\n"),
    "utf8"
  );

  console.log(`📦 Bundle portable prêt: ${targetDir}`);
  console.log(`   - EXE: ${path.basename(targetExe)}`);
  console.log("   - Data: data/ (templates + logs) — métier = PostgreSQL distant");
}

function prepareInstallerReleaseBundle(version, sourceInstallerPath, releaseRootDir) {
  const targetDir = path.join(releaseRootDir, "installer");
  if (!fs.existsSync(sourceInstallerPath)) {
    throw new Error(`Installateur introuvable: ${sourceInstallerPath}`);
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  ensureEmptyDirectory(targetDir, "installer");
  const targetInstaller = path.join(targetDir, path.basename(sourceInstallerPath));
  fs.copyFileSync(sourceInstallerPath, targetInstaller);
  console.log(`📦 Bundle installateur prêt: ${targetDir}`);
  console.log(`   - Setup: ${path.basename(targetInstaller)}`);
}

function prepareFolderReleaseBundle(version, sourceUnpackedExePath, releaseRootDir) {
  const sourceDir = path.dirname(sourceUnpackedExePath);
  const targetDir = path.join(releaseRootDir, "folder");
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  ensureEmptyDirectory(targetDir, "folder");
  copyDirectoryRecursive(sourceDir, targetDir);

  const readmePath = path.join(targetDir, "LISEZ-MOI-MODE-DOSSIER.txt");
  fs.writeFileSync(
    readmePath,
    [
      "Goron GTS — Mode dossier (exe + resources à côté)",
      "Version " + version,
      "",
      "=== Usage ===",
      "- Cette version contient Goron GTS.exe + le dossier resources/ (non empaqueté).",
      "- À utiliser en copie locale sur chaque poste.",
      "- Éviter l'exécution directe depuis un partage SMB.",
      "",
      "=== Contenu attendu ===",
      "  Goron GTS.exe",
      "  LISEZ-MOI-MODE-DOSSIER.txt",
      "  resources/",
      "  locales/",
      "  chrome_*.pak",
      "  … (DLL / pak Electron)",
      "",
      "=== Base de données ===",
      "- Le métier est sur PostgreSQL (connexion directe), pas un fichier .db local.",
      "- Au premier lancement : configurer le serveur PG (écran Initialisation GTS).",
      "- Procédure détaillée : voir LISEZ-MOI-DEPLOIEMENT.txt du bundle portable.",
      "",
      "=== Journal technique local (perte PG) ===",
      "  %APPDATA%\\goron-gts\\gts-pg-events.log"
    ].join("\n"),
    "utf8"
  );
  console.log(`📦 Bundle dossier (exe + resources) prêt: ${targetDir}`);
}

/**
 * Copie les scripts labo et le schéma SQL dans la release (reset PG sans le dépôt source).
 *
 * @param {string} releaseRootDir - `Release_Goron-GTS-x.y.z`
 */
function prepareLaboToolsBundle(releaseRootDir) {
  const sourceDir = path.join(rootDir, "outils_labo");
  const schemaSrc = path.join(rootDir, "electron", "store", "persistence", "migrations", "schema.sql");
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Dossier outils labo introuvable: ${sourceDir}`);
  }
  if (!fs.existsSync(schemaSrc)) {
    throw new Error(`schema.sql introuvable: ${schemaSrc}`);
  }
  const targetDir = path.join(releaseRootDir, "outils_labo");
  ensureEmptyDirectory(targetDir, "outils_labo");
  copyDirectoryRecursive(sourceDir, targetDir);
  fs.copyFileSync(schemaSrc, path.join(targetDir, "schema.sql"));
  console.log(`📦 Outils labo prêts: ${targetDir}`);
  console.log("   - Scripts PowerShell + schema.sql (reset base sans le dépôt)");
}

/**
 * Guide unique de création d’environnement labo (sans recopier Demo_Travail).
 *
 * @param {string} version - Version semver de la release.
 * @param {string} releaseRootDir - `Release_Goron-GTS-x.y.z`
 */
function prepareLaboEnvironmentGuide(version, releaseRootDir) {
  const templatePath = path.join(rootDir, "scripts", "release-00-LIRE-EN-PREMIER.txt");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Guide labo introuvable: ${templatePath}`);
  }
  const body = fs.readFileSync(templatePath, "utf8").split("{{VERSION}}").join(version);
  const targetPath = path.join(releaseRootDir, "00-LIRE-EN-PREMIER.txt");
  fs.writeFileSync(targetPath, body, "utf8");
  console.log(`📦 Guide environnement labo: ${path.basename(targetPath)}`);
}

function main() {
  console.log("🚀 Release Windows multi-format (portable + installateur + dossier)");
  console.log(`📁 Projet: ${rootDir}`);

  cleanArtifacts();
  assertMainCouranteTemplateExists("public/templates/main-courante-template.docx", "source");
  const releaseVersion = bumpVersionIfNeeded();

  if (wantsReinstallDeps) {
    run("npm ci", "Réinstallation propre des dépendances");
  }

  run("npm run dist:win:all", "Build Electron Windows (portable + nsis + dossier)");
  assertMainCouranteTemplateExists("dist/templates/main-courante-template.docx", "vite-dist");
  const buildOutputDir = path.join(rootDir, "release-build");
  const canonicalReleaseDir = path.join(rootDir, `Release_Goron-GTS-${releaseVersion}`);
  const stagingReleaseDir = createFreshDirectory(`${canonicalReleaseDir}.__staging`);
  const portableExePath = pickPortableExe(buildOutputDir);
  const installerExePath = pickInstallerExe(buildOutputDir);
  const unpackedExePath = pickUnpackedExe(buildOutputDir);
  preparePortableReleaseBundle(releaseVersion, portableExePath, stagingReleaseDir);
  prepareInstallerReleaseBundle(releaseVersion, installerExePath, stagingReleaseDir);
  prepareFolderReleaseBundle(releaseVersion, unpackedExePath, stagingReleaseDir);
  prepareLaboToolsBundle(stagingReleaseDir);
  prepareLaboEnvironmentGuide(releaseVersion, stagingReleaseDir);
  const releaseRootDir = promoteStagedRelease(stagingReleaseDir, canonicalReleaseDir);

  // Nettoyage final des artefacts temporaires de build.
  for (const folder of ["release-build", "dist"]) {
    const target = path.join(rootDir, folder);
    if (!fs.existsSync(target)) continue;
    try {
      removePathWithRetries(target);
      console.log(`🧹 Nettoyage final: ${folder}`);
    } catch (error) {
      if (isFsLockError(error)) {
        console.log(`⚠️ Nettoyage final ignoré (dossier verrouillé): ${folder}`);
        continue;
      }
      throw error;
    }
  }

  console.log(`\n✅ Release multi-format terminée (version ${releaseVersion})`);
  console.log(`   - Dossier racine: ${path.basename(releaseRootDir)}/`);
  console.log("   - Portable: portable/");
  console.log("   - Installateur: installer/");
  console.log("   - Dossier exe+resources: folder/");
  console.log("   - Outils labo + schema.sql: outils_labo/");
  console.log("   - Guide labo: 00-LIRE-EN-PREMIER.txt");
}

main();
