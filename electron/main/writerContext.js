/**
 * Contexte réseau et poste pour le cluster writer : résolution de `gts_writer-config.json`,
 * choix de l'IPv4 LAN préférée et identité locale (hostname, whoami, rôle).
 *
 * Instancié tôt dans `main.js` ; consommé par `writerRuntime`, `writerLogs`, files SMB/HTTP,
 * `archiveRunner`, `ipcSystemHandlers` (`system:getLocalNodeIdentity`) et matching de nœud en main.
 */

/**
 * Fabrique les utilitaires de contexte writer et de lecture de configuration.
 *
 * @param {object} deps
 * @param {import('path')} deps.path
 * @param {import('fs')} deps.fs
 * @param {import('os')} deps.os
 * @param {import('electron').App} deps.app - `getPath('exe')` pour candidats de config.
 * @param {string} deps.processCwd - Répertoire de travail (candidats `Z_Dossier_Perso`, `config`, `data`).
 * @param {string|null} deps.portableExecutableDir - `PORTABLE_EXECUTABLE_DIR` si déploiement portable.
 * @param {() => object} deps.readAppConfig - `writerConfigPath`, `dbPath` mémorisés.
 * @param {string} deps.writerConfigFileName - Nom canonique `gts_writer-config.json`.
 * @param {string} deps.legacyWriterConfigMisspellFileName - Ancien nom mal orthographié.
 * @param {string} deps.legacyWriterConfigFileName - `writer-config.v1.json`.
 * @param {() => string} deps.getWriterRole - Rôle writer courant pour `getLocalSourceContext`.
 * @returns {{
 *   normalizeText: (value: unknown) => string,
 *   readJsonIfExists: (filePath: string) => object|null,
 *   resolveWriterConfigPath: () => { config: object|null, configPath: string|null },
 *   isIpv4Family: (addr: object) => boolean,
 *   getLocalIPv4: () => string|null,
 *   getLocalSourceContext: () => object,
 *   getLocalNodeIdentity: () => object
 * }}
 */
function createWriterContextService(deps) {
  const {
    path,
    fs,
    os,
    app,
    processCwd,
    portableExecutableDir,
    readAppConfig,
    writerConfigFileName,
    legacyWriterConfigMisspellFileName,
    legacyWriterConfigFileName,
    getWriterRole
  } = deps;

  /** Heuristique : interfaces VPN / virtuelles pénalisées pour le choix d'IP. */
  const VPN_INTERFACE_NAME_RE =
    /vpn|tap|tun|virtual|proton|wireguard|wintun|zerotier|hamachi|openvpn|nordlynx|tailscale|vethernet|hyper-v|docker|vbox|pptp|l2tp|ppp|nordvpn|mullvad|surfshark|expressvpn|openconnect|anyconnect|citrix|netextender|wg|outline/i;
  /** Heuristique : interfaces LAN / Wi‑Fi favorisées. */
  const PREFERRED_LAN_INTERFACE_RE =
    /ethernet|wi[- ]?fi|wlan|802\.11|reseau|network|eth\d|en\d|connexion au r[eé]seau|local area connection/i;

  /**
   * Normalise une chaîne pour comparaison insensible à la casse (matching nœud writer).
   *
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  /**
   * Lit un fichier JSON s'il existe ; replis `null` si absent ou invalide.
   *
   * @param {string} filePath
   * @returns {object|null}
   */
  function readJsonIfExists(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  /**
   * Recherche le fichier de configuration writer sur le poste ou près de la base de données.
   *
   * Ordre : chemin explicite `app-config.writerConfigPath`, puis candidats sous `data/` et `config/`
   * (portable, exe, cwd, racine déduite de `dbPath`), avec noms legacy.
   *
   * @returns {{ config: object|null, configPath: string|null }}
   */
  function resolveWriterConfigPath() {
    const appCfg = readAppConfig();
    const explicitPath = appCfg.writerConfigPath;
    const fromExplicit = readJsonIfExists(explicitPath);
    if (fromExplicit) return { config: fromExplicit, configPath: explicitPath };
    const exeDir = path.dirname(app.getPath("exe"));
    const exeParentDir = path.dirname(exeDir);
    const exeGrandParentDir = path.dirname(exeParentDir);
    const portableExeDir = portableExecutableDir || null;
    const portableExeParentDir = portableExeDir ? path.dirname(portableExeDir) : null;
    const portableExeGrandParentDir = portableExeParentDir ? path.dirname(portableExeParentDir) : null;
    const dbBasedRoot =
      appCfg.dbPath && fs.existsSync(appCfg.dbPath)
        ? path.dirname(path.dirname(appCfg.dbPath))
        : null;
    const dataRootCandidates = [
      portableExeDir,
      portableExeParentDir,
      portableExeGrandParentDir,
      exeDir,
      exeParentDir,
      exeGrandParentDir
    ].filter(Boolean);
    const configNames = [writerConfigFileName, legacyWriterConfigMisspellFileName, legacyWriterConfigFileName];
    const candidates = [
      ...dataRootCandidates.flatMap((baseDir) => configNames.map((name) => path.join(baseDir, "data", name))),
      ...configNames.flatMap((name) => [
        path.join(processCwd, "Z_Dossier_Perso", name),
        path.join(processCwd, "config", name),
        path.join(processCwd, "data", name),
        path.join(exeDir, "config", name),
        path.join(exeParentDir, "config", name),
        path.join(exeGrandParentDir, "config", name),
        portableExeDir ? path.join(portableExeDir, "config", name) : null,
        portableExeParentDir ? path.join(portableExeParentDir, "config", name) : null,
        portableExeGrandParentDir ? path.join(portableExeGrandParentDir, "config", name) : null,
        dbBasedRoot ? path.join(dbBasedRoot, "data", name) : null,
        dbBasedRoot ? path.join(dbBasedRoot, "config", name) : null
      ])
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const cfg = readJsonIfExists(candidate);
      if (cfg) return { config: cfg, configPath: candidate };
    }
    return { config: null, configPath: null };
  }

  /**
   * Indique si une adresse `os.networkInterfaces()` est IPv4 (famille `IPv4` ou `4`).
   *
   * @param {object} addr - Entrée interface Node.
   * @returns {boolean}
   */
  function isIpv4Family(addr) {
    return addr.family === "IPv4" || addr.family === 4;
  }

  /**
   * Sélectionne la meilleure IPv4 non interne du poste (évite VPN, favorise Ethernet / 192.168.x.x).
   *
   * @returns {string|null} Adresse IPv4 ou `null` si aucune interface utilisable.
   */
  function getLocalIPv4() {
    const ifaces = os.networkInterfaces();
    const candidates = [];
    for (const [name, values] of Object.entries(ifaces)) {
      for (const addr of values || []) {
        if (!isIpv4Family(addr) || addr.internal) continue;
        const netmask = String(addr.netmask || "");
        const address = String(addr.address || "");
        let score = 0;
        if (VPN_INTERFACE_NAME_RE.test(name)) score -= 200;
        if (netmask === "255.255.255.255") score -= 80;
        if (PREFERRED_LAN_INTERFACE_RE.test(name)) score += 45;
        if (netmask && netmask !== "255.255.255.255") score += 30;
        const oct = address.split(".").map((x) => Number(x));
        if (oct.length === 4 && oct.every((n) => Number.isFinite(n))) {
          if (oct[0] === 192 && oct[1] === 168) score += 20;
          else if (oct[0] === 10) score += 5;
          else if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) score += 12;
        }
        candidates.push({ name, address, score });
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const best = candidates[0];
    if (best.score < -100) {
      const fallback = candidates.find((c) => c.score > -100);
      return (fallback || best).address;
    }
    return best.address;
  }

  /**
   * Contexte embarqué dans les requêtes file d'attente / HTTP writer (source de l'action).
   *
   * @returns {{ hostname: string, whoami: string, ip: string|null, role: string }}
   */
  function getLocalSourceContext() {
    return {
      hostname: os.hostname(),
      whoami: `${os.hostname()}\\${os.userInfo().username}`.toLowerCase(),
      ip: getLocalIPv4(),
      role: getWriterRole()
    };
  }

  /**
   * Identité poste exposée à l'UI Paramètres (`system:getLocalNodeIdentity`).
   *
   * @returns {{ hostname: string, host: string, whoami: string }}
   */
  function getLocalNodeIdentity() {
    return {
      hostname: os.hostname(),
      host: getLocalIPv4() || "",
      whoami: `${os.hostname()}\\${os.userInfo().username}`.toLowerCase()
    };
  }

  return {
    normalizeText,
    readJsonIfExists,
    resolveWriterConfigPath,
    isIpv4Family,
    getLocalIPv4,
    getLocalSourceContext,
    getLocalNodeIdentity
  };
}

module.exports = {
  createWriterContextService
};
