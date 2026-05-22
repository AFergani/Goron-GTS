/**
 * Main courante : informations terrain, workflow opérateur / responsable.
 *
 * Statuts : `EN_ATTENTE` → `EN_COURS` (à suivre) ou `CLOTURE`. Archivage logique via `archive.js`.
 * Observations manager horodatées en français ; compteur « non consultées » pour RESPONSABLE / DEV.
 */

function normalizeDisplayName(value) {
  return String(value || "").trim().toLowerCase();
}

function sameOperatorDisplay(a, b) {
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

function formatObservationDateFr(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatManagerObservation(managerName, observation) {
  const cleanObs = String(observation || "").trim();
  if (!cleanObs) return "";
  const cleanManager = String(managerName || "").trim() || "Responsable";
  return `${formatObservationDateFr(new Date().toISOString())}: ${cleanManager} : ${cleanObs}`;
}

function mergeMainCouranteObservations(previous, managerName, addition) {
  const p = String(previous || "").trim();
  const a = formatManagerObservation(managerName, addition);
  if (!p) return a;
  if (!a) return p;
  return `${p}\n---\n${a}`;
}

/** Mappe une ligne SQL vers l'objet API main courante. */
function mapMainCouranteRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    operatorName: row.operator_name,
    siteId: row.site_id || null,
    siteDisplay: row.site_display || "",
    anomalyTypeId: row.anomaly_type_id,
    anomalyTypeLabel: row.anomaly_type_label,
    information: row.information,
    status: row.status,
    managerObservation: row.manager_observation || undefined,
    managerName: row.manager_name || undefined,
    consultedByManagerAt: row.consulted_by_manager_at || undefined,
    consultedByManagerName: row.consulted_by_manager_name || undefined,
    priseEnCompteAt: row.prise_en_compte_at || undefined,
    closedAt: row.closed_at || undefined,
    archivedAt: row.archived_at || undefined
  };
}

/** Liste les entrées (hors archivées sauf `includeArchived`). */
function listMainCouranteEntries(store, { requesterRole, includeArchived = false }) {
  store.ensureDataReaderRole(requesterRole);
  const rows = includeArchived
    ? store.db.prepare(`SELECT * FROM main_courante_entries ORDER BY datetime(created_at) DESC`).all()
    : store.db
        .prepare(`SELECT * FROM main_courante_entries WHERE archived_at IS NULL ORDER BY datetime(created_at) DESC`)
        .all();
  return rows.map((row) => mapMainCouranteRow(row));
}

/** Crée une information (`EN_ATTENTE`) ; idempotent si `id` existe déjà. */
function createMainCouranteEntry(store, { requesterRole, requesterUsername, id, operatorName, siteId, siteDisplay, anomalyTypeId, anomalyTypeLabel, information }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanInfo = String(information || "").trim();
  if (!cleanInfo) {
    store.fail("mainCourante:create", "Le texte d'information est obligatoire.", "MAIN_COURANTE_INFO_REQUIRED");
  }
  const cleanOperator = String(operatorName || "").trim();
  if (!cleanOperator) {
    store.fail("mainCourante:create", "Opérateur invalide.", "MAIN_COURANTE_OPERATOR_REQUIRED");
  }
  const existing = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  if (existing) {
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "MAIN_COURANTE_CREATE_IDEMPOTENT",
      details: { id }
    });
    return mapMainCouranteRow(existing);
  }
  const now = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO main_courante_entries (
        id, created_at, operator_name, site_id, site_display,
        anomaly_type_id, anomaly_type_label, information, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      now,
      cleanOperator,
      siteId || null,
      String(siteDisplay || "").trim(),
      String(anomalyTypeId || "").trim(),
      String(anomalyTypeLabel || "").trim(),
      cleanInfo,
      "EN_ATTENTE",
      now
    );
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_CREATE",
    details: { id }
  });
  const row = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  return mapMainCouranteRow(row);
}

/** Modification opérateur : uniquement ses entrées `EN_ATTENTE`, non archivées. */
function updateMainCouranteEntryOperator(
  store,
  { requesterRole, requesterUsername, id, expectedUpdatedAt, siteId, siteDisplay, anomalyTypeId, anomalyTypeLabel, information, requesterFullName }
) {
  store.ensureDataReaderRole(requesterRole);
  const cleanInfo = String(information || "").trim();
  if (!cleanInfo) {
    store.fail("mainCourante:updateOp", "Le texte d'information est obligatoire.", "MAIN_COURANTE_INFO_REQUIRED");
  }
  const row = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("mainCourante:updateOp", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
  }
  if (row.status !== "EN_ATTENTE") {
    store.fail(
      "mainCourante:updateOp",
      "Seules les entrées en attente peuvent être modifiées par l'opérateur.",
      "MAIN_COURANTE_BAD_STATUS"
    );
  }
  if (row.archived_at) {
    store.fail(
      "mainCourante:updateOp",
      "Cette entrée est archivée et ne peut plus être modifiée.",
      "MAIN_COURANTE_ARCHIVED_READONLY"
    );
  }
  if (!sameOperatorDisplay(row.operator_name, requesterFullName)) {
    store.fail("mainCourante:updateOp", "Vous ne pouvez modifier que vos propres entrées.", "MAIN_COURANTE_FORBIDDEN");
  }
  if (row.updated_at !== expectedUpdatedAt) {
    store.fail(
      "mainCourante:updateOp",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
      "MAIN_COURANTE_CONFLICT"
    );
  }
  const now = new Date().toISOString();
  const result = store.db
    .prepare(
      `UPDATE main_courante_entries SET
        site_id = ?,
        site_display = ?,
        anomaly_type_id = ?,
        anomaly_type_label = ?,
        information = ?,
        updated_at = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run(
      siteId || null,
      String(siteDisplay || "").trim(),
      String(anomalyTypeId || "").trim(),
      String(anomalyTypeLabel || "").trim(),
      cleanInfo,
      now,
      id,
      expectedUpdatedAt
    );
  if (result.changes === 0) {
    store.fail(
      "mainCourante:updateOp",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
      "MAIN_COURANTE_CONFLICT"
    );
  }
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_UPDATE_OPERATOR",
    details: {
      id,
      before: {
        siteId: row.site_id || null,
        siteDisplay: String(row.site_display || ""),
        anomalyTypeId: String(row.anomaly_type_id || ""),
        anomalyTypeLabel: String(row.anomaly_type_label || ""),
        information: String(row.information || "")
      },
      after: {
        siteId: siteId || null,
        siteDisplay: String(siteDisplay || "").trim(),
        anomalyTypeId: String(anomalyTypeId || "").trim(),
        anomalyTypeLabel: String(anomalyTypeLabel || "").trim(),
        information: cleanInfo
      }
    }
  });
  const updated = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  return mapMainCouranteRow(updated);
}

/**
 * Action responsable : `decision` `suivre` (EN_COURS) ou clôture.
 * Audit `MAIN_COURANTE_MANAGER_SUIVRE` / `MAIN_COURANTE_MANAGER_CLOTURE`.
 */
function applyMainCouranteManagerAction(store, { requesterRole, requesterUsername, id, expectedUpdatedAt, managerName, managerObservation, decision, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:manager", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const row = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("mainCourante:manager", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
  }
  if (row.status === "CLOTURE") {
    store.fail("mainCourante:manager", "Cette entrée est déjà clôturée.", "MAIN_COURANTE_BAD_STATUS");
  }
  if (row.archived_at) {
    store.fail(
      "mainCourante:manager",
      "Cette entrée est archivée et ne peut plus être modifiée.",
      "MAIN_COURANTE_ARCHIVED_READONLY"
    );
  }
  if (row.updated_at !== expectedUpdatedAt) {
    store.fail(
      "mainCourante:manager",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
      "MAIN_COURANTE_CONFLICT"
    );
  }
  const now = new Date().toISOString();
  const newObs = String(managerObservation || "").trim();
  let nextStatus = row.status;
  let mergedObs = row.manager_observation || "";
  let priseAt = row.prise_en_compte_at || null;
  let closedAt = row.closed_at || null;

  if (row.status === "EN_ATTENTE") {
    if (decision === "suivre") {
      nextStatus = "EN_COURS";
      mergedObs = formatManagerObservation(managerName, newObs);
      priseAt = priseAt || now;
    } else {
      nextStatus = "CLOTURE";
      mergedObs = formatManagerObservation(managerName, newObs);
      priseAt = priseAt || now;
      closedAt = now;
    }
  } else if (row.status === "EN_COURS") {
    if (decision === "suivre") {
      mergedObs = mergeMainCouranteObservations(row.manager_observation, managerName, newObs);
    } else {
      nextStatus = "CLOTURE";
      mergedObs = mergeMainCouranteObservations(row.manager_observation, managerName, newObs);
      closedAt = now;
    }
  }

  const mgrName = String(managerName || "").trim();
  const result = store.db
    .prepare(
      `UPDATE main_courante_entries SET
        status = ?,
        manager_observation = ?,
        manager_name = ?,
        prise_en_compte_at = ?,
        closed_at = ?,
        updated_at = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run(nextStatus, mergedObs || null, mgrName || null, priseAt, closedAt, now, id, expectedUpdatedAt);
  if (result.changes === 0) {
    store.fail(
      "mainCourante:manager",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
      "MAIN_COURANTE_CONFLICT"
    );
  }
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: decision === "cloture" ? "MAIN_COURANTE_MANAGER_CLOTURE" : "MAIN_COURANTE_MANAGER_SUIVRE",
    details: {
      id,
      decision,
      before: {
        status: String(row.status || ""),
        managerObservation: String(row.manager_observation || ""),
        managerName: String(row.manager_name || ""),
        priseEnCompteAt: row.prise_en_compte_at || null,
        closedAt: row.closed_at || null
      },
      after: {
        status: nextStatus,
        managerObservation: mergedObs || "",
        managerName: mgrName || "",
        priseEnCompteAt: priseAt,
        closedAt: closedAt
      }
    }
  });
  const updated = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  return mapMainCouranteRow(updated);
}

/** Rouvre une entrée `CLOTURE` vers `EN_COURS` (responsable / DEV). */
function reopenMainCouranteEntry(store, { requesterRole, requesterUsername, id, expectedUpdatedAt, managerName, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:reopen", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const row = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  if (!row) {
    store.fail("mainCourante:reopen", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
  }
  if (row.status !== "CLOTURE") {
    store.fail("mainCourante:reopen", "Seules les entrées clôturées peuvent être rouvertes.", "MAIN_COURANTE_BAD_STATUS");
  }
  if (row.archived_at) {
    store.fail(
      "mainCourante:reopen",
      "Cette entrée est archivée et ne peut plus être rouverte.",
      "MAIN_COURANTE_ARCHIVED_READONLY"
    );
  }
  if (row.updated_at !== expectedUpdatedAt) {
    store.fail(
      "mainCourante:reopen",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
      "MAIN_COURANTE_CONFLICT"
    );
  }
  const now = new Date().toISOString();
  const mgrName = String(managerName || "").trim();
  const result = store.db
    .prepare(
      `UPDATE main_courante_entries SET
        status = ?,
        manager_name = ?,
        closed_at = ?,
        updated_at = ?
      WHERE id = ? AND updated_at = ?`
    )
    .run("EN_COURS", mgrName || null, null, now, id, expectedUpdatedAt);
  if (result.changes === 0) {
    store.fail(
      "mainCourante:reopen",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
      "MAIN_COURANTE_CONFLICT"
    );
  }
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_MANAGER_REOPEN",
    details: {
      id,
      before: {
        status: String(row.status || ""),
        managerName: String(row.manager_name || ""),
        closedAt: row.closed_at || null
      },
      after: {
        status: "EN_COURS",
        managerName: mgrName || "",
        closedAt: null
      }
    }
  });
  const updated = store.db.prepare("SELECT * FROM main_courante_entries WHERE id = ?").get(id);
  return mapMainCouranteRow(updated);
}

/** Vérifie l'existence d'une entrée (corrélation writer / file). */
function hasMainCouranteEntry(store, id) {
  if (!id) return false;
  const row = store.db.prepare("SELECT id FROM main_courante_entries WHERE id = ? LIMIT 1").get(id);
  return Boolean(row);
}

/** Badge sidebar : entrées non encore consultées par un responsable. */
function getMainCouranteUnconsultedCount(store, { requesterRole, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    return { count: 0 };
  }
  const row = store.db
    .prepare("SELECT COUNT(*) AS count FROM main_courante_entries WHERE consulted_by_manager_at IS NULL AND archived_at IS NULL")
    .get();
  return { count: Number(row?.count || 0) };
}

/** Marque une entrée comme consultée par le responsable (une seule fois). */
function markMainCouranteEntryConsulted(store, { requesterRole, requesterUsername, id, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:consulted", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const row = store.db
    .prepare("SELECT id, consulted_by_manager_at, consulted_by_manager_name FROM main_courante_entries WHERE id = ?")
    .get(id);
  if (!row) {
    store.fail("mainCourante:consulted", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
  }
  if (row.consulted_by_manager_at) {
    return { success: true };
  }
  const now = new Date().toISOString();
  store.db
    .prepare("UPDATE main_courante_entries SET consulted_by_manager_at = ?, consulted_by_manager_name = ? WHERE id = ?")
    .run(now, String(requesterUsername || "").trim() || null, id);
  return { success: true };
}

module.exports = {
  mapMainCouranteRow,
  listMainCouranteEntries,
  createMainCouranteEntry,
  updateMainCouranteEntryOperator,
  applyMainCouranteManagerAction,
  reopenMainCouranteEntry,
  getMainCouranteUnconsultedCount,
  markMainCouranteEntryConsulted,
  hasMainCouranteEntry
};
