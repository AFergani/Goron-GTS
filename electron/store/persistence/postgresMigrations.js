/**
 * Application du schéma SQL PostgreSQL (fichier unique `schema.sql`).
 *
 * @module electron/store/persistence/postgresMigrations
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Applique les fichiers `.sql` du dossier `migrations/` (ordre alphabétique).
 * En V1 : un seul `schema.sql` idempotent (`IF NOT EXISTS`).
 *
 * @param {import('./persistenceContract').PersistenceAdapter} persistence - Adaptateur `engine=postgres`.
 * @returns {Promise<{ applied: string[] }>}
 */
async function applyPostgresMigrations(persistence) {
  if (!persistence || persistence.engine !== "postgres") {
    throw new Error("applyPostgresMigrations exige un adaptateur PostgreSQL.");
  }
  const dir = path.join(__dirname, "migrations");
  if (!fs.existsSync(dir)) {
    return { applied: [] };
  }
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    await persistence.exec(sql);
    applied.push(file);
  }
  return { applied };
}

module.exports = {
  applyPostgresMigrations
};
