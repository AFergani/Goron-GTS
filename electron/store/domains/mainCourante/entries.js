/**
 * CRUD et workflow Main courante (`main_courante_entries`) — PostgreSQL seulement.
 *
 * Statuts : `EN_ATTENTE` → `EN_COURS` (suivi) ou `CLOTURE`.
 * Écritures concurrentes : transaction + `FOR UPDATE` + contrôle `updated_at`.
 * Badges sidebar : consultation responsable / réponse encadrement côté opérateur.
 * Propagation site pending : `propagateSiteIdToMainCouranteEntries` / `hasMainCouranteLinkedToPendingSiteDisplay`.
 *
 * @module electron/store/domains/mainCourante/entries
 */

const { parseExportExtraJson, stringifyExportExtraJson } = require("../../core/exportExtraJson");
const { assertOptimisticLock } = require("../data/optimisticLock");
const { requireMainCourantePersistence } = require("./persistence");
const { allocateNextDailyCode, localDayIsoFromTimestamp } = require("../../core/dailyEntryCode");
const {
  MAIN_COURANTE_ENTRY_SELECT,
  requireEntryId,
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
  const rows = await db.all(
    `SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries ORDER BY created_at DESC`,
    []
  );
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
  {
    requesterRole,
    requesterUsername,
    id,
    operatorName,
    siteId,
    siteDisplay,
    anomalyTypeId,
    anomalyTypeLabel,
    information,
    exportExtraValues
  }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireMainCourantePersistence(store, "mainCourante:create");
  const entryId = requireEntryId(store, { id }, "mainCourante:create");
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

  const now = new Date().toISOString();
  const siteDisplayClean = String(siteDisplay || "").trim();
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.get(
      `SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (existing) return { existing };
    const dailyCode = await allocateNextDailyCode(tx, "main_courante", localDayIsoFromTimestamp(now));
    await tx.run(
      `INSERT INTO main_courante_entries (
        id, created_at, operator_name, site_id, site_display,
        anomaly_type_id, anomaly_type_label, information, status, updated_at, daily_code,
        export_extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryId,
        now,
        cleanOperator,
        siteId || null,
        siteDisplayClean,
        cleanTypeId,
        cleanTypeLabel,
        cleanInfo,
        "EN_ATTENTE",
        now,
        dailyCode,
        stringifyExportExtraJson(exportExtraValues)
      ]
    );
    return { existing: null };
  });

  if (outcome.existing) {
    const existingMapped = mapMainCouranteRow(outcome.existing);
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "MAIN_COURANTE_CREATE_IDEMPOTENT",
      details: {
        id: entryId,
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

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_CREATE",
    details: {
      id: entryId,
      created: {
        operatorName: cleanOperator,
        siteDisplay: siteDisplayClean,
        anomalyTypeLabel: cleanTypeLabel,
        information: cleanInfo,
        status: "EN_ATTENTE"
      }
    }
  });
  const row = await db.get(`SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ?`, [
    entryId
  ]);
  return mapMainCouranteRow(row);
}

/**
 * Modification opérateur : uniquement ses entrées `EN_ATTENTE`.
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
    requesterFullName,
    exportExtraValues
  }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireMainCourantePersistence(store, "mainCourante:updateOp");
  const entryId = requireEntryId(store, { id }, "mainCourante:updateOp");
  const cleanInfo = String(information || "").trim();
  if (!cleanInfo) {
    store.fail("mainCourante:updateOp", "Le texte d'information est obligatoire.", "MAIN_COURANTE_INFO_REQUIRED");
  }
  const cleanTypeId = String(anomalyTypeId || "").trim();
  const cleanTypeLabel = String(anomalyTypeLabel || "").trim();
  if (!cleanTypeId || !cleanTypeLabel) {
    store.fail("mainCourante:updateOp", "Le type d'anomalie est obligatoire.", "MAIN_COURANTE_TYPE_REQUIRED");
  }

  const siteDisplayClean = String(siteDisplay || "").trim();
  const before = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
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
    if (!sameOperatorDisplay(row.operator_name, requesterFullName)) {
      store.fail("mainCourante:updateOp", "Vous ne pouvez modifier que vos propres entrées.", "MAIN_COURANTE_FORBIDDEN");
    }
    assertOptimisticLock(
      store,
      "mainCourante:updateOp",
      row,
      expectedUpdatedAt,
      "MAIN_COURANTE_CONFLICT",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez."
    );
    const now = new Date().toISOString();
    const result = await tx.run(
      `UPDATE main_courante_entries SET
        site_id = ?,
        site_display = ?,
        anomaly_type_id = ?,
        anomaly_type_label = ?,
        information = ?,
        export_extra_json = ?,
        updated_at = ?
      WHERE id = ? AND updated_at = ?`,
      [
        siteId || null,
        siteDisplayClean,
        cleanTypeId,
        cleanTypeLabel,
        cleanInfo,
        stringifyExportExtraJson({
          ...parseExportExtraJson(row.export_extra_json),
          ...(exportExtraValues && typeof exportExtraValues === "object" ? exportExtraValues : {})
        }),
        now,
        entryId,
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
    return row;
  });

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_UPDATE_OPERATOR",
    details: {
      id: entryId,
      before: {
        siteId: before.site_id || null,
        siteDisplay: String(before.site_display || ""),
        anomalyTypeId: String(before.anomaly_type_id || ""),
        anomalyTypeLabel: String(before.anomaly_type_label || ""),
        information: String(before.information || "")
      },
      after: {
        siteId: siteId || null,
        siteDisplay: siteDisplayClean,
        anomalyTypeId: cleanTypeId,
        anomalyTypeLabel: cleanTypeLabel,
        information: cleanInfo
      }
    }
  });
  const updated = await db.get(`SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ?`, [
    entryId
  ]);
  return mapMainCouranteRow(updated);
}

/**
 * Action responsable : `decision` `suivre` (EN_COURS) ou `cloture`.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function applyMainCouranteManagerAction(
  store,
  {
    requesterRole,
    requesterUsername,
    id,
    expectedUpdatedAt,
    managerName,
    managerObservation,
    decision,
    role,
    exportExtraValues
  }
) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    store.fail("mainCourante:manager", "Accès refusé : droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
  const normalizedDecision = String(decision || "").trim();
  if (normalizedDecision !== "suivre" && normalizedDecision !== "cloture") {
    store.fail(
      "mainCourante:manager",
      "Décision invalide (suivre ou clôture attendue).",
      "MAIN_COURANTE_BAD_DECISION"
    );
  }
  const db = requireMainCourantePersistence(store, "mainCourante:manager");
  const entryId = requireEntryId(store, { id }, "mainCourante:manager");
  const mgrName = String(managerName || "").trim();
  const newObs = String(managerObservation || "").trim();

  const outcome = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) {
      store.fail("mainCourante:manager", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
    }
    if (row.status === "CLOTURE") {
      store.fail("mainCourante:manager", "Cette entrée est déjà clôturée.", "MAIN_COURANTE_BAD_STATUS");
    }
    assertOptimisticLock(
      store,
      "mainCourante:manager",
      row,
      expectedUpdatedAt,
      "MAIN_COURANTE_CONFLICT",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez."
    );

    const now = new Date().toISOString();
    let nextStatus = row.status;
    let mergedObs = row.manager_observation || "";
    let priseAt = row.prise_en_compte_at || null;
    let closedAt = row.closed_at || null;

    if (row.status === "EN_ATTENTE") {
      if (normalizedDecision === "suivre") {
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
      if (normalizedDecision === "suivre") {
        mergedObs = mergeMainCouranteObservations(row.manager_observation, managerName, newObs);
      } else {
        nextStatus = "CLOTURE";
        mergedObs = mergeMainCouranteObservations(row.manager_observation, managerName, newObs);
        closedAt = now;
      }
    }

    const result = await tx.run(
      `UPDATE main_courante_entries SET
        status = ?,
        manager_observation = ?,
        manager_name = ?,
        prise_en_compte_at = ?,
        closed_at = ?,
        export_extra_json = ?,
        updated_at = ?
      WHERE id = ? AND updated_at = ?`,
      [
        nextStatus,
        mergedObs || null,
        mgrName || null,
        priseAt,
        closedAt,
        stringifyExportExtraJson({
          ...parseExportExtraJson(row.export_extra_json),
          ...(exportExtraValues && typeof exportExtraValues === "object" ? exportExtraValues : {})
        }),
        now,
        entryId,
        expectedUpdatedAt
      ]
    );
    if (!result.changes) {
      store.fail(
        "mainCourante:manager",
        "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
        "MAIN_COURANTE_CONFLICT"
      );
    }
    return {
      before: row,
      after: {
        status: nextStatus,
        managerObservation: mergedObs || "",
        managerName: mgrName || "",
        priseEnCompteAt: priseAt,
        closedAt
      }
    };
  });

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: normalizedDecision === "cloture" ? "MAIN_COURANTE_MANAGER_CLOTURE" : "MAIN_COURANTE_MANAGER_SUIVRE",
    details: {
      id: entryId,
      decision: normalizedDecision,
      before: {
        status: String(outcome.before.status || ""),
        managerObservation: String(outcome.before.manager_observation || ""),
        managerName: String(outcome.before.manager_name || ""),
        priseEnCompteAt: outcome.before.prise_en_compte_at || null,
        closedAt: outcome.before.closed_at || null
      },
      after: outcome.after
    }
  });
  const updated = await db.get(`SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ?`, [
    entryId
  ]);
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
  const entryId = requireEntryId(store, { id }, "mainCourante:reopen");
  const mgrName = String(managerName || "").trim();

  const before = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) {
      store.fail("mainCourante:reopen", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
    }
    if (row.status !== "CLOTURE") {
      store.fail("mainCourante:reopen", "Seules les entrées clôturées peuvent être rouvertes.", "MAIN_COURANTE_BAD_STATUS");
    }
    assertOptimisticLock(
      store,
      "mainCourante:reopen",
      row,
      expectedUpdatedAt,
      "MAIN_COURANTE_CONFLICT",
      "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez."
    );
    const now = new Date().toISOString();
    const result = await tx.run(
      `UPDATE main_courante_entries SET
        status = ?,
        manager_name = ?,
        closed_at = ?,
        updated_at = ?
      WHERE id = ? AND updated_at = ?`,
      ["EN_COURS", mgrName || null, null, now, entryId, expectedUpdatedAt]
    );
    if (!result.changes) {
      store.fail(
        "mainCourante:reopen",
        "Cette entrée a été modifiée ailleurs. Actualisez la liste puis réessayez.",
        "MAIN_COURANTE_CONFLICT"
      );
    }
    return row;
  });

  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "MAIN_COURANTE_MANAGER_REOPEN",
    details: {
      id: entryId,
      before: {
        status: String(before.status || ""),
        managerName: String(before.manager_name || ""),
        closedAt: before.closed_at || null
      },
      after: {
        status: "EN_COURS",
        managerName: mgrName || "",
        closedAt: null
      }
    }
  });
  const updated = await db.get(`SELECT ${MAIN_COURANTE_ENTRY_SELECT} FROM main_courante_entries WHERE id = ?`, [
    entryId
  ]);
  return mapMainCouranteRow(updated);
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
     WHERE consulted_by_manager_at IS NULL`,
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
     WHERE prise_en_compte_at IS NOT NULL
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
  const entryId = requireEntryId(store, { id }, "mainCourante:operatorConsulted");
  const fullName = await resolveUserFullNameByUsername(store, requesterUsername);
  await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT id, operator_name, prise_en_compte_at, consulted_by_operator_at
       FROM main_courante_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) {
      store.fail("mainCourante:operatorConsulted", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
    }
    if (!sameOperatorDisplay(row.operator_name, fullName)) {
      store.fail("mainCourante:operatorConsulted", "Accès refusé.", "MAIN_COURANTE_FORBIDDEN");
    }
    if (!row.prise_en_compte_at || row.consulted_by_operator_at) {
      return;
    }
    await tx.run("UPDATE main_courante_entries SET consulted_by_operator_at = ? WHERE id = ?", [
      new Date().toISOString(),
      row.id
    ]);
  });
  return { success: true };
}

/**
 * Marque une entrée comme consultée par le responsable (une seule fois).
 * Stocke le nom affiché (pas le login) dans `consulted_by_manager_name`.
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
  const entryId = requireEntryId(store, { id }, "mainCourante:consulted");
  const displayName =
    (await resolveUserFullNameByUsername(store, requesterUsername)) ||
    String(requesterUsername || "").trim() ||
    null;
  await db.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT id, consulted_by_manager_at FROM main_courante_entries WHERE id = ? FOR UPDATE",
      [entryId]
    );
    if (!row) {
      store.fail("mainCourante:consulted", "Entrée introuvable.", "MAIN_COURANTE_NOT_FOUND");
    }
    if (row.consulted_by_manager_at) {
      return;
    }
    await tx.run(
      "UPDATE main_courante_entries SET consulted_by_manager_at = ?, consulted_by_manager_name = ? WHERE id = ?",
      [new Date().toISOString(), displayName, entryId]
    );
  });
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
/**
 * Propage un `site_id` vers les entrées orphelines (affichage libre sans id).
 *
 * @param {import('../../../userStore')} store
 * @param {string} siteId
 * @param {string} canonicalDisplay
 * @param {string} likePattern
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} [executor] - Tx/connexion partagée
 * @returns {Promise<number>} Nombre de lignes mises à jour.
 */
async function propagateSiteIdToMainCouranteEntries(store, siteId, canonicalDisplay, likePattern, executor) {
  const db = executor || requireMainCourantePersistence(store, "mainCourante:propagateSite");
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
  const db = requireMainCourantePersistence(store, "mainCourante:linkedPendingSite");
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
  propagateSiteIdToMainCouranteEntries,
  hasMainCouranteLinkedToPendingSiteDisplay
};
