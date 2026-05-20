const crypto = require("crypto");

function generateEntityId() {
  return crypto.randomUUID();
}

module.exports = { generateEntityId };
