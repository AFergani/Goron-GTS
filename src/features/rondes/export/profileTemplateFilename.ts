/**
 * Doit rester aligné avec `sanitizeProfileLabelForWordTemplateFilename` dans `electron/main.js`
 * (copie du fichier vers data/templates).
 */
export function sanitizeProfileLabelForWordTemplateFilename(label: string): string {
  const raw = String(label || "").trim();
  if (!raw) return "";
  try {
    const asciiLike = raw.normalize("NFD").replace(/\p{M}/gu, "");
    const slug = asciiLike
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return slug || "profil";
  } catch {
    const fallback = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return fallback || "profil";
  }
}

export function plannedProfileWordTemplateFileName(profileLabel: string): string {
  return `${sanitizeProfileLabelForWordTemplateFilename(profileLabel)}_template.docx`;
}
