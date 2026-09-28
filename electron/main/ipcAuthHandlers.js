/**
 * Enregistrement des canaux IPC d'authentification et de session (`auth:*`).
 *
 * Relie le renderer (`preload.js` / `gtsApi`) au `UserStore`, aux sessions locales
 * et au code administrateur chiffré (profil DEV).
 * Appelé une fois depuis `main.js`.
 *
 * @module electron/main/ipcAuthHandlers
 */

const os = require("os");
const { resolveAdminEncFilePath, writeEncryptedAdminCode } = require("../store/core/adminAccess");

/**
 * Enregistre les handlers IPC liés à la connexion, déconnexion et code admin.
 *
 * @param {object} deps
 * @param {(channel: string, handler: Function) => void} deps.handleIpc - IPC sans session obligatoire.
 * @param {(channel: string, handler: Function) => void} deps.handleIpcAuth - IPC authentifié.
 * @param {() => void} deps.ensureStore
 * @param {() => import('../userStore')} deps.getUserStore
 * @param {(username: string) => string} deps.createSession
 * @param {(sessionToken?: string) => void} deps.revokeSession
 * @returns {void}
 */
function registerAuthIpcHandlers(deps) {
  const {
    handleIpc,
    handleIpcAuth,
    ensureStore,
    getUserStore,
    createSession,
    revokeSession
  } = deps;

  handleIpc("auth:login", async (payload) => {
    ensureStore();
    const userStore = getUserStore();
    const result = await userStore.login(payload);
    const sessionToken = createSession(result.user.username);
    try {
      await userStore.upsertUserPresence({
        username: result.user.username,
        sessionToken,
        hostname: os.hostname()
      });
    } catch {
      // Présence rattrapée par le heartbeat si PG flap.
    }
    return { ...result, sessionToken };
  });

  handleIpcAuth("auth:setAdminCode", (payload) => {
    const { requesterRole, code } = payload;
    if (requesterRole !== "DEV") {
      throw new Error("Accès refusé : seul le compte Admin peut modifier le code administrateur.");
    }
    const newCode = String(code || "").trim();
    if (!newCode || newCode.length < 8) {
      throw new Error("Le code administrateur doit contenir au moins 8 caractères.");
    }
    const userStore = getUserStore();
    const encFilePath = resolveAdminEncFilePath(userStore.userDataPath);
    if (!encFilePath) {
      throw new Error("Impossible de déterminer le dossier de données pour le code administrateur.");
    }
    writeEncryptedAdminCode(encFilePath, newCode);
    userStore.devMasterCode = newCode;
    userStore.adminAccessEnabled = true;
    return { success: true };
  });

  handleIpc("auth:firstLogin", (payload) => {
    ensureStore();
    return getUserStore().completeFirstLogin(payload);
  });

  // Non authentifié par construction : la légitimité repose sur le collègue validateur,
  // qui fournit ses propres identifiants dans la charge utile.
  handleIpc("auth:resetPasswordWithPeer", (payload) => {
    ensureStore();
    return getUserStore().resetPasswordWithPeerValidation(payload);
  });

  handleIpc("auth:logout", async (payload) => {
    const token = payload?.sessionToken;
    try {
      ensureStore();
      await getUserStore().clearUserPresence({ sessionToken: token });
    } catch {
      // ignore
    }
    revokeSession(token);
    return { success: true };
  });
}

module.exports = {
  registerAuthIpcHandlers
};
