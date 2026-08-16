/**
 * Présence utilisateurs multi-postes (table PostgreSQL `user_presence`).
 *
 * Chaque poste Goron-GTS enregistre / rafraîchit sa session active ; la liste
 * des connectés est lue depuis PG (plus seulement la mémoire locale Electron).
 *
 * @module electron/store/domains/users/presence
 */

/** Au-delà de ce délai sans heartbeat, la présence est considérée expirée. */
const PRESENCE_TTL_MS = 90 * 1000;

/**
 * @param {import('../../../userStore')} store
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter|null}
 */
function getDb(store) {
  return typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
}

/**
 * Enregistre ou rafraîchit la présence d'un compte (login / heartbeat).
 *
 * @param {import('../../../userStore')} store
 * @param {{ username: string, sessionToken: string, hostname?: string|null }} payload
 * @returns {Promise<{ written: boolean }>}
 */
async function upsertPresence(store, { username, sessionToken, hostname = null }) {
  const db = getDb(store);
  const cleanUsername = String(username || "")
    .trim()
    .toLowerCase();
  const token = String(sessionToken || "").trim();
  if (!db || !cleanUsername || !token) {
    return { written: false };
  }
  const now = new Date().toISOString();
  const host = String(hostname || "").trim() || null;
  await db.run(
    `INSERT INTO user_presence (username, session_token, last_seen_at, hostname, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (username) DO UPDATE SET
       session_token = EXCLUDED.session_token,
       last_seen_at = EXCLUDED.last_seen_at,
       hostname = EXCLUDED.hostname,
       updated_at = EXCLUDED.updated_at`,
    [cleanUsername, token, now, host, now]
  );
  return { written: true };
}

/**
 * Supprime une présence (déconnexion).
 *
 * @param {import('../../../userStore')} store
 * @param {{ sessionToken?: string|null, username?: string|null }} payload
 * @returns {Promise<{ cleared: boolean }>}
 */
async function clearPresence(store, { sessionToken = null, username = null } = {}) {
  const db = getDb(store);
  if (!db) return { cleared: false };
  const token = String(sessionToken || "").trim();
  const cleanUsername = String(username || "")
    .trim()
    .toLowerCase();
  if (token) {
    await db.run(`DELETE FROM user_presence WHERE session_token = ?`, [token]);
    return { cleared: true };
  }
  if (cleanUsername) {
    await db.run(`DELETE FROM user_presence WHERE username = ?`, [cleanUsername]);
    return { cleared: true };
  }
  return { cleared: false };
}

/**
 * Liste les usernames techniques encore « en ligne » (last_seen dans le TTL).
 * Purge au passage les lignes périmées.
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<string[]>}
 */
async function listActivePresenceUsernames(store) {
  const db = getDb(store);
  if (!db) return [];
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  try {
    await db.run(`DELETE FROM user_presence WHERE last_seen_at < ?`, [cutoff]);
  } catch {
    // Table absente sur ancienne base non migrée : ignorer.
    return [];
  }
  const rows = await db.all(
    `SELECT username FROM user_presence WHERE last_seen_at >= ? ORDER BY username`,
    [cutoff]
  );
  return rows.map((row) => String(row.username || "").trim()).filter(Boolean);
}

module.exports = {
  PRESENCE_TTL_MS,
  upsertPresence,
  clearPresence,
  listActivePresenceUsernames
};
