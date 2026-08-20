/**
 * Application du schéma SQL PostgreSQL (`migrations/schema.sql`).
 *
 * Idempotent (`IF NOT EXISTS`). Appelé à l'ouverture du pool
 * (`openPostgresPersistence`).
 *
 * @module electron/store/persistence/postgresMigrations
 */

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_FILE_NAME = "schema.sql";

/**
 * Applique `schema.sql` sur l'adaptateur PostgreSQL.
 *
 * @param {import('./persistenceContract').PersistenceAdapter} persistence
 * @returns {Promise<void>}
 * @throws {Error} Si l'adaptateur est invalide ou si `schema.sql` est introuvable.
 */
async function applyPostgresMigrations(persistence) {
  if (!persistence || typeof persistence.exec !== "function") {
    throw new Error("applyPostgresMigrations exige un adaptateur PostgreSQL.");
  }
  const schemaPath = path.join(__dirname, "migrations", SCHEMA_FILE_NAME);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schéma PostgreSQL introuvable : ${schemaPath}`);
  }
  const sql = fs.readFileSync(schemaPath, "utf8");
  await persistence.exec(sql);
}

module.exports = {
  applyPostgresMigrations
};
