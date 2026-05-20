/**
 * Jetons Word du type {resp_<slug>_ouvertures} — dérivé du nom affiché (référentiel Fransor).
 * Ex. « Mr Fahed Georges » → slug « fahed_georges » (minuscules, sans préfixe de civilité).
 */
export function fransorResponsableWordSlug(displayName: string): string {
  let s = String(displayName || "").trim();
  s = s.replace(/^(m\.|mme|mr\.?|madame|monsieur)\s+/i, "");
  try {
    const ascii = s.normalize("NFD").replace(/\p{M}/gu, "");
    const slug = ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    return slug || "responsable";
  } catch {
    return "responsable";
  }
}
