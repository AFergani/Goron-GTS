/**
 * Contenu des modales d’aide modèles Word : jetons Docxtemplater `{nom}`.
 *
 * Pas de chemins techniques complets exposés en UI utilisateur.
 * Les modèles personnalisés (attribution par flux) réutilisent les mêmes jetons
 * que le modèle par défaut du flux correspondant.
 */

import type { FormTarget } from "../model/formVariables.types";
import type { TemplateFlowKind } from "../model/documentTemplates.types";

export type TemplateHelpBlock = {
  title: string;
  intro?: string;
  variables: Array<{ token: string; description: string }>;
  footerNote?: string;
};

export const DOCUMENT_TEMPLATE_HELP: Record<string, TemplateHelpBlock> = {
  "main-courante": {
    title: "Main courante — variables du modèle Word",
    intro:
      "Utilisez la syntaxe une accolade : {nom_du_jeton}. Le fichier attendu : main-courante-template.docx (dossier data/templates à côté de la base, prioritaire sur le modèle embarqué).",
    variables: [
      { token: "{date_creation}", description: "Date de création de l’entrée (format français)." },
      { token: "{operateur}", description: "Nom de l’opérateur ayant saisi l’information." },
      { token: "{responsable}", description: "Nom du responsable désigné." },
      { token: "{site}", description: "Libellé site affiché." },
      { token: "{type_anomalie}", description: "Type d’anomalie." },
      { token: "{etat}", description: "État métier de la fiche." },
      { token: "{prise_en_compte}", description: "Date ou « — » si non prise en compte." },
      { token: "{date_cloture}", description: "Date de clôture ou « — »." },
      { token: "{information_operateur}", description: "Texte saisi par l’opérateur." },
      { token: "{observation_responsable}", description: "Observation du responsable." }
    ]
  },
  intervention: {
    title: "Intervention — variables du modèle Word",
    intro:
      "Syntaxe {nom_du_jeton}. Fichier : intervention-template.docx dans data/templates. Les champs complémentaires configurés ci‑dessous sont disponibles sous la forme {clé} (ex. {reference_client}).",
    variables: [
      { token: "{dateDemande}", description: "Date de la demande (JJ-MM-AAAA)." },
      { token: "{dateDemandeIso}", description: "Date ISO (AAAA-MM-JJ)." },
      { token: "{heureDemande}", description: "Heure de l’appel / demande." },
      { token: "{site}", description: "Site (libellé affiché)." },
      { token: "{motif}", description: "Motif de l’intervention." },
      { token: "{prestataire}", description: "Nom du prestataire." },
      { token: "{heureArrivee}", description: "Heure d’arrivée." },
      { token: "{heureDepart}", description: "Heure de départ." },
      { token: "{delaiMinutes}", description: "Délai en minutes ou « — »." },
      { token: "{delaiMinutesLabel}", description: "Libellé délai (ex. « 15 Minutes »)." },
      { token: "{numeroBonIntervention}", description: "Numéro de bon." },
      { token: "{compteRendu}", description: "Compte rendu / observation." },
      { token: "{statut}", description: "Statut (En cours / Clôturée / Annulée)." },
      { token: "{facturation}", description: "Facturable / Non facturable." }
    ],
    footerNote:
      "Les variables définies dans « Champs complémentaires export » utilisent exactement le nom de variable indiqué (ex. {ma_reference})."
  },
  gardiennage: {
    title: "Gardiennage — variables du modèle Word",
    intro:
      "Syntaxe {nom_du_jeton}. Fichier : gardiennage-template.docx dans data/templates. Les variables custom du sous-onglet Variables affectées à ce template sont listées automatiquement ci-dessous.",
    variables: [
      { token: "{site}", description: "Site (libellé affiché)." },
      { token: "{prestataire}", description: "Prestataire." },
      { token: "{dateDebut}", description: "Date de début de prestation." },
      { token: "{heureDebut}", description: "Heure de début prévue." },
      { token: "{dateFin}", description: "Date de fin de prestation." },
      { token: "{heureFin}", description: "Heure de fin prévue." },
      { token: "{statut}", description: "Statut (Planifié / Actif / Clôturé / Annulé)." },
      { token: "{consigne}", description: "Consignes / notes de la fiche." }
    ]
  },
  ronde: {
    title: "Ronde contractuelle — modèle par défaut (ronde-template.docx)",
    intro:
      "Utilisé si aucun fichier modèle lié au libellé du profil (nom du type slug_template.docx) n’est présent. Ordre de secours : modèle du profil, puis ronde-template.docx, puis export texte généré. Même syntaxe d’accolades {jeton} (Docxtemplater).",
    variables: [
      { token: "{site_label}", description: "Nom du site (code du site), libellé affiché sur la fiche." },
      { token: "{type_passage}", description: "Ouverture / Fermeture / Aléatoire jour · nuit (lié au type de ronde)." },
      { token: "{heure_demandee}", description: "Heure demandée issue du profil (ouverture / fermeture)." },
      { token: "{date_du_jour}", description: "Date de la journée de la ronde (JJ-MM-AAAA)." },
      { token: "{heure_arrivee}", description: "Heure d’arrivée." },
      { token: "{heure_depart}", description: "Heure de départ." },
      { token: "{numero_bon}", description: "N° bon." },
      { token: "{compte_rendu}", description: "Compte rendu." },
      { token: "{date_demande}", description: "Identique à date_du_jour (compatibilité anciens modèles)." },
      { token: "{prestataire}", description: "Prestataire." },
      { token: "{motif_type}", description: "Libellé du motif." },
      { token: "{motif_detail}", description: "Précision motif." },
      { token: "{motif}", description: "Motif agrégé." },
      { token: "{horaires_demande_obs}", description: "Observation demande / horaires." },
      { token: "{origine}", description: "Résumé origine." },
      { token: "{duree_minutes}", description: "Durée ou « — »." },
      { token: "{statut}", description: "État de la fiche." },
      { token: "{site_code}", description: "Code site (compatibilité)." },
      { token: "{site_name}", description: "Nom site (compatibilité)." },
      { token: "{profil_label}", description: "Libellé profil / site (compatibilité)." },
      { token: "{profil_libelle}", description: "Identique à profil_label (compatibilité)." }
    ],
    footerNote:
      "Chaque champ de clôture du profil est aussi disponible sous sa clé : {ma_clef}."
  },
  "custom-docx": {
    title: "Modèle personnalisé (.docx)",
    intro:
      "Fichier placé dans data/templates (souvent copié depuis la gestion des profils de ronde contractuelle). Pour une ronde contractuelle, les jetons par défaut sont alignés sur l’export ronde (voir aide « Ronde contractuelle »).",
    variables: [
      { token: "{site_label}", description: "Nom du site (code du site)." },
      { token: "{type_passage}", description: "Type de passage planifié." },
      { token: "{heure_demandee}", description: "Heure demandée (profil)." },
      { token: "{date_du_jour}", description: "Date de la journée (JJ-MM-AAAA)." },
      { token: "{heure_arrivee}", description: "Heure d’arrivée." },
      { token: "{heure_depart}", description: "Heure de départ." },
      { token: "{numero_bon}", description: "N° bon." },
      { token: "{compte_rendu}", description: "Compte rendu." }
    ],
    footerNote:
      "Les champs de clôture du profil utilisent la clé définie à la création du champ : {ma_clef}. Jetons historiques : site_code, profil_label, date_demande, etc."
  }
};

/**
 * Identifiant d’aide Word correspondant à un flux d’attribution personnalisée.
 *
 * @param flowKind - Flux métier choisi dans la modale d’attribution.
 * @returns Clé de `DOCUMENT_TEMPLATE_HELP` ou alias ronde (`ronde-planifiee` / `ronde-exceptionnelle`).
 */
export function helpIdFromFlowKind(flowKind: TemplateFlowKind | string): string {
  const kind = String(flowKind || "").trim().toUpperCase();
  if (kind === "INTERVENTION") return "intervention";
  if (kind === "GARDIENNAGE") return "gardiennage";
  if (kind === "RONDE_PLANIFIEE") return "ronde-planifiee";
  if (kind === "RONDE_EXCEPTIONNELLE") return "ronde-exceptionnelle";
  return "custom-docx";
}

/**
 * Identifiant d’aide Word déduit du nom de fichier modèle (défaut ou attribution scopée).
 *
 * @param fileName - Nom du fichier `.docx`.
 * @returns Clé d’aide du flux, alias ronde, ou `custom-docx` pour un fichier non rattaché.
 */
export function helpIdFromTemplateFileName(fileName: string): string {
  const name = String(fileName || "").trim().toLowerCase();
  if (name === "intervention-template.docx" || name.startsWith("intervention_")) return "intervention";
  if (name === "gardiennage-template.docx" || name.startsWith("gardiennage_")) return "gardiennage";
  if (name === "main-courante-template.docx") return "main-courante";
  if (name === "ronde-template.docx") return "ronde";
  if (name.startsWith("ronde_planifiee_")) return "ronde-planifiee";
  if (name.startsWith("ronde_exceptionnelle_")) return "ronde-exceptionnelle";
  return "custom-docx";
}

/**
 * Formulaires métier dont les variables custom s’ajoutent à l’aide du modèle.
 *
 * @param helpId - Identifiant d’aide Word.
 * @returns Cibles `FormTarget` à filtrer dans la liste des variables custom.
 */
export function helpIdToFormTargets(helpId: string): FormTarget[] {
  if (helpId === "main-courante") return ["MAIN_COURANTE"];
  if (helpId === "intervention") return ["INTERVENTION"];
  if (helpId === "gardiennage") return ["GARDIENNAGE"];
  if (helpId === "ronde-planifiee") return ["RONDE_PLANIFIEE"];
  if (helpId === "ronde-exceptionnelle") return ["RONDE_EXCEPTIONNELLE"];
  if (helpId === "ronde" || helpId === "custom-docx") return ["RONDE_PLANIFIEE", "RONDE_EXCEPTIONNELLE"];
  return [];
}

/**
 * Bloc d’aide (jetons) pour un identifiant, y compris les alias ronde.
 *
 * @param helpId - Identifiant d’aide Word.
 * @returns Bloc d’aide ou `undefined` si inconnu.
 */
export function resolveDocumentTemplateHelpBlock(helpId: string): TemplateHelpBlock | undefined {
  const direct = DOCUMENT_TEMPLATE_HELP[helpId];
  if (direct) return direct;
  const rondeBase = DOCUMENT_TEMPLATE_HELP.ronde;
  if (!rondeBase) return undefined;
  if (helpId === "ronde-planifiee") {
    return {
      ...rondeBase,
      title: "Ronde contractuelle — variables du modèle Word",
      intro:
        "Un modèle personnalisé de ronde contractuelle utilise les mêmes champs que le modèle par défaut (ronde-template.docx). Syntaxe {nom_du_jeton}."
    };
  }
  if (helpId === "ronde-exceptionnelle") {
    return {
      ...rondeBase,
      title: "Ronde exceptionnelle — variables du modèle Word",
      intro:
        "Un modèle personnalisé de ronde exceptionnelle utilise les mêmes champs que le modèle par défaut des rondes. Syntaxe {nom_du_jeton}."
    };
  }
  return undefined;
}
