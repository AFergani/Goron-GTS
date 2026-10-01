/**
 * Référentiel unique des libellés d’audit (journal + filtres) pour éviter les « Action non référencée ».
 *
 * Toute nouvelle action backend métier doit être ajoutée ici avant merge.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN: "Connexion utilisateur",
  AUTH_ACCOUNT_LOCKED: "[Utilisateurs] Compte verrouillé après échecs de connexion",
  AUTH_SET_PASSWORD: "Changement de mot de passe",
  AUTH_FIRST_LOGIN_COMPLETED: "Première connexion finalisée",
  AUTH_ACCOUNT_AUTO_UNLOCKED: "[Utilisateurs] Déverrouillage automatique après expiration du blocage",
  USER_UNLOCK: "[Utilisateurs] Déverrouillage de compte",
  USER_PREFERENCES_THEME_UPDATE: "[Utilisateurs] Changement de thème (clair / sombre)",
  USERS_LIST: "Consultation de la liste utilisateurs",
  USER_CREATE: "[Utilisateurs] Création d'un utilisateur",
  USER_RESET_PASSWORD: "[Utilisateurs] Réinitialisation du mot de passe",
  USER_RESET_PASSWORD_PEER: "[Utilisateurs] Réinitialisation validée par un collègue présent",
  USER_UPDATE_ROLE: "Modification du rôle utilisateur",
  USER_UPDATE_PROFILE: "[Utilisateurs] Modification d'un utilisateur",
  USER_UPDATE_ACCESS: "Modification des accès utilisateur",
  USER_DEACTIVATE: "[Utilisateurs] Désactivation d'un utilisateur",
  USER_REACTIVATE: "[Utilisateurs] Réactivation d'un utilisateur",
  USER_DELETE_HARD: "[Utilisateurs] Désactivation définitive d'un utilisateur",
  DATA_SITE_CREATE: "Création de site",
  DATA_SITE_UPDATE: "Modification de site",
  DATA_SITE_DELETE: "Suppression de site",
  DATA_INTERVENANT_CREATE: "Création d'intervenant",
  DATA_INTERVENANT_UPDATE: "Modification d'intervenant",
  DATA_INTERVENANT_DELETE: "Suppression d'intervenant",
  DATA_SITE_PENDING_CREATE: "[Référentiels] Ajout d'un site en attente de validation",
  DATA_INTERVENANT_PENDING_CREATE: "[Référentiels] Ajout d'un intervenant en attente de validation",
  DATA_SITE_PENDING_RESOLVE: "[Référentiels] Validation d'un site en attente",
  DATA_INTERVENANT_PENDING_RESOLVE: "[Référentiels] Validation d'un intervenant en attente",
  DATA_SITE_PENDING_DELETE: "[Référentiels] Suppression d'un site en attente",
  DATA_INTERVENANT_PENDING_DELETE: "[Référentiels] Suppression d'un intervenant en attente",
  DATA_TYPE_CREATE: "Création de type d'anomalie",
  DATA_TYPE_UPDATE: "Modification de type d'anomalie",
  DATA_TYPE_DELETE: "Suppression de type d'anomalie",
  DATA_HOLIDAY_CREATE: "[Rondes] Ajout d'un jour férié",
  DATA_HOLIDAY_UPDATE: "[Rondes] Modification d'un jour férié",
  DATA_HOLIDAY_DELETE: "[Rondes] Suppression d'un jour férié",
  DATA_RONDE_MOTIF_CREATE: "[Référentiels] Création d'un motif de ronde",
  DATA_RONDE_MOTIF_UPDATE: "[Référentiels] Modification d'un motif de ronde",
  DATA_RONDE_MOTIF_DELETE: "[Référentiels] Suppression d'un motif de ronde",
  DATA_RONDE_PLANNED_PROFILE_CREATE: "[Référentiels] Création d'un profil de planification des rondes",
  DATA_RONDE_PLANNED_PROFILE_UPDATE: "[Référentiels] Modification d'un profil de planification des rondes",
  DATA_RONDE_PLANNED_PROFILE_DELETE: "[Référentiels] Suppression d'un profil de planification des rondes",
  DATA_RONDE_PLANNED_PROFILE_DEACTIVATE: "[Rondes] Désactivation d'un profil de planification (rondes clôturées liées)",
  DATA_RONDE_PLANNED_PROFILE_WORD_TEMPLATE_INSTALL:
    "[Référentiels] Installation du modèle Word d'un profil de planification des rondes",
  DATA_RONDE_PLANNED_PROFILE_PLANNING_END: "[Rondes] Fin de planification d'un profil (date de fin)",
  DATA_RONDE_PLANNED_PROFILE_VALIDATION: "[Rondes] Validation d'un profil de planification par un responsable",
  DATA_RONDE_PLANNED_PROFILE_CANCEL_REQUEST: "[Rondes] Demande d'annulation d'un flux contractuel",
  DATA_RONDE_PLANNED_PROFILE_CANCEL_REQUEST_APPROVE: "[Rondes] Acceptation d'une demande d'annulation de flux",
  DATA_RONDE_PLANNED_PROFILE_CANCEL_REQUEST_REJECT: "[Rondes] Refus d'une demande d'annulation de flux",
  DATA_RONDE_PLANNED_PROFILE_CLOSURE_UPDATE: "[Rondes] Modification des champs Word et clôture d'un profil de planification",
  DATA_FORM_VARIABLES_SAVE: "[Paramètres] Enregistrement des variables de formulaires et attributions",
  DATA_DOCUMENT_TEMPLATE_INSTALL: "[Référentiels] Copie d'un modèle Word dans data/templates",
  DATA_DOCUMENT_TEMPLATE_DELETE: "[Référentiels] Suppression d'un modèle Word personnalisé",
  DATA_DOCUMENT_TEMPLATE_RESTORE: "[Référentiels] Retour au modèle Word embarqué",
  DATA_TEMPLATE_ASSIGNMENT_CREATE: "[Paramètres] Attribution d'un modèle personnalisé",
  DATA_TEMPLATE_ASSIGNMENT_UPDATE: "[Paramètres] Modification d'une attribution de modèle personnalisé",
  DATA_TEMPLATE_ASSIGNMENT_DELETE: "[Paramètres] Suppression d'une attribution de modèle personnalisé",
  DATA_INTERVENTION_WORD_EXTRA_FIELDS_SAVE:
    "[Référentiels] Enregistrement des champs complémentaires export Word (interventions)",
  DATA_RONDE_PLANNED_INTERVENANT_REQUIRED: "[Référentiels] Prestataire obligatoire pour un profil de planification des rondes",
  DATA_RONDE_PLANNED_INTERVENANT_NOT_FOUND: "[Référentiels] Prestataire invalide (profil planification rondes)",
  DATA_RONDE_PLANNED_RANDOM_PERIOD: "[Référentiels] Période jour/nuit obligatoire (ronde aléatoire)",
  DATA_RONDE_PLANNED_RANGE_DATES: "[Référentiels] Dates de plage de planification incomplètes",
  DATA_RONDE_PLANNED_RANGE_ORDER: "[Référentiels] Ordre des dates de plage de planification invalide",
  DATA_RONDE_PLANNED_PLANNING_FROM_REQUIRED: "[Référentiels] Date de début de validité du profil de ronde obligatoire",
  DATA_RONDE_PLANNED_PLANNING_ORDER: "[Référentiels] Ordre des dates de validité du profil de ronde invalide",
  DATA_RONDE_PLANNED_RANDOM_WINDOW: "[Référentiels] Fenêtre horaire aléatoire invalide ou incomplète",
  DATA_RONDE_PLANNED_RANDOM_ROUNDS: "[Référentiels] Nombre de rondes aléatoires invalide",
  DATA_IMPORT_BATCH_RESULT: "[Référentiels] Import en masse — résumé des réussites",
  DATA_IMPORT_BATCH_ERROR_SUMMARY: "[Référentiels] Import en masse — résumé des erreurs",
  DATA_WRITER_CONFIG_GENERATED: "[Paramètres] Génération du fichier gts_writer-config.json",
  FRANSOR_RESPONSABLE_CREATE: "[Fransor] Ajout d'un responsable",
  FRANSOR_RESPONSABLE_UPDATE: "[Fransor] Modification d'un responsable",
  FRANSOR_RESPONSABLE_DELETE: "[Fransor] Suppression d'un responsable",
  FRANSOR_CLOSURE_CREATE: "[Fransor] Ajout d'une exception",
  FRANSOR_CLOSURE_UPDATE: "[Fransor] Modification d'une exception",
  FRANSOR_CLOSURE_DELETE: "[Fransor] Suppression d'une exception",
  FRANSOR_ENTRY_CREATE: "[Fransor] Ajout d'une saisie ouverture/fermeture",
  FRANSOR_ENTRY_UPDATE: "[Fransor] Modification d'une saisie ouverture/fermeture",
  MAIN_COURANTE_CREATE: "[Main courante] Création d'une information",
  MAIN_COURANTE_CREATE_IDEMPOTENT: "[Main courante] Création d'une information (idempotente)",
  MAIN_COURANTE_UPDATE_OPERATOR: "[Main courante] Modification d'une information (opérateur)",
  MAIN_COURANTE_MANAGER_SUIVRE: "[Main courante] Information marquée comme \"À suivre\"",
  MAIN_COURANTE_MANAGER_CLOTURE: "[Main courante] Information marquée comme \"Clôturée\"",
  MAIN_COURANTE_MANAGER_REOPEN: "[Main courante] Information rouverte",
  INTERVENTION_CREATE: "[Intervention] Création d'une intervention",
  INTERVENTION_CREATE_IDEMPOTENT: "[Intervention] Création d'une intervention (idempotente)",
  INTERVENTION_UPDATE: "[Intervention] Modification d'une intervention",
  INTERVENTION_CLOSE: "[Intervention] Intervention clôturée",
  INTERVENTION_REOPEN: "[Intervention] Intervention rouverte",
  INTERVENTION_CANCEL: "[Intervention] Intervention annulée",
  RONDE_CREATE: "[Rondes] Création d'une ronde",
  RONDE_CREATE_IDEMPOTENT: "[Rondes] Création d'une ronde (idempotente)",
  RONDE_UPDATE: "[Rondes] Modification d'une ronde",
  RONDE_CLOSE: "[Rondes] Ronde clôturée",
  RONDE_CANCEL: "[Rondes] Ronde annulée",
  RONDE_NON_EFFECTUEE: "[Rondes] Ronde marquée non effectuée",
  RONDE_REOPEN: "[Rondes] Ronde rouverte",
  RONDE_BATCH_CREATE: "[Rondes] Création en lot de demandes exceptionnelles",
  RONDE_BATCH_UPDATE: "[Rondes] Modification commune d’un lot de demandes exceptionnelles",
  RONDE_BATCH_CANCEL: "[Rondes] Annulation en lot d’un lot de demandes exceptionnelles",
  RONDE_BATCH_DELETE: "[Rondes] Suppression en lot d’un lot de demandes exceptionnelles",
  RONDE_BATCH_DELETE_REQUEST: "[Rondes] Demande de suppression d’un lot de rondes",
  RONDE_BATCH_DELETE_REQUEST_REJECT: "[Rondes] Refus d’une demande de suppression de lot",
  RONDE_BATCH_DELETE_REQUEST_APPROVE: "[Rondes] Acceptation d’une demande de suppression de lot",
  RONDE_EXCEPTIONAL_AUTO_CLOSE_BATCH: "[Rondes] Clôture automatique des rondes exceptionnelles échues",
  DB_QUARTER_ROTATION: "[Système] Rotation trimestrielle de la base active",
  DB_ACTIVE_SWITCH: "[Système] Changement manuel de base active",
  DB_ARCHIVE_SESSION_ENTER: "[Système] Ouverture d'une archive en mode édition",
  DB_ARCHIVE_SESSION_EXIT: "[Système] Retour à la base active locale",
  POSTGRES_CONFIG_SAVE: "[Base de données] Enregistrement de la connexion PostgreSQL",
  POSTGRES_BACKUP_FOLDER_SET: "[Base de données] Choix du dossier de sauvegarde PostgreSQL",
  POSTGRES_BACKUP_SETTINGS_SAVE: "[Base de données] Modification du planning de sauvegarde PostgreSQL",
  GARDIENNAGE_CREATE: "[Gardiennage] Création d'un gardiennage",
  GARDIENNAGE_BATCH_CREATE: "[Gardiennage] Création en lot d'un gardiennage planifié",
  GARDIENNAGE_BATCH_CANCEL: "[Gardiennage] Annulation en lot d'un gardiennage",
  GARDIENNAGE_UPDATE: "[Gardiennage] Modification d'un gardiennage",
  GARDIENNAGE_DELETE: "[Gardiennage] Suppression d'un gardiennage",
  GARDIENNAGE_BATCH_DELETE: "[Gardiennage] Suppression en lot d'un gardiennage",
  GARDIENNAGE_STATUS_PLANIFIE: "[Gardiennage] Gardiennage remis en planifié",
  GARDIENNAGE_STATUS_ACTIF: "[Gardiennage] Gardiennage activé",
  GARDIENNAGE_STATUS_CLOTURE: "[Gardiennage] Gardiennage clôturé",
  GARDIENNAGE_STATUS_ANNULE: "[Gardiennage] Gardiennage annulé",
  GARDIENNAGE_CANCELLATION_REQUEST: "[Gardiennage] Demande d'annulation",
  GARDIENNAGE_CANCELLATION_APPROVE: "[Gardiennage] Demande d'annulation acceptée",
  GARDIENNAGE_CANCELLATION_REJECT: "[Gardiennage] Demande d'annulation refusée",
  GARDIENNAGE_STATUS_CHANGE: "[Gardiennage] Changement de statut",
  GARDIENNAGE_REOPEN: "[Gardiennage] Gardiennage rouvert",
  GARDIENNAGE_AUTO_CLOSE_BATCH: "[Gardiennage] Clôture automatique des prestations échues",
  GARDIENNAGE_OPEN_ENDED_HORIZON_BATCH: "[Gardiennage] Prolongation automatique d'un gardiennage H24 jusqu'à nouvel ordre",
  VIDEO_REMARK_SNAPSHOT_CREATE: "[Remarques vidéo] Sauvegarde d'une remarque",
  VIDEO_REMARK_SNAPSHOT_UPDATE: "[Remarques vidéo] Mise à jour d'une remarque"
};

export function formatAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action;
}

export function formatAuditActionLabelOrUnknown(action: string): string {
  return AUDIT_ACTION_LABELS[action] || `Action non référencée (${action})`;
}

/** Famille affichée dans le journal (filtre + badge). */
export function resolveAuditFamily(action: string, label: string): string {
  const bracketMatch = label.match(/^\[([^\]]+)\]\s*/);
  if (bracketMatch) return bracketMatch[1];
  if (action.startsWith("MAIN_COURANTE_")) return "Main courante";
  if (action.startsWith("INTERVENTION_")) return "Intervention";
  if (action.startsWith("RONDE_")) return "Rondes";
  if (action.startsWith("GARDIENNAGE_")) return "Gardiennage";
  if (action.startsWith("FRANSOR_")) return "Fransor";
  if (action.startsWith("DATA_")) return "Référentiels";
  if (action.startsWith("USER_") || action.startsWith("USERS_") || action.startsWith("AUTH_")) return "Utilisateurs";
  return "Système";
}

/** Libellé FR du statut d’audit. */
export function formatAuditStatus(status: string): string {
  const labels: Record<string, string> = {
    SUCCESS: "Succès",
    ERROR: "Erreur",
    WARNING: "Avertissement",
    WARN: "Avertissement",
    PENDING: "En attente"
  };
  return labels[status] || status;
}
