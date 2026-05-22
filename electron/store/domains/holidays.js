/**
 * Référentiel des jours fériés (`data_holidays`).
 *
 * Alimente la planification rondes et gardiennage (exclusion / inclusion fériés et veilles).
 * CRUD via Paramètres ; lecture aussi depuis les écrans Fransor, rondes et gardiennage.
 * Table créée dans `schemaRonde.ensureRondeSchema`.
 */

const { generateEntityId } = require("../core/ids");

/**
 * Normalise une date au format `AAAA-MM-JJ` (validation calendrier à midi UTC).
 *
 * @param {unknown} value
 * @returns {string} Chaîne vide si invalide.
 */
function normalizeDateIso(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return raw;
}

/**
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Array<{ id: string, dateIso: string, label: string, createdAt: string, updatedAt: string|null }>}
 */
function listHolidays(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  return store.db
    .prepare("SELECT id, date_iso, label, created_at, updated_at FROM data_holidays ORDER BY date_iso ASC")
    .all()
    .map((row) => ({
      id: row.id,
      dateIso: String(row.date_iso || ""),
      label: String(row.label || ""),
      createdAt: row.created_at,
      updatedAt: row.updated_at || null
    }));
}

/**
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function createHoliday(store, { requesterRole, requesterUsername, dateIso, label }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanDateIso = normalizeDateIso(dateIso);
  const cleanLabel = String(label || "").trim();
  if (!cleanDateIso) {
    store.fail("data:holidays:create", "Date fériée invalide (AAAA-MM-JJ).", "DATA_HOLIDAY_DATE_REQUIRED");
  }
  if (!cleanLabel) {
    store.fail("data:holidays:create", "Libellé du jour férié obligatoire.", "DATA_HOLIDAY_LABEL_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id FROM data_holidays WHERE date_iso = ?").get(cleanDateIso);
  if (existing) {
    store.fail("data:holidays:create", "Ce jour férié existe déjà.", "DATA_HOLIDAY_EXISTS");
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  store.db
    .prepare("INSERT INTO data_holidays (id, date_iso, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, cleanDateIso, cleanLabel, now, now);
  store.recordEntityChange({
    entityType: "data_holidays",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { dateIso: cleanDateIso, label: cleanLabel }
  });
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_HOLIDAY_CREATE",
    details: { id, dateIso: cleanDateIso, label: cleanLabel }
  });
  return { success: true };
}

/**
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function updateHoliday(store, { requesterRole, requesterUsername, id, dateIso, label }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanId = String(id || "").trim();
  const cleanDateIso = normalizeDateIso(dateIso);
  const cleanLabel = String(label || "").trim();
  if (!cleanId || !cleanDateIso) {
    store.fail("data:holidays:update", "Données jour férié invalides.", "DATA_HOLIDAY_DATE_REQUIRED");
  }
  if (!cleanLabel) {
    store.fail("data:holidays:update", "Libellé du jour férié obligatoire.", "DATA_HOLIDAY_LABEL_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, date_iso, label FROM data_holidays WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:holidays:update", "Jour férié introuvable.", "DATA_HOLIDAY_NOT_FOUND");
  }
  const duplicate = store.db.prepare("SELECT id FROM data_holidays WHERE date_iso = ? AND id <> ?").get(cleanDateIso, cleanId);
  if (duplicate) {
    store.fail("data:holidays:update", "Ce jour férié existe déjà.", "DATA_HOLIDAY_EXISTS");
  }
  const now = new Date().toISOString();
  store.db
    .prepare("UPDATE data_holidays SET date_iso = ?, label = ?, updated_at = ? WHERE id = ?")
    .run(cleanDateIso, cleanLabel, now, cleanId);
  const historyBefore = store.getEntityChangeHistory("data_holidays", cleanId, 3);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_HOLIDAY_UPDATE",
    details: {
      id: cleanId,
      before: { dateIso: String(existing.date_iso || ""), label: String(existing.label || "") },
      after: { dateIso: cleanDateIso, label: cleanLabel },
      historyBefore
    }
  });
  store.recordEntityChange({
    entityType: "data_holidays",
    entityId: cleanId,
    changedBy: requesterUsername || "unknown",
    snapshot: { dateIso: cleanDateIso, label: cleanLabel }
  });
  return { success: true };
}

/**
 * Suppression physique avec motif obligatoire (rôle data delete).
 *
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function deleteHoliday(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanId = String(id || "").trim();
  const cleanReason = String(reason || "").trim();
  if (!cleanId) {
    store.fail("data:holidays:delete", "Identifiant jour férié obligatoire.", "DATA_HOLIDAY_NOT_FOUND");
  }
  if (!cleanReason) {
    store.fail("data:holidays:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, date_iso, label FROM data_holidays WHERE id = ?").get(cleanId);
  if (!existing) {
    store.fail("data:holidays:delete", "Jour férié introuvable.", "DATA_HOLIDAY_NOT_FOUND");
  }
  store.db.prepare("DELETE FROM data_holidays WHERE id = ?").run(cleanId);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_HOLIDAY_DELETE",
    details: {
      id: cleanId,
      deleted: { dateIso: String(existing.date_iso || ""), label: String(existing.label || "") },
      reason: cleanReason
    }
  });
  return { success: true };
}

module.exports = {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday
};
