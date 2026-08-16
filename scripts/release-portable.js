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

function cleanArtifacts() {
  const folders = ["dist", "release-build"];
  for (const folder of folders) {
    const target = path.join(rootDir, folder);
    if (fs.existsSync(target)) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
        console.log(`🧹 Dossier supprimé: ${folder}`);
      } catch (error) {
        if (error && (error.code === "EPERM" || error.code === "EBUSY")) {
          console.log(`⚠️ Dossier verrouillé, nettoyage ignoré: ${folder}`);
          continue;
        }
        throw error;
      }
    }
  }
  const dynamicReleaseRoots = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^release_Goron-GTS-\d+\.\d+\.\d+$/i.test(entry.name))
    .map((entry) => path.join(rootDir, entry.name));
  for (const target of dynamicReleaseRoots) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`🧹 Dossier supprimé: ${path.basename(target)}`);
    } catch (error) {
      if (error && (error.code === "EPERM" || error.code === "EBUSY")) {
        console.log(`⚠️ Dossier verrouillé, nettoyage ignoré: ${path.basename(target)}`);
        continue;
      }
      throw error;
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
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
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
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const targetInstaller = path.join(targetDir, path.basename(sourceInstallerPath));
  fs.copyFileSync(sourceInstallerPath, targetInstaller);
  console.log(`📦 Bundle installateur prêt: ${targetDir}`);
  console.log(`   - Setup: ${path.basename(targetInstaller)}`);
}

function prepareFolderReleaseBundle(version, sourceUnpackedExePath, releaseRootDir) {
  const sourceDir = path.dirname(sourceUnpackedExePath);
  const targetDir = path.join(releaseRootDir, "folder");
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
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
  const releaseRootDir = path.join(rootDir, `Release_Goron-GTS-${releaseVersion}`);
  if (fs.existsSync(releaseRootDir)) {
    fs.rmSync(releaseRootDir, { recursive: true, force: true });
  }
  fs.mkdirSync(releaseRootDir, { recursive: true });
  const portableExePath = pickPortableExe(buildOutputDir);
  const installerExePath = pickInstallerExe(buildOutputDir);
  const unpackedExePath = pickUnpackedExe(buildOutputDir);
  preparePortableReleaseBundle(releaseVersion, portableExePath, releaseRootDir);
  prepareInstallerReleaseBundle(releaseVersion, installerExePath, releaseRootDir);
  prepareFolderReleaseBundle(releaseVersion, unpackedExePath, releaseRootDir);

  // Nettoyage final des artefacts temporaires de build.
  for (const folder of ["release-build", "dist"]) {
    const target = path.join(rootDir, folder);
    if (!fs.existsSync(target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`🧹 Nettoyage final: ${folder}`);
    } catch (error) {
      if (error && (error.code === "EPERM" || error.code === "EBUSY")) {
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
}

main();
