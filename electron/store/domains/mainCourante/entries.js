/**
 * CRUD et workflow Main courante (`main_courante_entries`) — PostgreSQL seulement.
 *
 * Statuts : `EN_ATTENTE` → `EN_COURS` (suivi) ou `CLOTURE`.
 * Aucune compatibilité SQLite ou historique local n'est conservée dans ce module.
 *
 * @module electron/store/domains/mainCourante/entries
 */

const { requireMainCourantePersistence } = require("./persistence");
const {
  sameOperatorDisplay,
  formatManagerObservation,
  mergeMainCouranteObservations,
  mapMainCouranteRow
} = require("./mapping");

/**
 * Liste toutes les entrées main courante (filtres d'affichage côté UI).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listMainCouranteEntries(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireMainCourantePersistence(store, "mainCourante:list");
  const rows = await db.all(`SELECT * FROM main_courante_entries ORDER BY created_at DESC`, []);
  return rows.map((row) => mapMainCouranteRow(row));
}

/**
 * Crée une information (`EN_ATTENTE`) ; idempotent si `id` existe déjà.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function createMainCouranteEntry(
  store,
  { requesterRole, requesterUsername, id, operatorName, siteId, siteDisplay, anomalyTypeId, anomalyTypeLabel, information }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireMainCourantePersistence(store, "mainCourante:create");
  const cleanInfo = String(information || "").trim();
  if (!cleanInfo) {
    store.fail("mainCourante:create", "Le texte d'information est obligatoire.", "MAIN_COURANTE_INFO_REQUIRED");
  }
  const cleanOperator = String(operatorName || "").trim();
  if (!cleanOperator) {
    store.fail("mainCourante:create", "Opérateur invalide.", "MAIN_COURANTE_OPERATOR_REQUIRED");
  }
  const cleanTypeId = String(anomalyTypeId || "").trim();
  const cleanTypeLabel = String(anomalyTypeLabel || "").trim();
  if (!cleanTypeId || !cleanTypeLabel) {
    store.fail("mainCourante:create", "Le type d'anomalie est obligatoire.", "MAIN_COURANTE_TYPE_REQUIRED");
  }
  const existing = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
  if (existing) {
    const existingMapped = mapMainCouranteRow(existing);
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "MAIN_COURANTE_CREATE_IDEMPOTENT",
      details: {
        id,
        existing: {
          operatorName: existingMapped.operatorName,
          siteDisplay: existingMapped.siteDisplay,
          anomalyTypeLabel: existingMapped.anomalyTypeLabel,
          information: existingMapped.information,
          status: existingMapped.status
        }
      }
    });
    return existingMapped;
  }
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO main_courante_entries (
      id, created_at, operator_name, site_id, site_display,
      anomaly_type_id, anomaly_type_label, information, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      now,
      cleanOperator,
      siteId || null,
      String(siteDisplay || "").trim(),
      cleanTypeId,
      cleanTypeLabel,
      cleanInfo,
      "EN_ATTENTE",
      now
    ]
  );
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_CREATE",
    details: {
      id,
      created: {
        operatorName: cleanOperator,
        siteDisplay: String(siteDisplay || "").trim(),
        anomalyTypeLabel: cleanTypeLabel,
        information: cleanInfo,
        status: "EN_ATTENTE"
      }
    }
  });
  const row = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
  return mapMainCouranteRow(row);
}

/**
 * Modification opérateur : uniquement ses entrées `EN_ATTENTE`, non archivées.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function updateMainCouranteEntryOperator(
  store,
  {
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    siteId,
    siteDisplay,
    anomalyTypeId,
    anomalyTypeLabel,
    information,
    requesterFullName
  }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireMainCourantePersistence(store, "mainCourante:updateOp");
  const cleanInfo = String(information || "").trim();
  if (!cleanInfo) {
    store.fail("mainCourante:updateOp", "Le texte d'information est obligatoire.", "MAIN_COURANTE_INFO_REQUIRED");
  }
  const cleanTypeId = String(anomalyTypeId || "").trim();
  const cleanTypeLabel = String(anomalyTypeLabel || "").trim();
  if (!cleanTypeId || !cleanTypeLabel) {
    store.fail("mainCourante:updateOp", "Le type d'anomalie est obligatoire.", "MAIN_COURANTE_TYPE_REQUIRED");
  }
  const row = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
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
  const result = await db.run(
    `UPDATE main_courante_entries SET
      site_id = ?,
      site_display = ?,
      anomaly_type_id = ?,
      anomaly_type_label = ?,
      information = ?,
      updated_at = ?
    WHERE id = ? AND updated_at = ?`,
    [
      siteId || null,
      String(siteDisplay || "").trim(),
      cleanTypeId,
      cleanTypeLabel,
      cleanInfo,
      now,
      id,
      expectedUpdatedAt
    ]
  );
  if (!result.changes) {
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
        anomalyTypeId: cleanTypeId,
        anomalyTypeLabel: cleanTypeLabel,
        information: cleanInfo
      }
    }
  });
  const updated = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
  return mapMainCouranteRow(updated);
}

/**
 * Action responsable : `decision` `suivre` (EN_COURS) ou clôture.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function applyMainCouranteManagerAction(
  store,
  { requesterRole, requesterUsername, id, expectedUpdatedAt, managerName, managerObservation, decision, role }
) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:manager", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const db = requireMainCourantePersistence(store, "mainCourante:manager");
  const row = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
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
  const result = await db.run(
    `UPDATE main_courante_entries SET
      status = ?,
      manager_observation = ?,
      manager_name = ?,
      prise_en_compte_at = ?,
      closed_at = ?,
      updated_at = ?
    WHERE id = ? AND updated_at = ?`,
    [nextStatus, mergedObs || null, mgrName || null, priseAt, closedAt, now, id, expectedUpdatedAt]
  );
  if (!result.changes) {
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
        closedAt
      }
    }
  });
  const updated = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
  return mapMainCouranteRow(updated);
}

/**
 * Rouvre une entrée `CLOTURE` vers `EN_COURS` (responsable / DEV).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function reopenMainCouranteEntry(
  store,
  { requesterRole, requesterUsername, id, expectedUpdatedAt, managerName, role }
) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:reopen", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const db = requireMainCourantePersistence(store, "mainCourante:reopen");
  const row = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
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
  const result = await db.run(
    `UPDATE main_courante_entries SET
      status = ?,
      manager_name = ?,
      closed_at = ?,
      updated_at = ?
    WHERE id = ? AND updated_at = ?`,
    ["EN_COURS", mgrName || null, null, now, id, expectedUpdatedAt]
  );
  if (!result.changes) {
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
  const updated = await db.get("SELECT * FROM main_courante_entries WHERE id = ?", [id]);
  return mapMainCouranteRow(updated);
}

/**
 * Vérifie l'existence d'une entrée (corrélation idempotence / imports).
 *
 * @param {import('../../../userStore')} store
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function hasMainCouranteEntry(store, id) {
  if (!id) return false;
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return false;
  const row = await db.get("SELECT id FROM main_courante_entries WHERE id = ? LIMIT 1", [id]);
  return Boolean(row);
}

/**
 * Badge sidebar : entrées non encore consultées par un responsable.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, role: object }} payload
 * @returns {Promise<{ count: number }>}
 */
async function getMainCouranteUnconsultedCount(store, { requesterRole, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    return { count: 0 };
  }
  const db = requireMainCourantePersistence(store, "mainCourante:unconsulted");
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM main_courante_entries
     WHERE consulted_by_manager_at IS NULL
       AND archived_at IS NULL`,
    []
  );
  return { count: Number(row?.count || 0) };
}

/**
 * Résout le nom affiché d'un utilisateur à partir de son login technique.
 *
 * @param {import('../../../userStore')} store
 * @param {string} username
 * @returns {Promise<string>}
 */
async function resolveUserFullNameByUsername(store, username) {
  const usersDb = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  if (!usersDb || !usersDb.isOpen()) return "";
  const row = await usersDb.get("SELECT full_name FROM users WHERE username = ?", [String(username || "").trim()]);
  return String(row?.full_name || "").trim();
}

/**
 * Badge sidebar opérateur : entrées créées par l'utilisateur ayant reçu une réponse encadrement non lues.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername: string, role: object }} payload
 * @returns {Promise<{ count: number }>}
 */
async function getMainCouranteOperatorResponseCount(store, { requesterRole, requesterUsername, role }) {
  if (requesterRole === role.RESPONSABLE || requesterRole === role.DEV) {
    return { count: 0 };
  }
  const db = requireMainCourantePersistence(store, "mainCourante:operatorResponseCount");
  const fullName = await resolveUserFullNameByUsername(store, requesterUsername);
  if (!fullName) return { count: 0 };
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM main_courante_entries
     WHERE archived_at IS NULL
       AND prise_en_compte_at IS NOT NULL
       AND consulted_by_operator_at IS NULL
       AND lower(trim(operator_name)) = lower(trim(?))`,
    [fullName]
  );
  return { count: Number(row?.count || 0) };
}

/**
 * Marque une entrée comme consultée par l'opérateur créateur (badge « réponse reçue »).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function markMainCouranteEntryConsultedByOperator(store, { requesterRole, requesterUsername, id, role }) {
  if (requesterRole === role.RESPONSABLE || requesterRole === role.DEV) {
    return { success: true };
  }
  const db = requireMainCourantePersistence(store, "mainCourante:operatorConsulted");
  const fullName = await resolveUserFullNameByUsername(store, requesterUsername);
  const row = await db.get("SELECT id, operator_name, prise_en_compte_at, consulted_by_operator_at FROM main_courante_entries WHERE id = ?", [
    String(id || "").trim()
  ]);
  if (!row) {
    store.fail("mainCourante:operatorConsulted", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
  }
  if (!sameOperatorDisplay(row.operator_name, fullName)) {
    store.fail("mainCourante:operatorConsulted", "Accès refusé.", "MAIN_COURANTE_FORBIDDEN");
  }
  if (!row.prise_en_compte_at) {
    return { success: true };
  }
  if (row.consulted_by_operator_at) {
    return { success: true };
  }
  await db.run("UPDATE main_courante_entries SET consulted_by_operator_at = ? WHERE id = ?", [
    new Date().toISOString(),
    row.id
  ]);
  return { success: true };
}

/**
 * Marque une entrée comme consultée par le responsable (une seule fois).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function markMainCouranteEntryConsulted(store, { requesterRole, requesterUsername, id, role }) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:consulted", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const db = requireMainCourantePersistence(store, "mainCourante:consulted");
  const row = await db.get(
    "SELECT id, consulted_by_manager_at, consulted_by_manager_name FROM main_courante_entries WHERE id = ?",
    [id]
  );
  if (!row) {
    store.fail("mainCourante:consulted", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
  }
  if (row.consulted_by_manager_at) {
    return { success: true };
  }
  const now = new Date().toISOString();
  await db.run(
    "UPDATE main_courante_entries SET consulted_by_manager_at = ?, consulted_by_manager_name = ? WHERE id = ?",
    [now, String(requesterUsername || "").trim() || null, id]
  );
  return { success: true };
}

/**
 * Propage un site validé vers les entrées main courante encore sans `site_id`.
 *
 * @param {import('../../../userStore')} store
 * @param {string} siteId
 * @param {string} canonicalDisplay
 * @param {string} likePattern
 * @returns {Promise<number>} Nombre de lignes mises à jour.
 */
async function propagateSiteIdToMainCouranteEntries(store, siteId, canonicalDisplay, likePattern) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return 0;
  const result = await db.run(
    `UPDATE main_courante_entries
     SET site_id = ?, site_display = ?
     WHERE site_id IS NULL
       AND lower(site_display) LIKE lower(?)`,
    [siteId, canonicalDisplay, likePattern]
  );
  return Number(result.changes || 0);
}

/**
 * Indique si un site pending (code dans site_display) est encore lié à une entrée.
 *
 * @param {import('../../../userStore')} store
 * @param {string} likePattern
 * @returns {Promise<boolean>}
 */
async function hasMainCouranteLinkedToPendingSiteDisplay(store, likePattern) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return false;
  const row = await db.get(
    `SELECT id FROM main_courante_entries
     WHERE site_id IS NULL
       AND lower(site_display) LIKE lower(?)
     LIMIT 1`,
    [likePattern]
  );
  return Boolean(row);
}

module.exports = {
  listMainCouranteEntries,
  createMainCouranteEntry,
  updateMainCouranteEntryOperator,
  applyMainCouranteManagerAction,
  reopenMainCouranteEntry,
  getMainCouranteUnconsultedCount,
  getMainCouranteOperatorResponseCount,
  markMainCouranteEntryConsulted,
  markMainCouranteEntryConsultedByOperator,
  hasMainCouranteEntry,
  propagateSiteIdToMainCouranteEntries,
  hasMainCouranteLinkedToPendingSiteDisplay
};
