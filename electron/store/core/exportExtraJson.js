/**
 * JSON des champs personnalisés (variables de formulaires) persisté sur les fiches.
 *
 * @module electron/store/core/exportExtraJson
 */

const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/i;

function parseExportExtraJson(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const k = String(key || "").trim();
      if (!k) continue;
      out[k] = String(value ?? "").trim();
    }
    return out;
  }
  if (raw == null || raw === "") return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parseExportExtraJson(parsed);
  } catch {
    return {};
  }
}

function stringifyExportExtraJson(raw) {
  const parsed = parseExportExtraJson(raw);
  const out = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!KEY_RE.test(key) && !["date_logique_passage", "date_logique", "transition_date"].includes(key)) continue;
    out[key] = String(value ?? "").trim().slice(0, 4000);
  }
  return JSON.stringify(out);
}

module.exports = {
  parseExportExtraJson,
  stringifyExportExtraJson
};
