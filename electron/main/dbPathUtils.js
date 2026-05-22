/**
 * Utilitaires de chemins et de nommage pour les bases SQLite Goron-GTS (trimestres, Activedb, Archives).
 * Module pur sans effet de bord disque : les appelants passent `path` et éventuellement `fs` pour les vérifications d'existence.
 *
 * Consommé via `main.js` (wrappers + rotation trimestrielle, `resolveDbPath`), `databaseAdmin.js`,
 * `documentTemplates.js` et `ipcSystemHandlers.js`.
 */

/**
 * Calcule la clé trimestre civile au format `AAAA-Qn` (n = 1..4).
 *
 * @param {Date} [date=new Date()] - Date de référence.
 * @returns {string} Ex. `2026-Q2`.
 */
function getQuarterKey(date = new Date()) {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Supprime les segments de chemin dupliqués consécutifs (ex. `quarters/quarters/...`).
 *
 * @param {import('path')} pathModule - Module `path` Node.
 * @param {string} inputPath - Chemin brut utilisateur ou résolu.
 * @param {string} segmentName - Nom de dossier à dédoublonner (`quarters`, etc.).
 * @returns {string} Chemin normalisé ; chaîne vide si entrée vide.
 */
function normalizeRepeatedSegmentPath(pathModule, inputPath, segmentName) {
  const rawPath = String(inputPath || "").trim();
  if (!rawPath) return rawPath;
  const normalized = pathModule.normalize(rawPath);
  const parsed = pathModule.parse(normalized);
  const target = String(segmentName || "").toLowerCase();
  const parts = normalized
    .slice(parsed.root.length)
    .split(pathModule.sep)
    .filter((part) => part.length > 0);
  const resultParts = [];
  let previousWasTarget = false;
  for (const part of parts) {
    const isTarget = part.toLowerCase() === target;
    if (isTarget && previousWasTarget) {
      continue;
    }
    resultParts.push(part);
    previousWasTarget = isTarget;
  }
  return pathModule.join(parsed.root, ...resultParts);
}

/**
 * Convertit une clé trimestre `AAAA-Qn` en libellé fichier archive `AAAA-Tn`.
 *
 * @param {string} quarterKey - Clé trimestre ; si invalide, retourne la valeur d'entrée telle quelle.
 * @returns {string} Ex. `2026-T1` ou la chaîne d'origine si le format ne matche pas.
 */
function quarterKeyToArchiveLabel(quarterKey) {
  const match = /^(\d{4})-Q([1-4])$/i.exec(String(quarterKey || "").toUpperCase());
  if (!match) return String(quarterKey || "");
  return `${match[1]}-T${match[2]}`;
}

/**
 * Formate une date pour les noms de fichiers d'archive (`JJ-MM-AAAA`).
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDateForArchiveFile(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

/**
 * Dérive les bornes calendaires d'un trimestre pour le nommage `GTS-du_..._au_...`.
 *
 * @param {string} quarterKey - Format `AAAA-Qn`.
 * @returns {{ from: string, to: string }|null} Dates au format `formatDateForArchiveFile` ; `null` si clé invalide.
 */
function quarterKeyToDateRangeLabel(quarterKey) {
  const match = /^(\d{4})-Q([1-4])$/i.exec(String(quarterKey || "").toUpperCase());
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0);
  return {
    from: formatDateForArchiveFile(startDate),
    to: formatDateForArchiveFile(endDate)
  };
}

/**
 * Déduit la racine données et les dossiers `Activedb` / `Archives` à partir d'un chemin de fichier `.db`.
 *
 * Remonte l'arborescence selon que le fichier est sous `Activedb`, `Archives` ou `quarters`
 * (y compris imbrication `quarters/quarters` préalablement normalisée).
 *
 * @param {import('path')} pathModule
 * @param {string} dbPath - Chemin d'un fichier base (actif ou archive).
 * @returns {{ dataRoot: string, activeDir: string, archivesDir: string, ext: string }}
 */
function getDbStorageLayoutFromPath(pathModule, dbPath) {
  const normalizedPath = normalizeRepeatedSegmentPath(pathModule, String(dbPath || "").trim(), "quarters");
  const fileName = pathModule.basename(normalizedPath);
  const parentDir = pathModule.dirname(normalizedPath);
  const parentName = pathModule.basename(parentDir).toLowerCase();
  const parentParentDir = pathModule.dirname(parentDir);
  const parentParentName = pathModule.basename(parentParentDir).toLowerCase();

  let dataRoot = parentDir;
  if (parentName === "activedb" || parentName === "archives") {
    dataRoot = parentParentDir;
  } else if (parentName === "quarters") {
    dataRoot = parentParentDir;
  } else if (parentParentName === "activedb" || parentParentName === "archives" || parentParentName === "quarters") {
    dataRoot = pathModule.dirname(parentParentDir);
  }

  return {
    dataRoot,
    activeDir: pathModule.join(dataRoot, "Activedb"),
    archivesDir: pathModule.join(dataRoot, "Archives"),
    ext: pathModule.extname(fileName) || ".db"
  };
}

/**
 * Résout un chemin `gts-AAAA-Qn.db` imbriqué sous plusieurs dossiers `quarters` vers le chemin canonique.
 *
 * Si le fichier canonique existe sur disque, retourne ce chemin ; sinon retourne le chemin normalisé d'entrée.
 * Sans motif trimestre dans le nom de fichier, retourne le chemin normalisé sans modification structurelle.
 *
 * @param {import('path')} pathModule
 * @param {import('fs')} fsModule - Pour `existsSync` sur le candidat canonique.
 * @param {string} dbPath
 * @returns {string}
 */
function normalizeNestedQuarterDbPath(pathModule, fsModule, dbPath) {
  const rawPath = String(dbPath || "").trim();
  if (!rawPath) return rawPath;
  const normalizedPath = pathModule.normalize(rawPath);
  if (!fsModule.existsSync(normalizedPath)) return normalizedPath;
  const fileName = pathModule.basename(normalizedPath);
  const quarterMatch = /^gts-(\d{4}-Q[1-4])\.(db|sqlite|sqlite3)$/i.exec(fileName);
  if (!quarterMatch) return normalizedPath;

  const parentDir = pathModule.dirname(normalizedPath);
  const parentSegments = parentDir.split(pathModule.sep).filter(Boolean);
  const quarterIndexes = parentSegments
    .map((segment, index) => ({ segment: String(segment || "").toLowerCase(), index }))
    .filter((entry) => entry.segment === "quarters")
    .map((entry) => entry.index);
  if (quarterIndexes.length <= 1) return normalizedPath;

  const firstQuarterIndex = quarterIndexes[0];
  const rootSegments = parentSegments.slice(0, firstQuarterIndex);
  const rootPrefix = pathModule.parse(normalizedPath).root;
  const canonicalParent = pathModule.join(rootPrefix, ...rootSegments, "quarters");
  const canonicalPath = pathModule.join(canonicalParent, fileName);
  if (fsModule.existsSync(canonicalPath)) {
    return canonicalPath;
  }
  return normalizedPath;
}

/**
 * Construit le chemin cible d'une archive trimestrielle dans `Archives`.
 *
 * Priorité au nom `GTS-du_{from}_au_{to}{ext}` si `quarterKey` est valide ; sinon repli `GTS-{AAAA-Tn}{ext}`.
 *
 * @param {import('path')} pathModule
 * @param {string} currentDbPath - Base de référence pour déduire layout et extension.
 * @param {string} quarterKey - Clé `AAAA-Qn`.
 * @returns {string} Chemin absolu ou relatif selon `currentDbPath`.
 */
function buildQuarterDbPath(pathModule, currentDbPath, quarterKey) {
  const layout = getDbStorageLayoutFromPath(pathModule, currentDbPath);
  const ext = layout.ext || ".db";
  const dateRange = quarterKeyToDateRangeLabel(quarterKey);
  if (dateRange) {
    return pathModule.join(layout.archivesDir, `GTS-du_${dateRange.from}_au_${dateRange.to}${ext}`);
  }
  const archiveLabel = quarterKeyToArchiveLabel(quarterKey);
  return pathModule.join(layout.archivesDir, `GTS-${archiveLabel}${ext}`);
}

/**
 * Retourne le chemin canonique du fichier actif `gts-active{ext}` dans `Activedb`.
 *
 * @param {import('path')} pathModule
 * @param {string} currentDbPath - Fichier ou chemin sous l'arborescence données.
 * @returns {string}
 */
function buildCanonicalActiveDbPath(pathModule, currentDbPath) {
  const layout = getDbStorageLayoutFromPath(pathModule, currentDbPath);
  const ext = layout.ext || ".db";
  return pathModule.join(layout.activeDir, `gts-active${ext}`);
}

module.exports = {
  getQuarterKey,
  normalizeRepeatedSegmentPath,
  quarterKeyToArchiveLabel,
  formatDateForArchiveFile,
  quarterKeyToDateRangeLabel,
  getDbStorageLayoutFromPath,
  normalizeNestedQuarterDbPath,
  buildQuarterDbPath,
  buildCanonicalActiveDbPath
};
