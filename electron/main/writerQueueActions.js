/**
 * Dispatch des actions métier exécutées par le worker de file SMB writer (`writerQueueWorker.js`).
 * Chaque `action` correspond au champ JSON d'une requête dans `incoming/` (aligné sur `ipcDomainHandlers` / `writerQueueEnqueue`).
 *
 * Module pur exportant `executeQueuedAction` ; le `userStore` et les hooks d'archivage sont injectés par `main.js`.
 */

/**
 * Exécute une action file d'attente côté nœud writer (Master / Backup).
 *
 * @param {string} action - Code d'action (ex. `intervention_create`, `update_operator`, `archive_run`, `create`).
 * @param {object} payload - Corps métier (`requesterRole`, `requesterUsername`, champs domaine).
 * @param {object} deps - Dépendances fournies par le worker via `main.js`.
 * @param {import('../userStore')} deps.userStore - Store SQLite du writer.
 * @param {(trigger: string) => object} deps.ensureQuarterRotationIfNeeded - Rotation trimestrielle (archivage).
 * @param {(opts: object) => object} deps.runLogicalArchiveNow - Archivage logique main courante.
 * @param {(() => void)|undefined} deps.onArchiveRunProcessed - Callback après `archive_run` (décrément jobs, etc.).
 * @returns {Promise<object>} Résultat de la méthode store invoquée.
 *
 * Replis :
 * - Action inconnue ou `create` → `userStore.createMainCouranteEntry(payload)` (création main courante file).
 */
async function executeQueuedAction(action, payload, deps) {
  const {
    userStore,
    ensureQuarterRotationIfNeeded,
    runLogicalArchiveNow,
    onArchiveRunProcessed
  } = deps;

  if (action === "update_operator") {
    return userStore.updateMainCouranteEntryOperator(payload);
  }
  if (action === "manager_action") {
    return userStore.applyMainCouranteManagerAction(payload);
  }
  if (action === "manager_reopen") {
    return userStore.reopenMainCouranteEntry(payload);
  }
  if (action === "intervention_create") {
    return userStore.createInterventionEntry(payload);
  }
  if (action === "intervention_update") {
    return userStore.updateInterventionEntry(payload);
  }
  if (action === "intervention_status") {
    return userStore.setInterventionStatus(payload);
  }
  if (action === "intervention_billing") {
    return userStore.setInterventionBillingStatus(payload);
  }
  if (action === "intervention_pending_site") {
    return userStore.createPendingInterventionSite(payload);
  }
  if (action === "intervention_pending_intervenant") {
    return userStore.createPendingInterventionIntervenant(payload);
  }
  if (action === "intervention_pending_site_resolve") {
    return userStore.resolvePendingInterventionSite(payload);
  }
  if (action === "intervention_pending_intervenant_resolve") {
    return userStore.resolvePendingInterventionIntervenant(payload);
  }
  if (action === "intervention_pending_site_delete") {
    return userStore.deletePendingInterventionSite(payload);
  }
  if (action === "intervention_pending_intervenant_delete") {
    return userStore.deletePendingInterventionIntervenant(payload);
  }
  if (action === "ronde_create") {
    return userStore.createRondeEntry(payload);
  }
  if (action === "ronde_update") {
    return userStore.updateRondeEntry(payload);
  }
  if (action === "ronde_status") {
    return userStore.setRondeStatus(payload);
  }
  if (action === "ronde_batch_update") {
    return userStore.updateRondeBatchSharedFields(payload);
  }
  if (action === "ronde_batch_cancel") {
    return userStore.bulkCancelRondeBatch(payload);
  }
  if (action === "ronde_batch_delete") {
    return userStore.bulkDeleteRondeBatch(payload);
  }
  if (action === "gardiennage_create") {
    return userStore.createGardiennage(payload);
  }
  if (action === "gardiennage_update") {
    return userStore.updateGardiennage(payload);
  }
  if (action === "gardiennage_status") {
    return userStore.setGardiennageStatus(payload);
  }
  if (action === "gardiennage_delete") {
    return userStore.deleteGardiennage(payload);
  }
  if (action === "gardiennage_close") {
    return userStore.closeGardiennage(payload);
  }
  if (action === "gardiennage_reopen") {
    return userStore.reopenGardiennage(payload);
  }
  if (action === "archive_run") {
    const result = {
      rotation: ensureQuarterRotationIfNeeded("queue"),
      logical: runLogicalArchiveNow({ trigger: "queue", requesterUsername: "system:archive" })
    };
    if (typeof onArchiveRunProcessed === "function") {
      onArchiveRunProcessed();
    }
    return result;
  }
  return userStore.createMainCouranteEntry(payload);
}

module.exports = {
  executeQueuedAction
};
