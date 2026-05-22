/**
 * Diagnostic d'écriture sur la base SQLite active (probe locale, sans effet métier).
 *
 * Exécuté via `UserStore.getDbHealth()` / IPC `system:getDbHealth` (badge Paramètres, contrôles writer).
 * Ne remplace pas la disponibilité réseau du writer : indique seulement si le fichier base accepte une écriture.
 */

/**
 * Teste si la base courante est accessible en écriture.
 *
 * Crée si besoin une table technique `health_check`, insère une ligne horodatée puis supprime
 * cette même ligne (pas d'accumulation). En cas d'erreur (fichier verrouillé, disque plein, etc.),
 * retourne `{ writable: false }` sans lever d'exception.
 *
 * @param {import('../userStore')} store
 * @returns {{ writable: boolean }}
 */
function getDbHealth(store) {
  try {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS health_check (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL
      );
    `);
    store.db
      .prepare("INSERT INTO health_check (checked_at) VALUES (?)")
      .run(new Date().toISOString());
    store.db.exec("DELETE FROM health_check WHERE id IN (SELECT id FROM health_check ORDER BY id DESC LIMIT 1)");
    return { writable: true };
  } catch {
    return { writable: false };
  }
}

module.exports = {
  getDbHealth
};
