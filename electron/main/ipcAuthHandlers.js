/**
 * Enregistrement des canaux IPC d'authentification et de session (`auth:*`).
 * Relie le renderer (`preload.js` / `gtsApi`) au `UserStore`, au gestionnaire de sessions
 * et au stockage chiffré du code administrateur (profil DEV).
 *
 * Appelé une fois au démarrage du processus principal via `registerAuthIpcHandlers` dans `main.js`.
 */

/**
 * Enregistre les handlers IPC liés à la connexion, déconnexion et code admin.
 *
 * @param {object} deps - Dépendances fournies par `main.js`.
 * @param {(channel: string, handler: Function) => void} deps.handleIpc - IPC sans session obligatoire.
 * @param {(channel: string, handler: Function) => void} deps.handleIpcAuth - IPC avec contexte authentifié (`requesterRole`, etc.).
 * @param {() => void} deps.ensureStore - Lance une erreur si la base n'est pas configurée.
 * @param {() => import('../userStore')} deps.getUserStore - Instance store courante.
 * @param {(dbPath: string, username: string) => string} deps.createSession - Crée un jeton de session après login.
 * @param {(sessionToken?: string) => void} deps.revokeSession - Invalide le jeton à la déconnexion.
 * @param {import('path')} deps.path - Chemins sous `userData`.
 * @param {import('electron').App} deps.app - Accès `getPath('userData')`.
 * @param {string} deps.ADMIN_ENC_FILE_NAME - Nom du fichier code admin chiffré.
 * @param {(filePath: string, code: string) => void} deps.writeEncryptedAdminCode - Persistance chiffrée du code.
 * @returns {void}
 */
function registerAuthIpcHandlers(deps) {
  const {
    handleIpc,
    handleIpcAuth,
    ensureStore,
    getUserStore,
    createSession,
    revokeSession,
    path,
    app,
    ADMIN_ENC_FILE_NAME,
    writeEncryptedAdminCode
  } = deps;

  /**
   * Canal `auth:login` — authentification par nom affiché / mot de passe, émission d'un `sessionToken`.
   *
   * @param {object} payload - Transmis à `userStore.login` (nom affiché, mot de passe).
   * @returns {Promise<object>} Résultat login enrichi de `sessionToken`.
   */
  handleIpc("auth:login", (payload) => {
    ensureStore();
    const userStore = getUserStore();
    const result = userStore.login(payload);
    const sessionToken = createSession(userStore.dbPath, result.user.username);
    return { ...result, sessionToken };
  });

  /**
   * Canal `auth:getAdminAccessStatus` — indique si l'accès administrateur (code maître) est activé sur le poste.
   *
   * @returns {Promise<{ enabled: boolean }>}
   */
  handleIpc("auth:getAdminAccessStatus", () => {
    ensureStore();
    return {
      enabled: Boolean(getUserStore().adminAccessEnabled)
    };
  });

  /**
   * Canal `auth:setAdminCode` — enregistre le code administrateur chiffré (réservé au rôle `DEV`).
   *
   * @param {object} payload
   * @param {string} payload.requesterRole - Doit être `DEV`.
   * @param {string} payload.code - Nouveau code (min. 8 caractères).
   * @returns {Promise<{ success: true }>}
   * @throws {Error} Accès refusé ou code trop court.
   */
  handleIpcAuth("auth:setAdminCode", (payload) => {
    const { requesterRole, code } = payload;
    if (requesterRole !== "DEV") {
      throw new Error("Accès refusé : seul le compte Admin peut modifier le code administrateur.");
    }
    const newCode = String(code || "").trim();
    if (!newCode || newCode.length < 8) {
      throw new Error("Le code administrateur doit contenir au moins 8 caractères.");
    }
    const encFilePath = path.join(app.getPath("userData"), ADMIN_ENC_FILE_NAME);
    writeEncryptedAdminCode(encFilePath, newCode);
    const userStore = getUserStore();
    if (userStore) {
      userStore.devMasterCode = newCode;
      userStore.adminAccessSourcePath = encFilePath;
      userStore.adminAccessEnabled = true;
    }
    return { success: true };
  });

  /**
   * Canal `auth:firstLogin` — finalisation de la première connexion (mot de passe définitif).
   *
   * @param {object} payload - Données `userStore.completeFirstLogin`.
   * @returns {Promise<object>}
   */
  handleIpc("auth:firstLogin", (payload) => {
    ensureStore();
    return getUserStore().completeFirstLogin(payload);
  });

  /**
   * Canal `auth:logout` — révoque le jeton de session côté main process.
   *
   * @param {object} [payload]
   * @param {string} [payload.sessionToken] - Jeton à invalider.
   * @returns {Promise<{ success: true }>}
   */
  handleIpc("auth:logout", (payload) => {
    revokeSession(payload?.sessionToken);
    return { success: true };
  });
}

module.exports = {
  registerAuthIpcHandlers
};
