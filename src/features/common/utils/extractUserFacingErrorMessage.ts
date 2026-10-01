/**
 * Extraction d'un message d'erreur lisible pour l'utilisateur depuis une erreur IPC Electron.
 *
 * Retire le bruit technique (`Error invoking remote method`, canal IPC, préfixes `Error:`,
 * codes `[AUTH_*]` / `SESSION_*`). Utilisé par les presenters et les modales de blocage.
 */

/**
 * Nettoie un message déjà extrait (codes session, espaces).
 *
 * @param message - Texte brut ou partiellement nettoyé
 * @param fallback - Message par défaut si le résultat est vide
 * @returns Message affichable en interface
 */
function cleanUserFacingMessage(message: string, fallback: string): string {
  let cleaned = message.trim();
  cleaned = cleaned.replace(/^\[[A-Z0-9_]+\]\s*/, "");
  cleaned = cleaned.replace(/^SESSION_(INVALID|EXPIRED):\s*/i, "");
  cleaned = cleaned.trim();
  return cleaned || fallback;
}

/**
 * Remplace les erreurs disque Windows (fichier ouvert / verrouillé) par un libellé clair.
 *
 * @param message - Message déjà débarrassé du bruit IPC
 * @returns Message affichable
 */
function mapFileLockMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("ebusy") ||
    normalized.includes("resource busy or locked") ||
    normalized.includes("being used by another process")
  ) {
    return "Fichier déjà ouvert. Fermez-le dans Word ou Excel, puis réessayez.";
  }
  if (
    (normalized.includes("eacces") || normalized.includes("eperm")) &&
    /,\s*open\s+'/i.test(message)
  ) {
    return "Impossible d'enregistrer : accès refusé. Fermez le fichier s'il est ouvert, ou choisissez un autre emplacement.";
  }
  return message;
}

/**
 * Extrait le message métier d'une erreur (IPC, backend ou locale).
 *
 * @param error - Erreur capturée (souvent `Error` avec message Electron)
 * @param fallback - Message par défaut si rien d'exploitable n'est trouvé
 * @returns Libellé en français, sans identifiant de canal ni stack
 */
export function extractUserFacingErrorMessage(error: unknown, fallback = "Une erreur est survenue."): string {
  if (!error) return fallback;

  const raw = error instanceof Error ? error.message : String(error);
  if (!raw.trim()) return fallback;

  const ipcWrapped = raw.match(/Error invoking remote method\s+'[^']+'\s*:\s*(?:Error:\s*)?([\s\S]+)$/i);
  if (ipcWrapped?.[1]) {
    return mapFileLockMessage(cleanUserFacingMessage(ipcWrapped[1], fallback));
  }

  const channelOnly = raw.match(/^'[^']+'\s*:\s*(?:Error:\s*)?([\s\S]+)$/i);
  if (channelOnly?.[1]) {
    return mapFileLockMessage(cleanUserFacingMessage(channelOnly[1], fallback));
  }

  const segments = raw.split(/\s*Error:\s*/i);
  if (segments.length > 1) {
    const last = segments[segments.length - 1]?.trim();
    if (last) return mapFileLockMessage(cleanUserFacingMessage(last, fallback));
  }

  return mapFileLockMessage(cleanUserFacingMessage(raw, fallback));
}

/** Ligne de sortie outil, pile ou code système : pas un libellé pour l'opérateur. */
const TECHNICAL_LINE =
  /^(?:pg_restore|pg_dump|psql|docker|node|npm)(?::|\s)|^(?:error|warning|notice):\s|Error invoking remote method|\bSQLSTATE\b|\bat \S+\(|node_modules|node:internal|\b(?:ENOENT|EPERM|EBUSY|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b|syntax error at or near|duplicate key value|violates |relation "|column "|command failed|exit code \d+|Process exited/i;

/** Plafond du détail technique conservé sous le libellé français. */
const TECHNICAL_DETAIL_MAX = 1200;

/**
 * Cadre un message d'erreur pour le toast : phrase française, détail technique
 * seulement s'il reste utile à la lecture.
 *
 * @param error - Erreur ou texte déjà extrait
 * @param fallback - Libellé si rien de lisible ne reste
 * @returns Texte affichable, éventuellement sur plusieurs lignes
 */
export function frameUserFacingError(error: unknown, fallback = "Une erreur est survenue."): string {
  const cleaned = extractUserFacingErrorMessage(error, fallback);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const readable = lines.filter((line) => !TECHNICAL_LINE.test(line));
  if (readable.length > 0 && readable.join("\n") === cleaned) {
    return cleaned;
  }
  if (readable.length > 0) {
    return readable.join("\n");
  }
  const detail = lines
    .map((line) =>
      line
        .replace(/^(?:pg_restore|pg_dump|psql):\s*/i, "")
        .replace(/^(?:error|warning):\s*/i, "")
        .trim()
    )
    .filter(Boolean)
    .slice(-4)
    .join("\n")
    .slice(0, TECHNICAL_DETAIL_MAX);
  if (!detail || detail === fallback) return fallback;
  return `${fallback}\n${detail}`;
}
