/**
 * Référentiel des jours fériés (`data_holidays`).
 *
 * Alimente la planification rondes et gardiennage (exclusion / inclusion fériés et veilles).
 * CRUD via Paramètres ; accès PostgreSQL via `store.getReferentialsPersistence()`.
 * Cache mémoire des dates ISO pour la planification (rondes / gardiennage).
 *
 * @module electron/store/domains/data/holidays
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { normalizeDateIso } = require("../../core/isoDate");

/**
 * @param {import('../../../userStore')} store
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requirePersistence(store) {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const refDb =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!refDb) {
    store.fail(
      "data:holidays",
      "Base PostgreSQL inaccessible. Les jours fériés ne peuvent pas être consultés ni modifiés tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

/**
 * @param {{ date_iso?: unknown, label?: unknown }} row
 * @returns {{ dateIso: string, label: string }}
 */
function toHolidaySnapshot(row) {
  return {
    dateIso: String(row.date_iso || ""),
    label: String(row.label || "")
  };
}

/**
 * Recharge le cache des dates fériées depuis PostgreSQL (après sync / CRUD).
 * Si PG injoignable : conserve le dernier cache connu (planification dégradée).
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<string[]>}
 */
async function refreshHolidayDateIsosCache(store) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) {
    return Array.isArray(store._holidayDateIsosCache) ? store._holidayDateIsosCache : [];
  }
  const rows = await db.all(`SELECT date_iso FROM data_holidays ORDER BY date_iso ASC`, []);
  const dates = rows.map((row) => String(row.date_iso || "").trim()).filter(Boolean);
  store._holidayDateIsosCache = dates;
  return dates;
}

/**
 * Dates fériées pour la planification (rondes / gardiennage).
 * Source : cache mémoire alimenté depuis PostgreSQL ; vide si jamais hydraté.
 *
 * @param {import('../../../userStore')} store
 * @returns {string[]}
 */
function getHolidayDateIsosForPlanning(store) {
  return Array.isArray(store._holidayDateIsosCache) ? store._holidayDateIsosCache : [];
}

/**
 * Liste les jours fériés (ordre chronologique).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, dateIso: string, label: string, createdAt: string, updatedAt: string|null }>>}
 */
async function listHolidays(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const rows = await db.all(
    `SELECT id, date_iso, label, created_at, updated_at FROM data_holidays ORDER BY date_iso ASC`,
    []
  );
  return rows.map((row) => ({
    id: row.id,
    dateIso: String(row.date_iso || ""),
    label: String(row.label || ""),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  }));
}

/**
 * Crée un jour férié.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function createHoliday(store, { requesterRole, requesterUsername, dateIso, label }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanDateIso = normalizeDateIso(dateIso);
  const cleanLabel = String(label || "").trim();
  if (!cleanDateIso) {
    store.fail("data:holidays:create", "Date fériée invalide (AAAA-MM-JJ).", "DATA_HOLIDAY_DATE_REQUIRED");
  }
  if (!cleanLabel) {
    store.fail("data:holidays:create", "Libellé du jour férié obligatoire.", "DATA_HOLIDAY_LABEL_REQUIRED");
  }
  const existing = await db.get("SELECT id FROM data_holidays WHERE date_iso = ?", [cleanDateIso]);
  if (existing) {
    store.fail("data:holidays:create", "Ce jour férié existe déjà.", "DATA_HOLIDAY_EXISTS");
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO data_holidays (id, date_iso, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, cleanDateIso, cleanLabel, now, now]
  );
  const snapshot = { dateIso: cleanDateIso, label: cleanLabel };
  await store.recordEntityChange({
    entityType: "data_holidays",
    entityId: id,
    changedBy: actorName(requesterUsername),
    snapshot
  });
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_HOLIDAY_CREATE",
    details: { id, ...snapshot }
  });
  await refreshHolidayDateIsosCache(store);
  return { success: true };
}

/**
 * Met à jour un jour férié (audit avec `historyBefore`).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function updateHoliday(store, { requesterRole, requesterUsername, id, dateIso, label }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const cleanId = String(id || "").trim();
  const cleanDateIso = normalizeDateIso(dateIso);
  const cleanLabel = String(label || "").trim();
  if (!cleanId || !cleanDateIso) {
    store.fail("data:holidays:update", "Données jour férié invalides.", "DATA_HOLIDAY_DATE_REQUIRED");
  }
  if (!cleanLabel) {
    store.fail("data:holidays:update", "Libellé du jour férié obligatoire.", "DATA_HOLIDAY_LABEL_REQUIRED");
  }
  const existing = await db.get("SELECT id, date_iso, label FROM data_holidays WHERE id = ?", [cleanId]);
  if (!existing) {
    store.fail("data:holidays:update", "Jour férié introuvable.", "DATA_HOLIDAY_NOT_FOUND");
  }
  const duplicate = await db.get("SELECT id FROM data_holidays WHERE date_iso = ? AND id <> ?", [
    cleanDateIso,
    cleanId
  ]);
  if (duplicate) {
    store.fail("data:holidays:update", "Ce jour férié existe déjà.", "DATA_HOLIDAY_EXISTS");
  }
  const now = new Date().toISOString();
  await db.run(`UPDATE data_holidays SET date_iso = ?, label = ?, updated_at = ? WHERE id = ?`, [
    cleanDateIso,
    cleanLabel,
    now,
    cleanId
  ]);
  const historyBefore = await store.getEntityChangeHistory("data_holidays", cleanId, 3);
  const after = { dateIso: cleanDateIso, label: cleanLabel };
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_HOLIDAY_UPDATE",
    details: {
      id: cleanId,
      before: toHolidaySnapshot(existing),
      after,
      historyBefore
    }
  });
  await store.recordEntityChange({
    entityType: "data_holidays",
    entityId: cleanId,
    changedBy: actorName(requesterUsername),
    snapshot: after
  });
  await refreshHolidayDateIsosCache(store);
  return { success: true };
}

/**
 * Suppression physique avec motif obligatoire (rôle data delete).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteHoliday(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requirePersistence(store);
  const cleanId = String(id || "").trim();
  const cleanReason = String(reason || "").trim();
  if (!cleanId) {
    store.fail("data:holidays:delete", "Identifiant jour férié obligatoire.", "DATA_HOLIDAY_NOT_FOUND");
  }
  if (!cleanReason) {
    store.fail("data:holidays:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get("SELECT id, date_iso, label FROM data_holidays WHERE id = ?", [cleanId]);
  if (!existing) {
    store.fail("data:holidays:delete", "Jour férié introuvable.", "DATA_HOLIDAY_NOT_FOUND");
  }
  await db.run("DELETE FROM data_holidays WHERE id = ?", [cleanId]);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "DATA_HOLIDAY_DELETE",
    details: {
      id: cleanId,
      deleted: toHolidaySnapshot(existing),
      reason: cleanReason
    }
  });
  await refreshHolidayDateIsosCache(store);
  return { success: true };
}

module.exports = {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  refreshHolidayDateIsosCache,
  getHolidayDateIsosForPlanning
};
