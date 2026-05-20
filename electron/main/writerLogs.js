function createWriterLogsService(deps) {
  const {
    fs,
    path,
    fallbackWriterLogsDir,
    writerLogMaxFileBytes,
    writerLogMaxFiles,
    readAppConfig,
    resolveWriterConfigPath
  } = deps;

  function getWriterLogContext() {
    const appCfg = readAppConfig();
    const { configPath } = resolveWriterConfigPath();
    let logsDir = fallbackWriterLogsDir;
    if (configPath) {
      logsDir = path.join(path.dirname(configPath), "logs");
    } else if (appCfg.dbPath && fs.existsSync(appCfg.dbPath)) {
      logsDir = path.join(path.dirname(appCfg.dbPath), "logs");
    }
    const logFile = path.join(logsDir, "writer-transit.log");
    return { logsDir, logFile };
  }

  function rotateWriterTransitLogsIfNeeded(logFile) {
    if (!fs.existsSync(logFile)) return;
    const currentSize = fs.statSync(logFile).size;
    if (currentSize < writerLogMaxFileBytes) return;
    for (let index = writerLogMaxFiles - 1; index >= 1; index -= 1) {
      const sourcePath = path.join(path.dirname(logFile), `writer-transit.${index}.log`);
      const targetPath = path.join(path.dirname(logFile), `writer-transit.${index + 1}.log`);
      if (!fs.existsSync(sourcePath)) continue;
      if (index === writerLogMaxFiles - 1) {
        fs.unlinkSync(sourcePath);
        continue;
      }
      fs.renameSync(sourcePath, targetPath);
    }
    fs.renameSync(logFile, path.join(path.dirname(logFile), "writer-transit.1.log"));
  }

  function appendWriterTransitLog(entry) {
    const line = `${new Date().toISOString()} ${JSON.stringify(entry)}\n`;
    const writeTo = (logsDir) => {
      const logFile = path.join(logsDir, "writer-transit.log");
      fs.mkdirSync(logsDir, { recursive: true });
      rotateWriterTransitLogsIfNeeded(logFile);
      fs.appendFileSync(logFile, line, "utf-8");
    };
    try {
      writeTo(getWriterLogContext().logsDir);
    } catch {
      try {
        writeTo(fallbackWriterLogsDir);
      } catch {
        // Never block application flow because of logging issues.
      }
    }
  }

  return {
    getWriterLogContext,
    rotateWriterTransitLogsIfNeeded,
    appendWriterTransitLog
  };
}

module.exports = {
  createWriterLogsService
};
