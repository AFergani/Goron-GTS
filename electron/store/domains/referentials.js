const { generateEntityId } = require("../core/ids");

function normalizeColorHex(value, fallback = "#1f5fcf") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return fallback;
}

function normalizeUpperText(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function listSites(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  return store.db
    .prepare("SELECT id, code, name, address, parc, famille, created_at, updated_at FROM data_sites ORDER BY name ASC")
    .all()
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address || "",
      parc: row.parc || "",
      famille: row.famille || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at || null
    }));
}

function createSite(store, { requesterRole, requesterUsername, code, name, address, parc, famille, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanCode = String(code || "").trim();
  const cleanName = String(name || "").trim();
  const cleanAddress = String(address || "").trim();
  const cleanParc = normalizeUpperText(parc);
  const cleanFamille = normalizeUpperText(famille);
  if (!cleanCode || !cleanName) {
    store.fail("data:sites:create", "Code site et nom de site obligatoires.", "DATA_SITE_REQUIRED");
  }
  const existsRow = store.db.prepare("SELECT name FROM data_sites WHERE code = ?").get(cleanCode);
  if (existsRow) {
    const nomRef = String(existsRow.name || "").trim() || "sans nom";
    store.fail(
      "data:sites:create",
      `Ce code site existe deja en referentiel (fiche actuelle : « ${nomRef} »).`,
      "DATA_SITE_EXISTS"
    );
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  store.db
    .prepare("INSERT INTO data_sites (id, code, name, address, parc, famille, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, cleanCode, cleanName, cleanAddress || null, cleanParc || null, cleanFamille || null, now);
  store.recordEntityChange({
    entityType: "data_sites",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { code: cleanCode, name: cleanName, address: cleanAddress, parc: cleanParc, famille: cleanFamille }
  });
  if (auditMode !== "batch") {
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_SITE_CREATE",
      details: { id, code: cleanCode, name: cleanName }
    });
  }
  return { success: true };
}

function updateSite(store, { requesterRole, requesterUsername, id, code, name, address, parc, famille, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanCode = String(code || "").trim();
  const cleanName = String(name || "").trim();
  const cleanAddress = String(address || "").trim();
  const cleanParc = normalizeUpperText(parc);
  const cleanFamille = normalizeUpperText(famille);
  if (!id || !cleanCode || !cleanName) {
    store.fail("data:sites:update", "Données site invalides.", "DATA_SITE_REQUIRED");
  }
  const existingSite = store.db.prepare("SELECT id, code, name, address, parc, famille FROM data_sites WHERE id = ?").get(id);
  if (!existingSite) {
    store.fail("data:sites:update", "Site introuvable.", "DATA_SITE_NOT_FOUND");
  }
  const dupSite = store.db.prepare("SELECT name FROM data_sites WHERE code = ? AND id <> ?").get(cleanCode, id);
  if (dupSite) {
    const nomRef = String(dupSite.name || "").trim() || "sans nom";
    store.fail(
      "data:sites:update",
      `Ce code est deja attribue au site « ${nomRef} ».`,
      "DATA_SITE_EXISTS"
    );
  }
  store.db
    .prepare("UPDATE data_sites SET code = ?, name = ?, address = ?, parc = ?, famille = ?, updated_at = ? WHERE id = ?")
    .run(cleanCode, cleanName, cleanAddress || null, cleanParc || null, cleanFamille || null, new Date().toISOString(), id);
  if (auditMode !== "batch") {
    const historyBefore = store.getEntityChangeHistory("data_sites", id, 3);
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_SITE_UPDATE",
      details: {
        id,
        before: {
          code: String(existingSite.code || ""),
          name: String(existingSite.name || ""),
          address: String(existingSite.address || ""),
          parc: String(existingSite.parc || ""),
          famille: String(existingSite.famille || "")
        },
        after: { code: cleanCode, name: cleanName, address: cleanAddress, parc: cleanParc, famille: cleanFamille },
        historyBefore
      }
    });
  }
  store.recordEntityChange({
    entityType: "data_sites",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { code: cleanCode, name: cleanName, address: cleanAddress, parc: cleanParc, famille: cleanFamille }
  });
  return { success: true };
}

function deleteSite(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:sites:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, code, name, address, parc, famille FROM data_sites WHERE id = ?").get(id);
  if (!existing) {
    store.fail("data:sites:delete", "Site introuvable.", "DATA_SITE_NOT_FOUND");
  }
  store.db.prepare("DELETE FROM data_sites WHERE id = ?").run(id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_SITE_DELETE",
    details: {
      id,
      deleted: {
        code: String(existing.code || ""),
        name: String(existing.name || ""),
        address: String(existing.address || ""),
        parc: String(existing.parc || ""),
        famille: String(existing.famille || "")
      },
      reason: cleanReason
    }
  });
  return { success: true };
}

function listIntervenants(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  return store.db
    .prepare("SELECT id, name, created_at, updated_at FROM data_intervenants ORDER BY name ASC")
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at || null
    }));
}

function createIntervenant(store, { requesterRole, requesterUsername, name, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    store.fail("data:intervenants:create", "Nom intervenant obligatoire.", "DATA_INTERVENANT_REQUIRED");
  }
  const exists = store.db.prepare("SELECT id FROM data_intervenants WHERE name = ?").get(cleanName);
  if (exists) {
    store.fail(
      "data:intervenants:create",
      "Ce nom d'intervenant / societe est deja present dans le referentiel (meme libelle : pas de doublon).",
      "DATA_INTERVENANT_EXISTS"
    );
  }
  store.db
    .prepare("INSERT INTO data_intervenants (id, name, created_at) VALUES (?, ?, ?)")
    .run(generateEntityId(), cleanName, new Date().toISOString());
  const created = store.db.prepare("SELECT id FROM data_intervenants WHERE name = ?").get(cleanName);
  if (created?.id) {
    store.recordEntityChange({
      entityType: "data_intervenants",
      entityId: created.id,
      changedBy: requesterUsername || "unknown",
      snapshot: { name: cleanName }
    });
  }
  if (auditMode !== "batch") {
    const newId = created?.id || null;
    const historyBefore = newId ? store.getEntityChangeHistory("data_intervenants", newId, 3) : [];
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_INTERVENANT_CREATE",
      details: { id: newId, name: cleanName, historyBefore }
    });
  }
  return { success: true };
}

function updateIntervenant(store, { requesterRole, requesterUsername, id, name, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) {
    store.fail("data:intervenants:update", "Données intervenant invalides.", "DATA_INTERVENANT_REQUIRED");
  }
  const existingIntervenant = store.db.prepare("SELECT id, name FROM data_intervenants WHERE id = ?").get(id);
  if (!existingIntervenant) {
    store.fail("data:intervenants:update", "Intervenant introuvable.", "DATA_INTERVENANT_NOT_FOUND");
  }
  const duplicate = store.db.prepare("SELECT id FROM data_intervenants WHERE name = ? AND id <> ?").get(cleanName, id);
  if (duplicate) {
    store.fail(
      "data:intervenants:update",
      "Un autre intervenant du referentiel porte deja ce libelle.",
      "DATA_INTERVENANT_EXISTS"
    );
  }
  store.db
    .prepare("UPDATE data_intervenants SET name = ?, updated_at = ? WHERE id = ?")
    .run(cleanName, new Date().toISOString(), id);
  if (auditMode !== "batch") {
    const historyBefore = store.getEntityChangeHistory("data_intervenants", id, 3);
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_INTERVENANT_UPDATE",
      details: {
        id,
        before: { name: String(existingIntervenant.name || "") },
        after: { name: cleanName },
        historyBefore
      }
    });
  }
  store.recordEntityChange({
    entityType: "data_intervenants",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { name: cleanName }
  });
  return { success: true };
}

function deleteIntervenant(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:intervenants:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, name FROM data_intervenants WHERE id = ?").get(id);
  if (!existing) {
    store.fail("data:intervenants:delete", "Intervenant introuvable.", "DATA_INTERVENANT_NOT_FOUND");
  }
  store.db.prepare("DELETE FROM data_intervenants WHERE id = ?").run(id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_INTERVENANT_DELETE",
    details: { id, deleted: { name: String(existing.name || "") }, reason: cleanReason }
  });
  return { success: true };
}

function listAnomalyTypes(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  return store.db
    .prepare("SELECT id, label, color_hex, created_at, updated_at FROM data_anomaly_types ORDER BY label ASC")
    .all()
    .map((row) => ({
      id: row.id,
      label: row.label,
      colorHex: normalizeColorHex(row.color_hex),
      createdAt: row.created_at,
      updatedAt: row.updated_at || null
    }));
}

function createAnomalyType(store, { requesterRole, requesterUsername, label, colorHex, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanLabel = String(label || "").trim();
  const cleanColorHex = normalizeColorHex(colorHex);
  if (!cleanLabel) {
    store.fail("data:types:create", "Libellé du type obligatoire.", "DATA_TYPE_REQUIRED");
  }
  const exists = store.db.prepare("SELECT id FROM data_anomaly_types WHERE label = ?").get(cleanLabel);
  if (exists) {
    store.fail("data:types:create", "Ce type existe deja.", "DATA_TYPE_EXISTS");
  }
  store.db
    .prepare("INSERT INTO data_anomaly_types (id, label, color_hex, created_at) VALUES (?, ?, ?, ?)")
    .run(generateEntityId(), cleanLabel, cleanColorHex, new Date().toISOString());
  const created = store.db.prepare("SELECT id FROM data_anomaly_types WHERE label = ?").get(cleanLabel);
  if (created?.id) {
    store.recordEntityChange({
      entityType: "data_anomaly_types",
      entityId: created.id,
      changedBy: requesterUsername || "unknown",
      snapshot: { label: cleanLabel, colorHex: cleanColorHex }
    });
  }
  if (auditMode !== "batch") {
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_TYPE_CREATE",
      details: { id: created?.id, label: cleanLabel, colorHex: cleanColorHex }
    });
  }
  return { success: true };
}

function updateAnomalyType(store, { requesterRole, requesterUsername, id, label, colorHex, auditMode = "single" }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanLabel = String(label || "").trim();
  const cleanColorHex = normalizeColorHex(colorHex);
  if (!id || !cleanLabel) {
    store.fail("data:types:update", "Données type invalides.", "DATA_TYPE_REQUIRED");
  }
  const existingType = store.db.prepare("SELECT id, label, color_hex FROM data_anomaly_types WHERE id = ?").get(id);
  if (!existingType) {
    store.fail("data:types:update", "Type introuvable.", "DATA_TYPE_NOT_FOUND");
  }
  const duplicate = store.db.prepare("SELECT id FROM data_anomaly_types WHERE label = ? AND id <> ?").get(cleanLabel, id);
  if (duplicate) {
    store.fail("data:types:update", "Ce type existe deja.", "DATA_TYPE_EXISTS");
  }
  const historyBefore = store.getEntityChangeHistory("data_anomaly_types", id, 3);
  store.db
    .prepare("UPDATE data_anomaly_types SET label = ?, color_hex = ?, updated_at = ? WHERE id = ?")
    .run(cleanLabel, cleanColorHex, new Date().toISOString(), id);
  if (auditMode !== "batch") {
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "DATA_TYPE_UPDATE",
      details: {
        id,
        before: { label: String(existingType.label || ""), colorHex: normalizeColorHex(existingType.color_hex) },
        after: { label: cleanLabel, colorHex: cleanColorHex },
        historyBefore
      }
    });
  }
  store.recordEntityChange({
    entityType: "data_anomaly_types",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { label: cleanLabel, colorHex: cleanColorHex }
  });
  return { success: true };
}

function deleteAnomalyType(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("data:types:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, label, color_hex FROM data_anomaly_types WHERE id = ?").get(id);
  if (!existing) {
    store.fail("data:types:delete", "Type introuvable.", "DATA_TYPE_NOT_FOUND");
  }
  store.db.prepare("DELETE FROM data_anomaly_types WHERE id = ?").run(id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "DATA_TYPE_DELETE",
    details: {
      id,
      deleted: { label: String(existing.label || ""), colorHex: normalizeColorHex(existing.color_hex) },
      reason: cleanReason
    }
  });
  return { success: true };
}

module.exports = {
  listSites,
  createSite,
  updateSite,
  deleteSite,
  listIntervenants,
  createIntervenant,
  updateIntervenant,
  deleteIntervenant,
  listAnomalyTypes,
  createAnomalyType,
  updateAnomalyType,
  deleteAnomalyType
};
