/**
 * Archivage logique de la main courante (marquage `archived_at` sur les entrées clôturées).
 *
 * Distinct de la rotation trimestrielle de fichier `.db` (`electron/main`, `archiveRunner`) :
 * ici les lignes restent dans la base active mais sortent des listes opérationnelles.
 * Appelé via `UserStore.archiveMainCouranteClosedEntries` depuis le writer / scheduler (`archive_run`).
 */

/**
 * Archive en lot les informations main courante clôturées depuis au moins `delayDays` jours.
 *
 * Critères : `status = 'CLOTURE'`, `closed_at` renseigné et antérieur à la date coupure,
 * `archived_at` encore vide. Un log d'audit agrégé est écrit uniquement s'il y a des candidats
 * (`MAIN_COURANTE_ARCHIVE_BATCH`, compteurs total / success / failed).
 *
 * @param {import('../userStore')} store
 * @param {object} [options]
 * @param {string} [options.requesterUsername="system:archive"] - Acteur journalisé (`archived_by`, audit).
 * @param {number} [options.delayDays=10] - Délai minimal après clôture avant archivage (≥ 0).
 * @returns {{ delayDays: number, cutoffDate: string, total: number, success: number, failed: number }}
 */
function archiveMainCouranteClosedEntries(store, { requesterUsername = "system:archive", delayDays = 10 } = {}) {
  const safeDelayDays = Math.max(0, Number(delayDays) || 0);
  const cutoffDate = new Date(Date.now() - safeDelayDays * 24 * 60 * 60 * 1000).toISOString();
  const actor = String(requesterUsername || "").trim() || "system:archive";

  const candidates = store.db
    .prepare(
      `SELECT id, status, closed_at, archived_at
       FROM main_courante_entries
       WHERE status = 'CLOTURE'
         AND closed_at IS NOT NULL
         AND datetime(closed_at) <= datetime(?)
         AND archived_at IS NULL`
    )
    .all(cutoffDate);

  let archivedCount = 0;
  for (const row of candidates) {
    const now = new Date().toISOString();
    const result = store.db
      .prepare(
        `UPDATE main_courante_entries
         SET archived_at = ?, archived_by = ?, archive_reason = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`
      )
      .run(now, actor, "Archivage automatique après clôture", now, row.id);
    if (result.changes > 0) archivedCount += 1;
  }

  if (candidates.length > 0) {
    store.logAudit({
      actorUsername: actor,
      action: "MAIN_COURANTE_ARCHIVE_BATCH",
      details: {
        delayDays: safeDelayDays,
        cutoffDate,
        total: candidates.length,
        success: archivedCount,
        failed: Math.max(0, candidates.length - archivedCount)
      }
    });
  }

  return {
    delayDays: safeDelayDays,
    cutoffDate,
    total: candidates.length,
    success: archivedCount,
    failed: Math.max(0, candidates.length - archivedCount)
  };
}

module.exports = {
  archiveMainCouranteClosedEntries
};
