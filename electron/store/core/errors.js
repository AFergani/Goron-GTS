class AppError extends Error {
  constructor(userMessage, code = "APP_ERROR", context = {}) {
    super(userMessage);
    this.userMessage = userMessage;
    this.code = code;
    this.context = context;
  }
}

function failWithLog(store, source, userMessage, code, details = {}) {
  store.logError({ source, code, messageFr: userMessage, details });
  throw new AppError(userMessage, code, details);
}

module.exports = { AppError, failWithLog };
