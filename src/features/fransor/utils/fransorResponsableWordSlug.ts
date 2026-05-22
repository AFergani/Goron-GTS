/**
 * Slug de nom pour les jetons Docxtemplater du récap Fransor Word.
 *
 * Produit un identifiant stable à partir du nom affiché : minuscules, underscores,
 * sans civilité (M., Mme, Mr…), accents retirés. Ex. « Mr Fahed Georges » → `fahed_georges`
 * pour des variables `{resp_fahed_georges_ouvertures}`, etc.
 *
 * Utilisé par : `fransorRecapWordExport`, aide modèles Word (Paramètres).
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
