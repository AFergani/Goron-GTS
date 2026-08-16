/**
 * Contrat de la couche de persistance async Goron-GTS (PostgreSQL).
 *
 * Toutes les implémentations doivent exposer cette surface (`run` / `get` / `all` /
 * `exec` / `transaction` / `open` / `close` / `isOpen`).
 *
 * @module electron/store/persistence/persistenceContract
 */

/**
 * Résultat d'une instruction d'écriture (`INSERT` / `UPDATE` / `DELETE`).
 *
 * @typedef {object} PersistenceRunResult
 * @property {number} changes - Nombre de lignes affectées.
 * @property {number|bigint|null} lastInsertRowid - Dernier identifiant auto-incrémenté si pertinent ; sinon `null`.
 */

/**
 * Handle de transaction : même API que l'adaptateur, mais lié à **une** connexion
 * (obligatoire avec un pool PostgreSQL).
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
 * @property {() => Promise<void>} close - Ferme la connexion / le pool.
 * @property {() => boolean} isOpen - Indique si la connexion est utilisable.
 * @property {(sql: string) => Promise<void>} exec - Exécute un script SQL (plusieurs instructions possibles).
 * @property {(sql: string, params?: unknown[]) => Promise<PersistenceRunResult>} run - Écriture paramétrée.
 * @property {(sql: string, params?: unknown[]) => Promise<object|undefined>} get - Lecture d'une ligne.
 * @property {(sql: string, params?: unknown[]) => Promise<object[]>} all - Lecture de N lignes.
 * @property {(fn: (tx: PersistenceTransaction) => Promise<*>) => Promise<*>} transaction
 *   - Exécute `fn` dans une transaction ; toutes les requêtes de `fn` doivent passer par `tx`.
 */

module.exports = {};
