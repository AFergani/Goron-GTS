/**
 * Contenu des modales d’aide modèles Word : jetons Docxtemplater `{nom}`.
 *
 * Pas de chemins techniques complets exposés en UI utilisateur.
 * Les modèles personnalisés (attribution par flux) réutilisent les mêmes jetons
 * que le modèle par défaut du flux correspondant.
 */

import type { FormTarget } from "../model/formVariables.types";
import type { TemplateFlowKind } from "../model/documentTemplates.types";

export type TemplateHelpVariable = { token: string; description: string };

export type TemplateHelpBlock = {
  title: string;
  intro?: string;
  variables: TemplateHelpVariable[];
  footerNote?: string;
};

/** Jetons communs à toutes les fiches — mêmes noms, mêmes libellés d’aide. */
const SHARED_DOCX_HELP_CORE: TemplateHelpVariable[] = [
  { token: "{site}", description: "Libellé site affiché sur la fiche (nom et code)." },
  { token: "{site_code}", description: "Code du site (extrait du libellé)." },
  { token: "{site_name}", description: "Nom du site, sans le code." },
  { token: "{adresse_site}", description: "Adresse du site, telle qu’enregistrée dans le référentiel. « — » si elle est vide." },
  { token: "{numeroFiche}", description: "Numéro métier de la fiche (JJMMAAAA-XX)." }
];

/** Jetons communs intervention / ronde (prestation terrain). */
const SHARED_DOCX_HELP_PRESTATION_HEAD: TemplateHelpVariable[] = [
  { token: "{prestataire}", description: "Nom du prestataire." },
  { token: "{motif}", description: "Motif de la demande." },
  { token: "{date_demande}", description: "Date de la demande (JJ/MM/AAAA)." },
  { token: "{heure_arrivee}", description: "Heure d’arrivée." },
  { token: "{heure_depart}", description: "Heure de départ." }
];

const SHARED_DOCX_HELP_PRESTATION_TAIL: TemplateHelpVariable[] = [
  { token: "{numero_bon}", description: "Numéro de bon d’intervention." },
  { token: "{compte_rendu}", description: "Compte rendu." }
];

const SHARED_DOCX_HELP_PRESTATION: TemplateHelpVariable[] = [
  ...SHARED_DOCX_HELP_PRESTATION_HEAD,
  ...SHARED_DOCX_HELP_PRESTATION_TAIL
];

/** Jetons Word ronde (contractuelle et exceptionnelle). */
const RONDE_DOCX_HELP_VARIABLES: TemplateHelpVariable[] = [
  ...SHARED_DOCX_HELP_CORE,
  ...SHARED_DOCX_HELP_PRESTATION_HEAD,
  { token: "{duree_minutes}", description: "Durée du passage ou « — »." },
  ...SHARED_DOCX_HELP_PRESTATION_TAIL,
  {
    token: "{type_passage}",
    description:
      "Type de passage, avec Ronde devant (Ronde aléatoire, Ronde d'ouverture, Ronde de fermeture, Ronde d'accompagnement). Facultatif si le récapitulatif de la demande suffit."
  },
  {
    token: "{consigne}",
    description:
      "Consigne écrite seule (notes du profil contractuel, ou consigne saisie sur une demande exceptionnelle). Sans le récapitulatif de programmation."
  },
  {
    token: "{resume_demande}",
    description:
      "Phrase lisible de la demande : origine, type de ronde, rythme, jours et période. Sans la consigne écrite ni la date de la demande."
  },
  { token: "{date_cloture}", description: "Date et heure réelles de clôture (JJ/MM/AAAA HH:mm)." }
];

export const DOCUMENT_TEMPLATE_HELP: Record<string, TemplateHelpBlock> = {
  "main-courante": {
    title: "Main courante — variables du modèle Word",
    intro:
      "Utilisez la syntaxe une accolade : {nom_du_jeton}. Le fichier attendu : main-courante-template.docx (dossier data/templates à côté de la base, prioritaire sur le modèle embarqué).",
    variables: [
      ...SHARED_DOCX_HELP_CORE,
      { token: "{date_creation}", description: "Date de création de l’entrée (JJ/MM/AAAA HH:mm)." },
      { token: "{operateur}", description: "Nom de l’opérateur ayant saisi l’information." },
      { token: "{responsable}", description: "Nom du responsable désigné." },
      { token: "{type_anomalie}", description: "Type d’anomalie." },
      { token: "{statut}", description: "État de la fiche (en attente, en cours, clôturé)." },
      { token: "{prise_en_compte}", description: "Date de prise en compte (JJ/MM/AAAA HH:mm) ou « — »." },
      { token: "{date_cloture}", description: "Date de clôture (JJ/MM/AAAA HH:mm) ou « — »." },
      { token: "{information_operateur}", description: "Texte de l’observation (opérateur ou responsable)." },
      { token: "{observation_responsable}", description: "Observation du responsable." }
    ]
  },
  intervention: {
    title: "Intervention — variables du modèle Word",
    intro:
      "Syntaxe {nom_du_jeton}. Fichier : intervention-template.docx dans data/templates. Les champs complémentaires configurés ci‑dessous sont disponibles sous la forme {clé} (ex. {reference_client}).",
    variables: [
      ...SHARED_DOCX_HELP_CORE,
      ...SHARED_DOCX_HELP_PRESTATION,
      { token: "{heure_demande}", description: "Heure de l’appel / demande." },
      { token: "{delai_minutes}", description: "Délai d’arrivée (ex. « 15 Minutes ») ou « — »." }
    ],
    footerNote:
      "Les variables définies dans « Champs complémentaires export » utilisent exactement le nom de variable indiqué (ex. {ma_reference})."
  },
  ronde: {
    title: "Ronde contractuelle — modèle par défaut (ronde-template.docx)",
    intro:
      "Utilisé si aucun fichier modèle lié au libellé du profil (nom du type slug_template.docx) n’est présent. Ordre de secours : modèle du profil, puis ronde-template.docx, puis export texte généré. Même syntaxe d’accolades {jeton} (Docxtemplater).",
    variables: [...RONDE_DOCX_HELP_VARIABLES],
    footerNote:
      "Chaque champ de clôture du profil est aussi disponible sous sa clé : {ma_clef}."
  },
  "pv-video": {
    title: "PV Vidéo — modèle par défaut (PV-Video-template.docx)",
    intro:
      "Syntaxe {nom_du_jeton}. Fichier : PV-Video-template.docx. Une copie dans data/templates remplace le modèle embarqué. La ligne des caméras se répète entre {#cameras} et {/cameras}. Les photos utilisent {%photo_camera} et {%capture_globale}.",
    variables: [
      { token: "{site}", description: "Libellé site affiché sur la fiche (nom et code)." },
      { token: "{site_code}", description: "Code du site." },
      { token: "{site_name}", description: "Nom du site, sans le code." },
      { token: "{adresse_site}", description: "Adresse du site, telle qu’enregistrée dans le référentiel." },
      { token: "{date_raccordement}", description: "Date de raccordement (JJ/MM/AAAA)." },
      { token: "{responsable_tls}", description: "Nom du responsable TLS." },
      { token: "{technicien}", description: "Nom et téléphone du technicien." },
      { token: "{code_transmetteur}", description: "Code transmetteur." },
      { token: "{methode_connexion}", description: "« Logiciel : … ». « VPN : … » s'ajoute lorsque le nom du VPN est renseigné." },
      { token: "{enregistreur}", description: "Marque et modèle de l’enregistreur." },
      { token: "{adresse_ip}", description: "Adresse IP de l’enregistreur." },
      { token: "{port}", description: "Port de l’enregistreur." },
      { token: "{login}", description: "« Login : » suivi de l'identifiant, en clair dans le document." },
      { token: "{mot_de_passe}", description: "« Mot de passe : » suivi du mot de passe, en clair dans le document." },
      { token: "{nombre_cameras}", description: "Nombre de caméras, égal au nombre de lignes du listing." },
      { token: "{#cameras}", description: "Début de la ligne qui se répète pour chaque caméra. À placer dans la première cellule." },
      { token: "{numero_camera}", description: "Numéro de la caméra, selon l'ordre de la ligne (1, 2, 3…)." },
      { token: "{intitule_camera}", description: "Intitulé de la caméra." },
      {
        token: "{information_camera}",
        description: "Texte de la case Information. Vide si seule la photo est présente. « — » s'il n'y a ni texte ni photo."
      },
      { token: "{%photo_camera}", description: "Photo de la caméra, absente du document s'il n'y en a pas." },
      { token: "{/cameras}", description: "Fin de la ligne caméra. À placer dans la dernière cellule, après la photo." },
      { token: "{%capture_globale}", description: "Photo d’ensemble du site, seule au centre de la dernière page." }
    ]
  },
  "custom-docx": {
    title: "Modèle personnalisé (.docx)",
    intro:
      "Fichier placé dans data/templates (souvent copié depuis la gestion des profils de ronde contractuelle). Pour une ronde, les jetons par défaut sont alignés sur l’export ronde (voir aide « Ronde »).",
    variables: [...RONDE_DOCX_HELP_VARIABLES],
    footerNote:
      "Les champs de clôture du profil utilisent la clé définie à la création du champ : {ma_clef}."
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
  if (kind === "RONDE_PLANIFIEE") return "ronde-planifiee";
  if (kind === "RONDE_EXCEPTIONNELLE") return "ronde-exceptionnelle";
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
  if (helpId === "ronde-planifiee") return ["RONDE_PLANIFIEE"];
  if (helpId === "ronde-exceptionnelle") return ["RONDE_EXCEPTIONNELLE"];
  if (helpId === "ronde" || helpId === "custom-docx") return ["RONDE_PLANIFIEE", "RONDE_EXCEPTIONNELLE"];
  return [];
}

/**
 * Bloc d’aide (jetons) pour un identifiant, y compris les variantes ronde.
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

/**
 * Type affiché pour un jeton système, calé sur le champ de la fiche.
 *
 * @param token - Jeton avec accolades, par exemple `{motif}`.
 * @param formTarget - Formulaire du bloc, pour les jetons dont le champ diffère.
 */
export function systemDocxVariableTypeLabel(token: string, formTarget: FormTarget | null): string {
  if (token === "{motif}") {
    return formTarget === "INTERVENTION" ? "Texte long" : "Liste déroulante";
  }
  const labels: Record<string, string> = {
    "{site}": "Texte court",
    "{site_code}": "Texte court",
    "{site_name}": "Texte court",
    "{adresse_site}": "Texte court",
    "{numeroFiche}": "Texte court",
    "{prestataire}": "Texte court",
    "{date_demande}": "Date",
    "{heure_demande}": "Heure",
    "{heure_arrivee}": "Date et heure",
    "{heure_depart}": "Date et heure",
    "{numero_bon}": "Texte court",
    "{compte_rendu}": "Texte long",
    "{delai_minutes}": "Nombre",
    "{duree_minutes}": "Nombre",
    "{type_passage}": "Liste déroulante",
    "{consigne}": "Texte long",
    "{resume_demande}": "Texte long",
    "{date_cloture}": "Date et heure",
    "{date_creation}": "Date et heure",
    "{operateur}": "Texte court",
    "{responsable}": "Texte court",
    "{type_anomalie}": "Liste déroulante",
    "{statut}": "Texte court",
    "{prise_en_compte}": "Date et heure",
    "{information_operateur}": "Texte long",
    "{observation_responsable}": "Texte long",
    "{date_raccordement}": "Date",
    "{responsable_tls}": "Texte court",
    "{technicien}": "Texte court",
    "{code_transmetteur}": "Texte court",
    "{methode_connexion}": "Texte court",
    "{enregistreur}": "Texte court",
    "{adresse_ip}": "Texte court",
    "{port}": "Texte court",
    "{login}": "Texte court",
    "{mot_de_passe}": "Texte court",
    "{nombre_cameras}": "Nombre",
    "{#cameras}": "Liste",
    "{numero_camera}": "Texte court",
    "{intitule_camera}": "Texte court",
    "{information_camera}": "Texte long",
    "{%photo_camera}": "Image",
    "{/cameras}": "Liste",
    "{%capture_globale}": "Image"
  };
  return labels[token] || "Texte court";
}

/** Retire les jetons déjà listés ailleurs (en général le bloc commun). */
function variablesExcept(
  variables: TemplateHelpVariable[],
  excluded: TemplateHelpVariable[]
): TemplateHelpVariable[] {
  const skip = new Set(excluded.map((item) => item.token));
  return variables.filter((item) => !skip.has(item.token));
}

export type DocxVariableGroup = {
  id: string;
  title: string;
  hint: string;
  collapsedByDefault: boolean;
  /** `null` : bloc commun, sans variables personnalisées. */
  formTarget: FormTarget | null;
  systemVariables: TemplateHelpVariable[];
};

/** Blocs du récapitulatif Paramètres → Variables. Le gardiennage n’a pas d’export Word. */
export const DOCX_VARIABLE_GROUPS: DocxVariableGroup[] = [
  {
    id: "commun",
    title: "Commun",
    hint: "Communes à tous les formulaires qui ont un export Word.",
    collapsedByDefault: false,
    formTarget: null,
    systemVariables: SHARED_DOCX_HELP_CORE
  },
  {
    id: "intervention",
    title: "Intervention",
    hint: "En plus des variables communes.",
    collapsedByDefault: false,
    formTarget: "INTERVENTION",
    systemVariables: variablesExcept(DOCUMENT_TEMPLATE_HELP.intervention.variables, SHARED_DOCX_HELP_CORE)
  },
  {
    id: "ronde-planifiee",
    title: "Ronde contractuelle",
    hint: "En plus des variables communes.",
    collapsedByDefault: false,
    formTarget: "RONDE_PLANIFIEE",
    systemVariables: variablesExcept(RONDE_DOCX_HELP_VARIABLES, SHARED_DOCX_HELP_CORE)
  },
  {
    id: "ronde-exceptionnelle",
    title: "Ronde exceptionnelle",
    hint: "En plus des variables communes.",
    collapsedByDefault: false,
    formTarget: "RONDE_EXCEPTIONNELLE",
    systemVariables: variablesExcept(RONDE_DOCX_HELP_VARIABLES, SHARED_DOCX_HELP_CORE)
  },
  {
    id: "main-courante",
    title: "Main courante",
    hint: "En plus des variables communes.",
    collapsedByDefault: false,
    formTarget: "MAIN_COURANTE",
    systemVariables: variablesExcept(DOCUMENT_TEMPLATE_HELP["main-courante"].variables, SHARED_DOCX_HELP_CORE)
  },
  {
    id: "pv-video",
    title: "PV Vidéo",
    hint: "En plus des variables communes. Les photos sont {%photo_camera} et {%capture_globale}.",
    collapsedByDefault: true,
    formTarget: null,
    systemVariables: variablesExcept(DOCUMENT_TEMPLATE_HELP["pv-video"].variables, SHARED_DOCX_HELP_CORE)
  },
  {
    id: "gardiennage",
    title: "Gardiennage",
    hint: "Pas d’export Word pour le moment. Les champs créés ici sont enregistrés sur la fiche.",
    collapsedByDefault: true,
    formTarget: "GARDIENNAGE",
    systemVariables: []
  }
];
