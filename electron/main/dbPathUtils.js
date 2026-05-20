function getQuarterKey(date = new Date()) {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

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

function quarterKeyToArchiveLabel(quarterKey) {
  const match = /^(\d{4})-Q([1-4])$/i.exec(String(quarterKey || "").toUpperCase());
  if (!match) return String(quarterKey || "");
  return `${match[1]}-T${match[2]}`;
}

function formatDateForArchiveFile(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

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

function getQuarterInfoFromDbPath(pathModule, dbPath) {
  const fileName = pathModule.basename(String(dbPath || ""));
  const quarterMatch = /^gts-(\d{4})-(?:Q|T)([1-4])\.(db|sqlite|sqlite3)$/i.exec(fileName);
  const layout = getDbStorageLayoutFromPath(pathModule, dbPath);
  return {
    dataRoot: layout.dataRoot,
    ext: layout.ext,
    quarterKeyFromFile: quarterMatch ? `${quarterMatch[1]}-Q${quarterMatch[2]}` : null
  };
}

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
  getQuarterInfoFromDbPath,
  normalizeNestedQuarterDbPath,
  buildQuarterDbPath,
  buildCanonicalActiveDbPath
};
