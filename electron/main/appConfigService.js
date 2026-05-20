function createAppConfigService(deps) {
  const { fs, appConfigPath } = deps;

  function readAppConfig() {
    if (!fs.existsSync(appConfigPath)) {
      return { dbPath: null };
    }
    try {
      return JSON.parse(fs.readFileSync(appConfigPath, "utf-8"));
    } catch {
      return { dbPath: null };
    }
  }

  function writeAppConfig(config) {
    fs.writeFileSync(appConfigPath, JSON.stringify(config, null, 2), "utf-8");
  }

  return {
    readAppConfig,
    writeAppConfig
  };
}

module.exports = {
  createAppConfigService
};
