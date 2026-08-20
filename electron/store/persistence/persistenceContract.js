/**
 * Contrat JSDoc de la couche de persistance async Goron-GTS (PostgreSQL).
 *
 * Fichier de types uniquement (aucun runtime). Les implémentations exposent
 * `run` / `get` / `all` / `exec` / `transaction` / `open` / `close` / `isOpen`.
 *
 * @module electron/store/persistence/persistenceContract
 */

/**
 * Résultat d'une instruction d'écriture (`INSERT` / `UPDATE` / `DELETE`).
 *
 * @typedef {object} PersistenceRunResult
 * @property {number} changes - Nombre de lignes affectées (`rowCount` PostgreSQL).
 */

/**
 * Handle de transaction : même API SQL que l'adaptateur, lié à **une** connexion
 * du pool (obligatoire avec PostgreSQL).
 *
 * @typedef {object} PersistenceTransaction
 * @property {(sql: string) => Promise<void>} exec
 * @property {(sql: string, params?: unknown[]) => Promise<PersistenceRunResult>} run
 * @property {(sql: string, params?: unknown[]) => Promise<object|undefined>} get
 * @property {(sql: string, params?: unknown[]) => Promise<object[]>} all
 */

/**
 * Adaptateur de persistance asynchrone.
 *
 * @typedef {object} PersistenceAdapter
 * @property {"postgres"} engine - Moteur sous-jacent.
 * @property {() => Promise<void>} open - Ouvre / vérifie la connexion (no-op si déjà ouverte).
 * @property {() => Promise<void>} close - Ferme le pool.
 * @property {() => boolean} isOpen - Indique si le pool est utilisable.
 * @property {(sql: string) => Promise<void>} exec - Exécute un script SQL (plusieurs instructions possibles).
 * @property {(sql: string, params?: unknown[]) => Promise<PersistenceRunResult>} run - Écriture paramétrée.
 * @property {(sql: string, params?: unknown[]) => Promise<object|undefined>} get - Lecture d'une ligne.
 * @property {(sql: string, params?: unknown[]) => Promise<object[]>} all - Lecture de N lignes.
 * @property {(fn: (tx: PersistenceTransaction) => Promise<*>) => Promise<*>} transaction
 *   - Exécute `fn` dans une transaction ; toutes les requêtes de `fn` doivent passer par `tx`.
 */

module.exports = {};
