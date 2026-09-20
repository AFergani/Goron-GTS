/**
 * Même convention que les modèles Word (docxtemplater) : `{nom}`.
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
  /** Date de la journée de la ronde (JJ/MM/AAAA). */
  dateDuJour?: string;
  heureArrivee?: string;
  heureDepart?: string;
  numeroBon?: string;
  compteRendu?: string;
};

function escapeRegExpKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remplace `{key}` par la valeur. */
function replaceClosureTemplateToken(template: string, key: string, value: string): string {
  const k = escapeRegExpKey(key);
  return template.replace(new RegExp(`\\{${k}\\}`, "g"), value);
}

function opt(v: string | undefined): string {
  return String(v ?? "").trim();
}

export function resolveRondeClosureLabelTemplate(template: string, ctx: ClosureLabelContext): string {
  let s = String(template || "");
  s = replaceClosureTemplateToken(s, "site", ctx.siteLabel);
  s = replaceClosureTemplateToken(s, "site_code", ctx.siteCode);
  s = replaceClosureTemplateToken(s, "site_name", ctx.siteName);
  s = replaceClosureTemplateToken(s, "profil_label", ctx.profileLabel);
  s = replaceClosureTemplateToken(s, "prestataire", ctx.prestataire);
  s = replaceClosureTemplateToken(s, "type_passage", opt(ctx.typePassage));
  s = replaceClosureTemplateToken(s, "heure_demandee", opt(ctx.heureDemandee));
  s = replaceClosureTemplateToken(s, "date_demande", opt(ctx.dateDuJour));
  s = replaceClosureTemplateToken(s, "heure_arrivee", opt(ctx.heureArrivee));
  s = replaceClosureTemplateToken(s, "heure_depart", opt(ctx.heureDepart));
  s = replaceClosureTemplateToken(s, "numero_bon", opt(ctx.numeroBon));
  s = replaceClosureTemplateToken(s, "compte_rendu", opt(ctx.compteRendu));
  return s;
}
