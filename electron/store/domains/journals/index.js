/**
 * Journaux Paramètres : actions métier (`audit_logs`) et événements PG locaux (`gts-pg-events.log`).
 *
 * Consommé par `UserStore` (`listAuditLogs`, `getAuditMetadata`, `listTechErrorLogs`).
 *
 * @module electron/store/domains/journals
 */

const auditLogs = require("./auditLogs");
const techErrorLogs = require("./techErrorLogs");

module.exports = {
  auditLogs,
  techErrorLogs
};
