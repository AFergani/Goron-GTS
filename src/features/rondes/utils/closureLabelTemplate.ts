/**
 * Même convention que les modèles Word (docxtemplater) : `{nom}`.
 * L'ancien format `{{nom}}` est toujours accepté pour les libellés déjà enregistrés.
 */
export type ClosureLabelContext = {
  siteCode: string;
  siteName: string;
  siteLabel: string;
  profileLabel: string;
  prestataire: string;
  /** Ouverture / Fermeture / Aléatoire jour · nuit (aperçu libellé). */
  typePassage?: string;
  /** Heure demandée du créneau planifié (profil). */
  heureDemandee?: string;
  /** Date de la journée de la ronde (JJ-MM-AAAA). */
  dateDuJour?: string;
  heureArrivee?: string;
  heureDepart?: string;
  numeroBon?: string;
  compteRendu?: string;
};

function escapeRegExpKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remplace `{key}` puis `{{key}}` par la même valeur. */
function replaceClosureTemplateToken(template: string, key: string, value: string): string {
  const k = escapeRegExpKey(key);
  let s = template;
  s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), value);
  s = s.replace(new RegExp(`\\{${k}\\}`, "g"), value);
  return s;
}

function opt(v: string | undefined): string {
  return String(v ?? "").trim();
}

export function resolveRondeClosureLabelTemplate(template: string, ctx: ClosureLabelContext): string {
  let s = String(template || "");
  s = replaceClosureTemplateToken(s, "site_code", ctx.siteCode);
  s = replaceClosureTemplateToken(s, "site_name", ctx.siteName);
  s = replaceClosureTemplateToken(s, "site_label", ctx.siteLabel);
  s = replaceClosureTemplateToken(s, "profil_label", ctx.profileLabel);
  s = replaceClosureTemplateToken(s, "profil_libelle", ctx.profileLabel);
  s = replaceClosureTemplateToken(s, "prestataire", ctx.prestataire);
  s = replaceClosureTemplateToken(s, "type_passage", opt(ctx.typePassage));
  s = replaceClosureTemplateToken(s, "heure_demandee", opt(ctx.heureDemandee));
  s = replaceClosureTemplateToken(s, "date_du_jour", opt(ctx.dateDuJour));
  s = replaceClosureTemplateToken(s, "heure_arrivee", opt(ctx.heureArrivee));
  s = replaceClosureTemplateToken(s, "heure_depart", opt(ctx.heureDepart));
  s = replaceClosureTemplateToken(s, "numero_bon", opt(ctx.numeroBon));
  s = replaceClosureTemplateToken(s, "compte_rendu", opt(ctx.compteRendu));
  return s;
}

/** Déduit nom affiché et code entre parenthèses depuis un libellé « Nom (CODE) ». */
export function splitSiteDisplayParts(siteDisplay: string): { namePart: string; codePart: string } {
  const raw = String(siteDisplay || "").trim();
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { namePart: m[1].trim(), codePart: m[2].trim() };
  return { namePart: raw, codePart: "" };
}
