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

  handleIpc("auth:login", (payload) => {
    ensureStore();
    const userStore = getUserStore();
    const result = userStore.login(payload);
    const sessionToken = createSession(userStore.dbPath, result.user.username);
    return { ...result, sessionToken };
  });

  handleIpc("auth:getAdminAccessStatus", () => {
    ensureStore();
    return {
      enabled: Boolean(getUserStore().adminAccessEnabled)
    };
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

  handleIpc("auth:firstLogin", (payload) => {
    ensureStore();
    return getUserStore().completeFirstLogin(payload);
  });

  handleIpc("auth:logout", (payload) => {
    revokeSession(payload?.sessionToken);
    return { success: true };
  });
}

module.exports = {
  registerAuthIpcHandlers
};
